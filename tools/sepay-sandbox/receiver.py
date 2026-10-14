"""Local SePay Test mode receiver. No real tickets, emails or bank transfers."""
import argparse
from contextlib import contextmanager
import ctypes
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import secrets
import sqlite3
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

STATE_DIR = Path(os.environ.get("LOCALAPPDATA", Path.home())) / "FTU-SePay-Test"
SCHEMA = """
CREATE TABLE IF NOT EXISTS orders (
 code TEXT PRIMARY KEY, amount INTEGER NOT NULL CHECK(amount > 0),
 expires_at INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid')),
 ticket TEXT UNIQUE
);
CREATE TABLE IF NOT EXISTS deliveries (
 transaction_id INTEGER PRIMARY KEY, received_at INTEGER NOT NULL,
 order_code TEXT, amount INTEGER NOT NULL, result TEXT NOT NULL,
 replay_count INTEGER NOT NULL DEFAULT 0, payload_sha256 TEXT NOT NULL
);
"""


def protect_secret(data, decrypt=False):
    """Protect sandbox credentials with the logged-in Windows user's DPAPI."""
    class Blob(ctypes.Structure):
        _fields_ = [("size", ctypes.c_ulong), ("data", ctypes.POINTER(ctypes.c_ubyte))]
    buf = ctypes.create_string_buffer(data)
    incoming = Blob(len(data), ctypes.cast(buf, ctypes.POINTER(ctypes.c_ubyte)))
    outgoing = Blob()
    if decrypt:
        ok = ctypes.windll.crypt32.CryptUnprotectData(
            ctypes.byref(incoming), None, None, None, None, 1, ctypes.byref(outgoing))
    else:
        ok = ctypes.windll.crypt32.CryptProtectData(
            ctypes.byref(incoming), "FTU SePay sandbox", None, None, None, 1,
            ctypes.byref(outgoing))
    if not ok:
        raise ctypes.WinError()
    try:
        return ctypes.string_at(outgoing.data, outgoing.size)
    finally:
        ctypes.windll.kernel32.LocalFree(outgoing.data)


def load_secret():
    return protect_secret((STATE_DIR / "webhook.dpapi").read_bytes(), decrypt=True)


@contextmanager
def connect(db):
    con = sqlite3.connect(db, timeout=15)
    con.row_factory = sqlite3.Row
    try:
        with con:
            yield con
    finally:
        con.close()


def initialize(db):
    with connect(db) as con:
        con.executescript(SCHEMA)


def verify_signature(raw, headers, secret, now=None):
    now = time.time() if now is None else now
    timestamp = headers.get("X-SePay-Timestamp", "")
    if not re.fullmatch(r"[0-9]{1,12}", timestamp):
        return False
    if abs(now - int(timestamp)) > 300:
        return False
    expected = "sha256=" + hmac.new(
        secret, timestamp.encode("ascii") + b"." + raw, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, headers.get("X-SePay-Signature", ""))


def process_payload(db, payload, raw, account, gateway, now=None):
    now = int(time.time()) if now is None else int(now)
    if not isinstance(payload, dict):
        raise ValueError("Object required")
    tid, amount = payload.get("id"), payload.get("transferAmount")
    if type(tid) is not int or tid < 0 or type(amount) is not int or amount <= 0:
        raise ValueError("Invalid transaction id or amount")
    # SePay's 'Send test' payload may use id=0. Acknowledge without issuing.
    if tid == 0:
        return "sample_only"
    code = payload.get("code")
    if not isinstance(code, str) or not re.fullmatch(r"FTU[0-9]{6}", code):
        codes = re.findall(r"(?<![A-Za-z0-9])FTU[0-9]{6}(?![A-Za-z0-9])",
                           str(payload.get("content", "")))
        code = codes[0] if len(codes) == 1 else None
    digest = hashlib.sha256(raw).hexdigest()
    with connect(db) as con:
        con.execute("BEGIN IMMEDIATE")
        existing = con.execute("SELECT payload_sha256 FROM deliveries WHERE transaction_id=?", (tid,)).fetchone()
        if existing:
            if existing["payload_sha256"] != digest:
                return "transaction_conflict"
            con.execute("UPDATE deliveries SET replay_count=replay_count+1 WHERE transaction_id=?", (tid,))
            return "duplicate"
        order = con.execute("SELECT * FROM orders WHERE code=?", (code,)).fetchone()
        if payload.get("accountNumber") != account or payload.get("gateway") != gateway:
            result = "wrong_recipient"
        elif payload.get("transferType") != "in":
            result = "not_incoming"
        elif not order:
            result = "unknown_order"
        elif amount != order["amount"]:
            result = "amount_mismatch"
        elif order["status"] == "paid":
            result = "order_already_paid"
        elif order["expires_at"] < now:
            result = "expired_order"
        else:
            result = "paid"
            con.execute("UPDATE orders SET status='paid',ticket=? WHERE code=?",
                        ("TEST-TICKET-" + secrets.token_hex(12), code))
        con.execute("INSERT INTO deliveries(transaction_id,received_at,order_code,amount,result,payload_sha256) VALUES (?,?,?,?,?,?)",
                    (tid, now, code, amount, result, digest))
        return result


