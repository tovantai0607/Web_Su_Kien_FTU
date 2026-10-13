import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Crown, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { Button, Card, Field, Input, ErrorState } from '@ftu/ui';
import { preview, supabase } from '../lib/api';
import { useAuth } from '../lib/auth';
import { normalizeEmail, passwordError, safeAuthError } from '../lib/auth-policy';
import { Turnstile } from './Turnstile';

type Mode = 'login' | 'signup' | 'forgot' | 'reset' | 'mfa';
const titles: Record<Mode, string> = {
  login: 'Đăng nhập',
  signup: 'Tạo tài khoản',
  forgot: 'Quên mật khẩu',
  reset: 'Đặt lại mật khẩu',
  mfa: 'Xác thực hai bước',
};
export default function AuthForm() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { recovery, error: sessionError } = useAuth();
  const initial: Mode = pathname.endsWith('dat-lai-mat-khau')
    ? 'reset'
    : pathname.endsWith('dang-ky')
      ? 'signup'
      : pathname.endsWith('quen-mat-khau')
        ? 'forgot'
        : 'login';
  const [mode, setMode] = useState<Mode>(initial);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [captcha, setCaptcha] = useState('');
  const [captchaVersion, setCaptchaVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [factor, setFactor] = useState('');
  const [code, setCode] = useState('');
  useEffect(() => {
    setMode(initial);
    setPassword('');
    setConfirm('');
    setError('');
    setMessage('');
    setFieldErrors({});
    setShow(false);
    setCaptcha('');
    setCaptchaVersion((v) => v + 1);
  }, [initial]);
  const newPassword = mode === 'signup' || mode === 'reset';
  async function submit(event: FormEvent, resend = false) {
    event.preventDefault();
    if (busy) return;
    setError('');
    setMessage('');
    const invalid: Record<string, string> = {};
    let address = '';
    if (mode !== 'reset' && mode !== 'mfa') {
      try {
        address = normalizeEmail(email);
      } catch {
        invalid.email = 'Email chưa hợp lệ.';
      }
    }
    if (!resend && newPassword) {
      const issue = passwordError(password);
      if (issue) invalid.password = issue;
      if (confirm !== password) invalid.confirm = 'Mật khẩu chưa khớp.';
    }
    if (!resend && mode === 'login' && !password) invalid.password = 'Nhập mật khẩu.';
    if (mode === 'mfa' && !/^\d{6}$/.test(code)) invalid.code = 'Nhập mã gồm 6 chữ số.';
    setFieldErrors(invalid);
    if (Object.keys(invalid).length) return;
    if (preview || !supabase) {
      setError('Bản xem trước không tạo tài khoản.');
      return;
    }
    if (mode !== 'reset' && mode !== 'mfa' && !captcha) {
      setError('Hoàn tất xác minh để tiếp tục.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'reset') {
        if (!recovery)
          throw new Error('Liên kết đặt lại mật khẩu đã hết hạn. Hãy yêu cầu liên kết mới.');
        const result = await supabase.auth.updateUser({ password });
        if (result.error)
          throw new Error(
            safeAuthError(result.error, 'Không thể đổi mật khẩu. Hãy yêu cầu liên kết mới.'),
          );
        const signedOut = await supabase.auth.signOut({ scope: 'global' });
        if (signedOut.error)
          throw new Error(
            'Mật khẩu đã đổi. Chưa thể thu hồi các phiên khác; hãy thử đăng xuất lại.',
          );
        setPassword('');
        setConfirm('');
        setMode('login');
        setMessage('Đã đổi mật khẩu và đăng xuất. Hãy đăng nhập lại.');
      } else if (mode === 'mfa') {
        const result = await supabase.auth.mfa.challengeAndVerify({ factorId: factor, code });
        setCode('');
        if (result.error)
          throw new Error(safeAuthError(result.error, 'Mã không hợp lệ hoặc đã hết hạn.'));
        navigate('/tai-khoan/ho-so', { replace: true });
      } else if (resend) {
        const result = await supabase.auth.resend({
          type: 'signup',
          email: address,
          options: { captchaToken: captcha, emailRedirectTo: location.origin + '/tai-khoan/ho-so' },
        });
        if (result.error)
          throw new Error(safeAuthError(result.error, 'Không thể gửi email. Vui lòng thử lại.'));
        setMessage('Nếu địa chỉ đủ điều kiện, bạn sẽ nhận email xác minh.');
      } else if (mode === 'forgot') {
        const result = await supabase.auth.resetPasswordForEmail(address, {
          redirectTo: location.origin + '/tai-khoan/dat-lai-mat-khau',
          captchaToken: captcha,
        });
        if (result.error)
          throw new Error(
            safeAuthError(result.error, 'Không thể gửi hướng dẫn. Vui lòng thử lại.'),
          );
        setMessage('Nếu địa chỉ đủ điều kiện, bạn sẽ nhận liên kết đặt lại mật khẩu.');
      } else if (mode === 'signup') {
        const result = await supabase.auth.signUp({
          email: address,
          password,
          options: { captchaToken: captcha, emailRedirectTo: location.origin + '/tai-khoan/ho-so' },
        });
        setPassword('');
        setConfirm('');
        if (result.error)
          throw new Error(
            safeAuthError(
              result.error,
              'Không thể tạo tài khoản. Kiểm tra thông tin hoặc đăng nhập.',
            ),
          );
        // Configuration must require email confirmation; never accept an auto-confirmed signup.
        if (result.data.session) {
          await supabase.auth.signOut({ scope: 'local' });
          throw new Error('Đăng ký đang tạm khóa. Vui lòng liên hệ ban tổ chức.');
        }
        setMessage('Kiểm tra email để xác minh tài khoản.');
      } else {
        const result = await supabase.auth.signInWithPassword({
          email: address,
          password,
          options: { captchaToken: captcha },
        });
        setPassword('');
        if (result.error)
          throw new Error(safeAuthError(result.error, 'Email, mật khẩu hoặc xác minh chưa đúng.'));
        if (!result.data.user?.email_confirmed_at) {
          await supabase.auth.signOut({ scope: 'local' });
          throw new Error('Vui lòng xác minh email trước khi đăng nhập.');
        }
        const factors = await supabase.auth.mfa.listFactors();
        if (factors.error) {
          await supabase.auth.signOut({ scope: 'local' });
          throw new Error('Không thể kiểm tra xác thực hai bước. Hãy thử lại.');
        }
        const enrolled = factors.data.totp.find((f) => f.status === 'verified');
        if (enrolled) {
          setFactor(enrolled.id);
          setMode('mfa');
        } else navigate('/tai-khoan/ho-so', { replace: true });
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Không thể kết nối. Vui lòng thử lại.');
    } finally {
      setBusy(false);
      setCaptcha('');
      setCaptchaVersion((v) => v + 1);
    }
  }
  return (
    <div className="page-shell auth-shell">
      <div className="auth-identity" aria-hidden="true">
        <Crown size={44} strokeWidth={1} />
        <span>ftucharm</span>
      </div>
      <h1>{titles[mode]}</h1>
      <Card className="auth-card">
        <form onSubmit={(e) => void submit(e)} noValidate aria-busy={busy}>
          {mode !== 'reset' && mode !== 'mfa' && (
            <Field label="Email" error={fieldErrors.email}>
              <Input
                type="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                required
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={busy}
              />
            </Field>
          )}
          {mode !== 'forgot' && mode !== 'mfa' && (
            <>
              <Field
                label="Mật khẩu"
                error={fieldErrors.password}
                hint={newPassword ? '12 ký tự trở lên, tối đa 72 byte.' : undefined}
              >
                <Input
                  type={show ? 'text' : 'password'}
                  autoComplete={newPassword ? 'new-password' : 'current-password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={busy}
                />
              </Field>
              <button
                className="password-visibility"
                type="button"
                aria-pressed={show}
                onClick={() => setShow(!show)}
              >
                {show ? <EyeOff size={17} /> : <Eye size={17} />}
                {show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              </button>
            </>
          )}
          {newPassword && (
            <Field label="Nhập lại mật khẩu" error={fieldErrors.confirm}>
              <Input
                type={show ? 'text' : 'password'}
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                disabled={busy}
              />
            </Field>
          )}
          {mode === 'mfa' && (
            <Field
              label="Mã xác thực"
              error={fieldErrors.code}
              hint="Mở ứng dụng xác thực của bạn."
            >
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                disabled={busy}
              />
            </Field>
          )}
          {mode !== 'reset' && mode !== 'mfa' && (
            <Turnstile key={captchaVersion} action="auth" onToken={setCaptcha} />
          )}
          {(error || sessionError) && <ErrorState message={error || sessionError} />}
          {mode === 'reset' && !recovery && !preview && !error && !sessionError && (
            <ErrorState message="Liên kết không hợp lệ hoặc đã hết hạn. Hãy yêu cầu liên kết mới." />
          )}
          <p className="auth-status" role="status" aria-live="polite">
            {message}
          </p>
          <Button disabled={busy || (mode === 'reset' && !recovery && !preview)}>
            {busy
              ? 'Đang xử lý…'
              : mode === 'forgot'
                ? 'Gửi liên kết'
                : mode === 'reset'
                  ? 'Lưu mật khẩu'
                  : mode === 'mfa'
                    ? 'Xác minh'
                    : titles[mode]}
          </Button>
          {mode === 'signup' && message && (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={(e) => void submit(e, true)}
            >
              Gửi lại email xác minh
            </Button>
          )}
        </form>
        <div className="auth-links">
          {mode === 'login' ? (
            <>
              <Link to="/tai-khoan/dang-ky">Tạo tài khoản</Link>
              <Link to="/tai-khoan/quen-mat-khau">Quên mật khẩu?</Link>
            </>
          ) : mode === 'mfa' ? (
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const result = await supabase?.auth.signOut({ scope: 'local' });
                  if (result?.error) throw new Error('logout failed');
                  setMode('login');
                  setCode('');
                  setFactor('');
                  setError('');
                } catch {
                  setError('Không thể đăng xuất. Hãy thử lại.');
                } finally {
                  setBusy(false);
                }
              }}
            >
              Hủy đăng nhập
            </button>
          ) : (
            <Link to="/tai-khoan/dang-nhap">Về đăng nhập</Link>
          )}
          {mode === 'reset' && !recovery && (
            <Link to="/tai-khoan/quen-mat-khau">Yêu cầu liên kết mới</Link>
          )}
        </div>
      </Card>
      <p className="auth-privacy">
        <ShieldCheck size={16} /> <Link to="/quyen-rieng-tu">Quyền riêng tư</Link>
      </p>
    </div>
  );
}
