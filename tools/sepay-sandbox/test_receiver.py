import concurrent.futures
import hashlib
import hmac
import json
from pathlib import Path
import tempfile
import unittest
from receiver import connect, initialize, process_payload, verify_signature


class ReceiverTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.db = Path(self.temp.name) / "test.sqlite3"
        initialize(self.db)
        with connect(self.db) as con:
            con.execute("INSERT INTO orders(code,amount,expires_at) VALUES ('FTU123456',200000,2000)")
        self.payload = {"id": 101, "gateway": "Vietcombank", "accountNumber": "0000000001",
                        "code": "FTU123456", "content": "FTU123456", "transferType": "in", "transferAmount": 200000}

    def process(self, payload=None):
        payload = self.payload if payload is None else payload
        return process_payload(self.db, payload, json.dumps(payload).encode(), "0000000001", "Vietcombank", now=1000)

    def status(self):
        with connect(self.db) as con:
            return dict(con.execute("SELECT * FROM orders").fetchone())

    def test_correct_payment(self):
        self.assertEqual(self.process(), "paid")
        self.assertEqual(self.status()["status"], "paid")
        self.assertTrue(self.status()["ticket"].startswith("TEST-TICKET-"))

    def test_duplicate_and_concurrent_delivery_issues_one_ticket(self):
        with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
            results = list(pool.map(lambda _: self.process(), range(12)))
        self.assertEqual(results.count("paid"), 1)
        self.assertEqual(results.count("duplicate"), 11)
        with connect(self.db) as con:
            self.assertEqual(con.execute("SELECT COUNT(*) FROM deliveries").fetchone()[0], 1)

    def test_two_transactions_for_one_order(self):
        payload2 = dict(self.payload, id=102)
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(self.process, [self.payload, payload2]))
        self.assertCountEqual(results, ["paid", "order_already_paid"])

    def test_wrong_amount(self):
        self.assertEqual(self.process(dict(self.payload, transferAmount=100000)), "amount_mismatch")
        self.assertIsNone(self.status()["ticket"])

    def test_wrong_recipient_and_outgoing(self):
        self.assertEqual(self.process(dict(self.payload, accountNumber="OTHER")), "wrong_recipient")
        self.assertEqual(self.process(dict(self.payload, id=102, transferType="out")), "not_incoming")
        self.assertIsNone(self.status()["ticket"])

    def test_unknown_and_ambiguous_order(self):
        self.assertEqual(self.process(dict(self.payload, code=None, content="wrong")), "unknown_order")
        self.assertEqual(self.process(dict(self.payload, id=102, code=None, content="FTU123456 FTU123457")), "unknown_order")

    def test_expired_order(self):
        with connect(self.db) as con:
            con.execute("UPDATE orders SET expires_at=900")
        self.assertEqual(self.process(), "expired_order")
        self.assertIsNone(self.status()["ticket"])

    def test_conflicting_transaction_does_not_issue_again(self):
        self.assertEqual(self.process(), "paid")
        ticket = self.status()["ticket"]
        self.assertEqual(self.process(dict(self.payload, transferAmount=100000)), "transaction_conflict")
        self.assertEqual(self.status()["ticket"], ticket)

    def test_hmac_raw_bytes_and_expiry(self):
        raw, secret = json.dumps(self.payload).encode(), b"unit-test-only"
        headers = {"X-SePay-Timestamp": "1000", "X-SePay-Signature": "sha256=" + hmac.new(secret, b"1000." + raw, hashlib.sha256).hexdigest()}
        self.assertTrue(verify_signature(raw, headers, secret, now=1000))
        self.assertFalse(verify_signature(raw + b" ", headers, secret, now=1000))
        self.assertFalse(verify_signature(raw, headers, secret, now=1301))
        self.assertFalse(verify_signature(raw, {}, secret, now=1000))

    def test_send_test_sample_never_issues_ticket(self):
        self.assertEqual(self.process(dict(self.payload, id=0)), "sample_only")
        self.assertIsNone(self.status()["ticket"])


if __name__ == "__main__":
    unittest.main()
