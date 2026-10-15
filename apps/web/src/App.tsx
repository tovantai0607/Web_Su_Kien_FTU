import { lazy, Suspense, useEffect, useState } from 'react';
import BrandMark from './components/BrandMark';
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { Menu, X, ArrowUpRight, ArrowUp, Mail, Phone } from 'lucide-react';
import { Button, Spinner } from '@ftu/ui';
import { preview } from './lib/api';
import Home from './pages/Home';
import { useAuth } from './lib/auth';
import { MotionPage } from './components/Motion';
import { officialFacebook, officialEmail, officialHotline } from './config/site-content';
import { InterfaceMotion, useSystemReducedMotion } from './components/interface/MotionSystem';
import { trackMobileScroll } from './components/interface/mobileScroll';
const PublicPages = lazy(() => import('./pages/PublicPages'));
const Registration = lazy(() => import('./pages/Registration'));
const Account = lazy(() => import('./pages/Account'));
const Voting = lazy(() => import('./pages/Voting'));
const Admin = lazy(() => import('./pages/Admin'));
const Tickets = lazy(() => import('./pages/PurchaseTickets'));
function ScrollReset() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    const title: Record<string, string> = {
      '/': 'Duyên dáng Ngoại thương',
      '/dang-ky': 'Đăng ký thí sinh',
      '/thi-sinh': 'Thí sinh',
      '/binh-chon': 'Bình chọn chung kết',
      '/ve': 'Thông tin vé',
      '/timeline': 'Hành trình',
      '/gioi-thieu': 'Về FTUCHARM',
      '/thu-vien': 'Thư viện',
      '/nha-tai-tro': 'Nhà tài trợ',
      '/tai-khoan/dang-nhap': 'Đăng nhập',
      '/tai-khoan/dang-ky': 'Tạo tài khoản',
      '/tai-khoan/quen-mat-khau': 'Quên mật khẩu',
      '/tai-khoan/dat-lai-mat-khau': 'Đặt lại mật khẩu',
      '/tai-khoan/ho-so': 'Tài khoản',
      '/admin': 'Quản trị',
    };
    document.title = `${title[pathname] ?? 'Khám phá'} • FTUCHARM (2027)`;
  }, [pathname]);
  return null;
}
export default function App() {
  useEffect(trackMobileScroll, []);
  const [menu, setMenu] = useState(false);
  const [allowMotion, setAllowMotion] = useState(() => {
    try {
      return localStorage.getItem('ftucharm-motion-override') === 'on';
    } catch {
      return false;
    }
  });
  const reduced = useSystemReducedMotion();
  const motionPaused = reduced && !allowMotion;
  const enableMotion = () => {
    setAllowMotion(true);
    try {
      localStorage.setItem('ftucharm-motion-override', 'on');
    } catch {
      /* The control also works when browser storage is unavailable. */
    }
  };
  const location = useLocation();
  useEffect(() => {
    const syncMotion = (event: StorageEvent) => {
      if (event.key === 'ftucharm-motion-override' || event.key === null) {
        setAllowMotion(event.newValue === 'on');
      }
    };
    window.addEventListener('storage', syncMotion);
    return () => window.removeEventListener('storage', syncMotion);
  }, []);
  const { user, access } = useAuth();
  useEffect(() => setMenu(false), [location.pathname]);
  useEffect(() => {
    document.documentElement.dataset.motion = motionPaused ? 'off' : 'on';
    document.documentElement.dataset.motionOverride = allowMotion ? 'on' : 'off';
  }, [motionPaused, allowMotion]);
  return (
    <InterfaceMotion paused={motionPaused} allowMotion={allowMotion}>
      <ScrollReset />
      <div className="reading-progress" aria-hidden="true" />
      <a className="skip-link" href="#main">
        Đến nội dung chính
      </a>
      {preview && <div className="preview-bar">Bản xem trước · Chưa nhận đăng ký thật</div>}
      <header className="site-header">
        <Link to="/" className="brand" aria-label="FTUCHARM, trang chủ">
          <BrandMark />
        </Link>
        <nav
          className={menu ? 'main-nav is-open' : 'main-nav'}
          id="main-navigation"
          aria-label="Điều hướng chính"
        >
          <NavLink to="/" end>
            Trang chủ
          </NavLink>
          <NavLink to="/gioi-thieu">Về FTUCHARM</NavLink>
          <NavLink to="/timeline">Hành trình</NavLink>
          <NavLink to="/thi-sinh">Thí sinh</NavLink>
          <NavLink className="registration-nav-link" to="/dang-ky">
            Đăng ký thí sinh
          </NavLink>
          <NavLink to="/ve">Vé</NavLink>
          <NavLink to="/binh-chon">Bình chọn</NavLink>
        </nav>
        <div className="header-actions">
          <Link className="account-link" to={user ? '/tai-khoan/ho-so' : '/tai-khoan/dang-nhap'}>
            {user ? 'Tài khoản' : 'Đăng nhập'}
          </Link>
          <Button asChild size="small">
            <Link to="/dang-ky">
              Dự thi <ArrowUpRight size={16} />
            </Link>
          </Button>
          <button
            className="menu-toggle"
            aria-label={menu ? 'Đóng menu' : 'Mở menu'}
            aria-expanded={menu}
            aria-controls="main-navigation"
            onClick={() => setMenu(!menu)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setMenu(false);
            }}
          >
            {menu ? <X /> : <Menu />}
          </button>
        </div>
      </header>
      {reduced && motionPaused && (
        <aside className="motion-notice" aria-label="Tùy chọn chuyển động">
          <span>Trình duyệt đang yêu cầu giảm chuyển động.</span>
          <button type="button" onClick={enableMotion}>
            Bật hiệu ứng cho trang này
          </button>
        </aside>
      )}
      <main id="main" tabIndex={-1}>
        <MotionPage key={location.pathname}>
          <Suspense
            fallback={
              <div className="page-shell">
                <Spinner />
              </div>
            }
          >
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/ve" element={<Tickets />} />
              <Route path="/ve/:eventSlug" element={<Tickets />} />
              <Route path="/dang-ky" element={<Registration />} />
              <Route path="/tai-khoan/*" element={<Account />} />
              <Route path="/binh-chon" element={<Voting />} />
              <Route path="/admin/*" element={<Admin />} />
              <Route path="*" element={<PublicPages />} />
            </Routes>
          </Suspense>
        </MotionPage>
      </main>
      <footer>
        <div className="footer-top">
          <Link className="footer-brand" to="/">
            <BrandMark />
            <span className="footer-edition">2027</span>
          </Link>
          <div>
            <h3>Khám phá</h3>
            <Link to="/gioi-thieu">Về cuộc thi</Link>
            <Link to="/timeline">Hành trình</Link>
            <Link to="/thi-sinh">Thí sinh</Link>
          </div>
          <div>
            <h3>Đồng hành</h3>
            <Link to="/ve">Thông tin vé</Link>
            <Link to="/nha-tai-tro">Nhà tài trợ</Link>
          </div>
          <div>
            <h3>Liên hệ BTC</h3>
            <a href={officialFacebook} target="_blank" rel="noreferrer">
              Fanpage chính thức <ArrowUpRight size={16} />
            </a>
            <a className="footer-email" href={`mailto:${officialEmail}`}>
              {officialEmail}
            </a>
            <a href={`tel:${officialHotline}`}>Hotline: {officialHotline}</a>
            <div className="social-links">
              <a
                href={officialFacebook}
                target="_blank"
                rel="noreferrer"
                aria-label="Facebook FTUCHARM"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="21"
                  height="21"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M13.6 22v-9h3l.5-3.5h-3.5V7.3c0-1 .3-1.7 1.8-1.7h1.9V2.5a25 25 0 0 0-2.8-.2c-2.8 0-4.7 1.7-4.7 4.8v2.4H6.7V13h3.1v9z" />
                </svg>
              </a>
              <a href={`mailto:${officialEmail}`} aria-label="Email ban tổ chức FTUCHARM">
                <Mail size={21} aria-hidden="true" />
              </a>
              <a href={`tel:${officialHotline}`} aria-label="Gọi hotline FTUCHARM">
                <Phone size={21} aria-hidden="true" />
              </a>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2027 FTUCHARM • Duyên dáng Ngoại thương</span>
          <div>
            <Link to="/the-le">Thể lệ</Link>
            <Link to="/quyen-rieng-tu">Quyền riêng tư</Link>
            {access?.is_admin && (
              <Link to={access.default_admin_path ?? '/admin/cau-hinh'}>Quản trị</Link>
            )}
          </div>
        </div>
      </footer>
      <button
        className="back-to-top"
        aria-label="Về đầu trang"
        onClick={() =>
          window.scrollTo({
            top: 0,
            behavior: motionPaused ? 'instant' : 'smooth',
          })
        }
      >
        <ArrowUp size={19} />
      </button>
    </InterfaceMotion>
  );
}
