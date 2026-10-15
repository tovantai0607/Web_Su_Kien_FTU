import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, ErrorState } from '@ftu/ui';
import { useAuth } from '../lib/auth';
import BrandMark from './BrandMark';
import { registrationDrafts } from '../lib/registration-draft';

/** detectSessionInUrl in the single Supabase client owns PKCE exchange, including StrictMode. */
export default function OAuthCallback() {
  const { user, loading, error } = useAuth();
  const navigate = useNavigate();
  const [denied] = useState(() => new URLSearchParams(window.location.search).has('error'));
  const [timedOut, setTimedOut] = useState(false);
  const [returnTo] = useState(() =>
    registrationDrafts.hasLoginReturn() ? '/dang-ky' : '/tai-khoan/ho-so',
  );
  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), 20000);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!loading && !denied && !error && user) {
      registrationDrafts.consumeLoginReturn();
      navigate(returnTo, { replace: true });
    }
    if (!loading) window.history.replaceState(window.history.state, '', window.location.pathname);
  }, [loading, denied, error, user, navigate, returnTo]);
  const message = denied
    ? 'Bạn đã hủy đăng nhập Google hoặc chưa cấp quyền. Hãy thử lại.'
    : timedOut
      ? 'Không thể hoàn tất đăng nhập. Kiểm tra kết nối và thử lại.'
      : error ||
        (!loading && !user ? 'Liên kết đăng nhập đã hết hạn hoặc không hợp lệ. Hãy thử lại.' : '');
  return (
    <div className="page-shell auth-shell">
      <div className="auth-identity" aria-hidden="true">
        <BrandMark />
      </div>
      <h1>Đăng nhập Google</h1>
      <Card className="auth-card">
        {message ? (
          <>
            <ErrorState message={message} />
            <Link className="text-link" to="/tai-khoan/dang-nhap" replace>
              Về đăng nhập
            </Link>
          </>
        ) : (
          <p role="status">Đang xác minh đăng nhập…</p>
        )}
      </Card>
    </div>
  );
}
