import { useEffect, useState, type FormEvent } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Link } from 'react-router-dom';
import { Button, Card, Field, Input, ErrorState } from '@ftu/ui';
import { supabase } from '../lib/api';
import { useAuth } from '../lib/auth';
import { passwordError, safeAuthError } from '../lib/auth-policy';
import { Turnstile } from './Turnstile';

export default function AccountSecurity() {
  const { user, access, refreshAccess } = useAuth();
  const googleOnly =
    user?.app_metadata?.provider === 'google' &&
    !user.identities?.some((i) => i.provider === 'email');
  const [factor, setFactor] = useState<{ id: string; qr?: string } | null>(null);
  const [verified, setVerified] = useState(false);
  const [code, setCode] = useState('');
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [captcha, setCaptcha] = useState('');
  const [captchaVersion, setCaptchaVersion] = useState(0);
  const [nonce, setNonce] = useState('');
  const [needsNonce, setNeedsNonce] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    supabase?.auth.mfa
      .listFactors()
      .then((r) => {
        if (!active) return;
        if (r.error) {
          setError('Không thể kiểm tra MFA. Hãy tải lại trang.');
          return;
        }
        const existing = r.data.totp.find((f) => f.status === 'verified');
        if (existing) {
          setFactor({ id: existing.id });
          setVerified(true);
        }
      })
      .catch(() => {
        if (active) setError('Không thể kết nối. Hãy tải lại trang.');
      });
    return () => {
      active = false;
    };
  }, []);
  async function run(action: () => Promise<void>) {
    if (busy || !supabase) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể kết nối. Hãy thử lại.');
    } finally {
      setBusy(false);
    }
  }
  async function changePassword(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      const issue = passwordError(password);
      if (issue) throw new Error(issue);
      if (password !== confirm) throw new Error('Mật khẩu chưa khớp.');
      if (!current || !captcha || !user?.email)
        throw new Error('Nhập mật khẩu hiện tại và hoàn tất xác minh.');
      if (password === current) throw new Error('Chọn mật khẩu mới khác mật khẩu hiện tại.');
      const assurance = await supabase!.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assurance.error) throw new Error('Không thể kiểm tra phiên. Hãy đăng nhập lại.');
      if (assurance.data.nextLevel === 'aal2' && assurance.data.currentLevel !== 'aal2')
        throw new Error('Xác minh MFA trước khi đổi mật khẩu.');
      // Verify the current password in a separate, non-persistent session; preserve current MFA.
      const verifier = createClient(
        import.meta.env.VITE_SUPABASE_URL,
        import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
      );
      try {
        const result = await verifier.auth.signInWithPassword({
          email: user.email,
          password: current,
          options: { captchaToken: captcha },
        });
        if (result.error)
          throw new Error(
            safeAuthError(result.error, 'Mật khẩu hiện tại hoặc xác minh chưa đúng.'),
          );
        const updated = await supabase!.auth.updateUser({
          password,
          current_password: current,
          ...(nonce ? { nonce } : {}),
        });
        if (updated.error?.code === 'reauthentication_needed') {
          const reauth = await supabase!.auth.reauthenticate();
          if (reauth.error) throw new Error('Không thể gửi mã xác nhận. Hãy thử lại.');
          setNeedsNonce(true);
          setMessage('Nhập mã xác nhận trong email rồi lưu lại.');
          return;
        }
        if (updated.error)
          throw new Error(safeAuthError(updated.error, 'Không thể đổi mật khẩu. Hãy thử lại.'));
        setCurrent('');
        setPassword('');
        setConfirm('');
        setNonce('');
        const logout = await supabase!.auth.signOut({ scope: 'global' });
        if (logout.error)
          throw new Error('Mật khẩu đã đổi. Chưa thể thu hồi phiên; hãy thử đăng xuất lại.');
      } finally {
        await verifier.auth.signOut({ scope: 'local' }).catch(() => undefined);
        setCaptcha('');
        setCaptchaVersion((v) => v + 1);
      }
    });
  }
  return (
    <div id="bao-mat">
      <Card className="account-security">
        <h2>Bảo mật</h2>
        <p>{verified ? 'Xác thực hai bước đã bật.' : 'Xác thực hai bước là tùy chọn.'}</p>
        {!factor && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const result = await supabase!.auth.mfa.enroll({
                  factorType: 'totp',
                  friendlyName: 'FTUCHARM',
                });
                if (result.error) throw new Error('Không thể thiết lập MFA. Hãy thử lại.');
                setFactor({ id: result.data.id, qr: result.data.totp.qr_code });
              })
            }
          >
            Bật xác thực hai bước
          </Button>
        )}
        {factor && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                if (!/^\d{6}$/.test(code)) throw new Error('Nhập mã gồm 6 chữ số.');
                const result = await supabase!.auth.mfa.challengeAndVerify({
                  factorId: factor.id,
                  code,
                });
                setCode('');
                if (result.error)
                  throw new Error(safeAuthError(result.error, 'Mã không hợp lệ hoặc đã hết hạn.'));
                setVerified(true);
                refreshAccess?.();
                setFactor({ id: factor.id });
                setMessage('Đã xác minh hai bước.');
              });
            }}
          >
            {factor.qr && (
              <img
                src={
                  factor.qr.startsWith('data:')
                    ? factor.qr
                    : 'data:image/svg+xml;base64,' + btoa(factor.qr)
                }
                alt="Quét bằng ứng dụng xác thực"
                width="200"
                height="200"
              />
            )}
            <Field label="Mã 6 chữ số">
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                disabled={busy}
              />
            </Field>
            <Button disabled={busy} variant="outline">
              {verified ? 'Xác minh phiên' : 'Xác nhận MFA'}
            </Button>
            {!verified && (
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const result = await supabase!.auth.mfa.unenroll({ factorId: factor.id });
                    if (result.error) throw new Error('Không thể hủy thiết lập. Hãy thử lại.');
                    setFactor(null);
                    setCode('');
                  })
                }
              >
                Hủy thiết lập
              </Button>
            )}
          </form>
        )}
        {googleOnly ? (
          <p>
            Bạn đang đăng nhập bằng Google. Mật khẩu được quản lý trong tài khoản Google của bạn.
          </p>
        ) : (
          <form onSubmit={(e) => void changePassword(e)}>
            <h3>Đổi mật khẩu</h3>
            <Field label="Mật khẩu hiện tại">
              <Input
                type="password"
                autoComplete="current-password"
                required
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                disabled={busy}
              />
            </Field>
            <Field label="Mật khẩu mới" hint="12 ký tự trở lên, tối đa 72 byte.">
              <Input
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
              />
            </Field>
            <Field label="Nhập lại mật khẩu mới">
              <Input
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                disabled={busy}
              />
            </Field>
            {needsNonce && (
              <Field label="Mã xác nhận trong email">
                <Input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  value={nonce}
                  onChange={(e) => setNonce(e.target.value)}
                  disabled={busy}
                />
              </Field>
            )}
            <Turnstile key={captchaVersion} action="auth" onToken={setCaptcha} />
            <Button disabled={busy}>{busy ? 'Đang xử lý…' : 'Lưu mật khẩu'}</Button>
          </form>
        )}
        {error && <ErrorState message={error} />}
        <p role="status">{message}</p>
        {access?.is_admin && (
          <Link
            to={access.default_admin_path ?? '/admin/cau-hinh'}
            className="admin-action-link admin-action-primary"
          >
            Mở quản trị
          </Link>
        )}
      </Card>
    </div>
  );
}