def make_handler(db, secret, account, gateway):
    class Handler(BaseHTTPRequestHandler):
        def setup(self):
            super().setup()
            self.connection.settimeout(10)

        def reply(self, status, body):
            encoded = json.dumps(body).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(encoded)))
            self.end_headers()
            self.wfile.write(encoded)

        def do_GET(self):
            if self.path == "/health":
                self.reply(200, {"service": "ftu-sepay-sandbox", "mode": "test", "ok": True})
            else:
                self.reply(404, {"success": False})

        def do_POST(self):
            if self.path != "/hooks/sepay-payment":
                return self.reply(404, {"success": False})
            if self.headers.get("Content-Type", "").split(";")[0].strip() != "application/json":
                return self.reply(415, {"success": False})
            try:
                size = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                return self.reply(400, {"success": False})
            if not 0 < size <= 65536:
                return self.reply(413, {"success": False})
            raw = self.rfile.read(size)
            if not verify_signature(raw, self.headers, secret):
                return self.reply(401, {"success": False})
            try:
                result = process_payload(db, json.loads(raw), raw, account, gateway)
            except (ValueError, UnicodeError):
                return self.reply(422, {"success": False})
            except sqlite3.Error:
                return self.reply(503, {"success": False})
            # Business mismatches are persisted for review, not retried forever.
            print(json.dumps({"transaction_id": json.loads(raw).get("id"), "result": result}), flush=True)
            self.reply(200, {"success": True})

        def log_message(self, *args):
            pass  # Do not log request headers, secrets or personal payloads.
    return Handler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["init", "serve", "status"])
    parser.add_argument("--port", type=int, default=8787)
    args = parser.parse_args()
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    db = STATE_DIR / "sandbox.sqlite3"
    if args.command == "init":
        secret_path = STATE_DIR / "webhook.dpapi"
        if not secret_path.exists():
            secret_path.write_bytes(protect_secret(secrets.token_hex(32).encode()))
        config_path = STATE_DIR / "config.json"
        if not config_path.exists():
            config_path.write_text(json.dumps({"account": "0000000002", "gateway": "MBBank", "mode": "test"}), encoding="utf-8")
        initialize(db)
        with connect(db) as con:
            for code in ["FTU123456", "FTU123457"]:
                con.execute("INSERT OR IGNORE INTO orders(code,amount,expires_at) VALUES (?,?,?)",
                            (code, 200000, int(time.time()) + 86400))
        print("Sandbox initialized; secret protected with Windows DPAPI.")
    elif args.command == "status":
        with connect(db) as con:
            print(json.dumps({"mode": "test", "orders": [dict(r) for r in con.execute("SELECT * FROM orders")],
                              "deliveries": [dict(r) for r in con.execute("SELECT transaction_id,order_code,amount,result,replay_count FROM deliveries")]}, indent=2))
    else:
        config = json.loads((STATE_DIR / "config.json").read_text(encoding="utf-8"))
        if config.get("mode") != "test":
            raise SystemExit("Only Test mode is supported.")
        initialize(db)
        server = ThreadingHTTPServer(("127.0.0.1", args.port), make_handler(db, load_secret(), config["account"], config["gateway"]))
        server.daemon_threads = True
        print(f"Sandbox listening on 127.0.0.1:{args.port}", flush=True)
        server.serve_forever()


if __name__ == "__main__":
    main()
