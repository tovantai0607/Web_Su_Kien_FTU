import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router-dom';
import { z } from 'zod';
import { Button, Card, Field, Input, Badge, ErrorState, EmptyState } from '@ftu/ui';
import { PageTitle, DataState } from '../components/Content';
import { api, supabase, preview } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Turnstile } from '../components/Turnstile';
function Login() {
  const path = useLocation().pathname;
  const [mode, setMode] = useState(path.endsWith('dat-lai-mat-khau') ? 'reset' : 'login'),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [captcha, setCaptcha] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    if (preview || !supabase) {
      setError(
        'Đăng nhập thật khả dụng sau khi BTC hoàn tất cấu hình Supabase. Bản xem trước không tạo tài khoản.',
      );
      return;
    }
    setBusy(true);
    try {
      if (mode === 'reset') {
        if (password.length < 12) throw new Error('Dùng mật khẩu ít nhất 12 ký tự.');
        const { error: err } = await supabase.auth.updateUser({ password });
        if (err) throw err;
        setMessage('Đã cập nhật mật khẩu.');
      } else if (mode === 'forgot') {
        if (!z.string().email().safeParse(email).success) throw new Error('Email chưa hợp lệ.');
        await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: location.origin + '/tai-khoan/dat-lai-mat-khau',
          captchaToken: captcha,
        });
        setMessage('Nếu email hợp lệ, bạn sẽ nhận hướng dẫn đặt lại mật khẩu.');
      } else if (mode === 'signup') {
        if (password.length < 12) throw new Error('Dùng mật khẩu ít nhất 12 ký tự.');
        if (!captcha) throw new Error('Hoàn tất xác minh chống spam.');
        const { error: err } = await supabase.auth.signUp({
          email,
          password,
          options: { captchaToken: captcha, emailRedirectTo: location.origin + '/tai-khoan/ho-so' },
        });
        if (err) throw err;
        setMessage('Kiểm tra email để xác minh tài khoản nếu địa chỉ đủ điều kiện.');
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({
          email,
          password,
          options: { captchaToken: captcha },
        });
        if (err) throw new Error('Thông tin đăng nhập hoặc xác minh không hợp lệ.');
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page-shell narrow">
      <PageTitle
        label="Tài khoản FTUCharm"
        title={
          mode === 'signup'
            ? 'Bắt đầu câu chuyện của bạn.'
            : mode === 'forgot'
              ? 'Tìm lại quyền truy cập.'
              : mode === 'reset'
                ? 'Một mật khẩu mới.'
                : 'Chào mừng bạn trở lại.'
        }
      />
      <Card>
        <form onSubmit={(e) => void submit(e)}>
          {mode !== 'reset' && (
            <Field label="Email">
              <Input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
          )}
          {mode !== 'forgot' && (
            <Field
              label="Mật khẩu"
              hint={mode === 'signup' ? 'Ít nhất 12 ký tự, tránh mật khẩu đã sử dụng.' : undefined}
            >
              <Input
                required
                type="password"
                minLength={mode === 'signup' || mode === 'reset' ? 12 : 1}
                maxLength={128}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
          )}
          <Turnstile action="auth" onToken={setCaptcha} />
          {error && <ErrorState message={error} />}
          <p role="status">{message}</p>
          <Button disabled={busy}>
            {busy
              ? 'Đang xử lý…'
              : mode === 'signup'
                ? 'Tạo tài khoản'
                : mode === 'forgot'
                  ? 'Gửi hướng dẫn'
                  : mode === 'reset'
                    ? 'Đặt lại mật khẩu'
                    : 'Đăng nhập'}
          </Button>
        </form>
        <div className="auth-links">
          <button
            onClick={() => {
              setMode(mode === 'signup' ? 'login' : 'signup');
              setError('');
              setMessage('');
            }}
          >
            {mode === 'signup' ? 'Đã có tài khoản? Đăng nhập' : 'Chưa có tài khoản? Đăng ký'}
          </button>
          <button
            onClick={() => {
              setMode('forgot');
              setError('');
            }}
          >
            Quên mật khẩu
          </button>
        </div>
      </Card>
    </div>
  );
}
function Profile() {
  const { user } = useAuth();
  const [mfa, setMfa] = useState<{ id: string; qr: string } | null>(null),
    [code, setCode] = useState(''),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  const q = useQuery({
    queryKey: ['my-applications', user?.id],
    queryFn: () =>
      api<
        {
          id: string;
          code: string;
          full_name: string;
          status: string;
          note: string | null;
          contestants: { faculty: string; bio: string; talents: string };
        }[]
      >('/me/application'),
  });
  const notifications = useQuery({
    queryKey: ['notifications', user?.id],
    queryFn: () => api<{ id: string; title: string; body: string }[]>('/me/notifications'),
  });
  const [editing, setEditing] = useState<string | null>(null),
    [bio, setBio] = useState(''),
    [faculty, setFaculty] = useState(''),
    [talents, setTalents] = useState('');
  const labels: Record<string, string> = {
    pending: 'Chờ duyệt',
    approved: 'Đã duyệt',
    rejected: 'Không đủ điều kiện',
    needs_changes: 'Cần bổ sung',
  };
  async function enroll() {
    setError('');
    const { data, error: err } = await supabase!.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'FTUCharm',
    });
    if (err) {
      setError('Không thể tạo MFA. Hãy kiểm tra yếu tố đang có trong tài khoản.');
      return;
    }
    setMfa({ id: data.id, qr: data.totp.qr_code });
  }
  async function verify() {
    setError('');
    const { error: err } = await supabase!.auth.mfa.challengeAndVerify({ factorId: mfa!.id, code });
    if (err) setError('Mã MFA không hợp lệ.');
    else {
      setMessage('MFA đã xác minh. Bạn có thể mở phần quản trị nếu được cấp quyền.');
      setMfa(null);
    }
  }
  return (
    <div className="page-shell">
      <PageTitle
        label="Không gian của bạn"
        title="Hành trình đang viết tiếp."
        description={user?.email}
      />
      <div className="account-grid">
        <div>
          <DataState query={q} />
          {q.data?.length === 0 && (
            <EmptyState title="Chưa có hồ sơ đăng ký">
              <Link to="/dang-ky">Bắt đầu đăng ký</Link>
            </EmptyState>
          )}
          {q.data?.map((a) => (
            <Card key={a.id}>
              <Badge>{labels[a.status]}</Badge>
              <h2>{a.full_name}</h2>
              <p>
                Mã hồ sơ: <strong>{a.code}</strong>
              </p>
              {a.note && <p className="notice">{a.note}</p>}
              {a.status === 'needs_changes' && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditing(a.id);
                      setBio(a.contestants.bio);
                      setFaculty(a.contestants.faculty);
                      setTalents(a.contestants.talents);
                    }}
                  >
                    Bổ sung hồ sơ
                  </Button>
                  {editing === a.id && (
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        try {
                          await api('/me/application/' + a.id, {
                            method: 'PATCH',
                            body: JSON.stringify({ bio, faculty, talents }),
                          });
                          setEditing(null);
                          void q.refetch();
                        } catch (e) {
                          setError((e as Error).message);
                        }
                      }}
                    >
                      <Field label="Khoa">
                        <Input value={faculty} onChange={(e) => setFaculty(e.target.value)} />
                      </Field>
                      <Field label="Giới thiệu">
                        <textarea
                          className="input"
                          value={bio}
                          onChange={(e) => setBio(e.target.value)}
                        />
                      </Field>
                      <Field label="Tài năng">
                        <textarea
                          className="input"
                          value={talents}
                          onChange={(e) => setTalents(e.target.value)}
                        />
                      </Field>
                      <Button>Gửi bổ sung</Button>
                    </form>
                  )}
                </>
              )}
            </Card>
          ))}
          <h2>Thông báo từ ban tổ chức</h2>
          <DataState query={notifications} />
          {notifications.data?.map((n) => (
            <Card key={n.id}>
              <h3>{n.title}</h3>
              <p>{n.body}</p>
            </Card>
          ))}
        </div>
        <aside>
          <Card>
            <h2>Bảo vệ tài khoản</h2>
            <p>BTC và nhân viên cần xác thực hai bước trước khi truy cập quản trị.</p>
            <Button variant="outline" onClick={() => void enroll()}>
              Thiết lập MFA
            </Button>
            {mfa && (
              <>
                <img
                  src={'data:image/svg+xml;base64,' + btoa(mfa.qr)}
                  alt="Mã QR để thiết lập ứng dụng xác thực"
                  width="200"
                  height="200"
                />
                <Field label="Mã 6 chữ số">
                  <Input
                    inputMode="numeric"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />
                </Field>
                <Button onClick={() => void verify()}>Xác minh MFA</Button>
              </>
            )}
            {!mfa && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const { data } = await supabase!.auth.mfa.listFactors();
                  const factor = data?.totp.find((f) => f.status === 'verified');
                  if (!factor) {
                    setError('Chưa có MFA đã xác minh.');
                    return;
                  }
                  const { error: err } = await supabase!.auth.mfa.challengeAndVerify({
                    factorId: factor.id,
                    code,
                  });
                  if (err) setError('Mã MFA không hợp lệ.');
                  else setMessage('Phiên đã đạt MFA.');
                }}
              >
                <Field label="Xác minh MFA đã có">
                  <Input
                    inputMode="numeric"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="Mã 6 chữ số"
                  />
                </Field>
                <Button variant="ghost">Xác minh phiên</Button>
              </form>
            )}
            {error && <ErrorState message={error} />}
            <p role="status">{message}</p>
            <Link className="text-link" to="/admin">
              Mở quản trị
            </Link>
            <Button variant="ghost" onClick={() => void supabase!.auth.signOut()}>
              Đăng xuất
            </Button>
          </Card>
        </aside>
      </div>
    </div>
  );
}
export default function Account() {
  const { user, loading } = useAuth();
  if (loading) return <div className="page-shell">Đang kiểm tra phiên…</div>;
  return user ? <Profile /> : <Login />;
}
