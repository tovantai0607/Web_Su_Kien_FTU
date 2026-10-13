import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import {
  Crown,
  Menu,
  X,
  ArrowUpRight,
  ArrowUp,
  Camera,
  MessageCircle,
  Pause,
  Play,
} from 'lucide-react';
import { Button, Spinner } from '@ftu/ui';
import { preview } from './lib/api';
import Home from './pages/Home';
import { useAuth } from './lib/auth';
import { MotionPage } from './components/Motion';
import { officialFacebook } from './config/site-content';
import { InterfaceMotion } from './components/interface/MotionSystem';
const PublicPages = lazy(() => import('./pages/PublicPages'));
const Registration = lazy(() => import('./pages/Registration'));
const Account = lazy(() => import('./pages/Account'));
const Voting = lazy(() => import('./pages/Voting'));
const Admin = lazy(() => import('./pages/Admin'));
const Tickets = lazy(() => import('./pages/Tickets'));
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
      '/gioi-thieu': 'Về FTUCharm',
      '/tin-tuc': 'Tin tức',
      '/thu-vien': 'Thư viện',
      '/nha-tai-tro': 'Nhà tài trợ',
      '/tai-khoan/dang-nhap': 'Đăng nhập',
      '/tai-khoan/dang-ky': 'Tạo tài khoản',
      '/tai-khoan/quen-mat-khau': 'Quên mật khẩu',
      '/tai-khoan/dat-lai-mat-khau': 'Đặt lại mật khẩu',
      '/tai-khoan/ho-so': 'Tài khoản',
      '/admin': 'Quản trị',
    };
    document.title = `${title[pathname] ?? 'Khám phá'} • FTUCharm`;
  }, [pathname]);
  return null;
}
export default function App() {
  const [menu, setMenu] = useState(false);
  const [motionPaused, setMotionPaused] = useState(false);
  const location = useLocation();
  const { user } = useAuth();
  useEffect(() => setMenu(false), [location.pathname]);
  useEffect(() => {
    document.documentElement.dataset.motion = motionPaused ? 'off' : 'on';
  }, [motionPaused]);
  return (
    <InterfaceMotion paused={motionPaused}>
      <ScrollReset />
      <div className="reading-progress" aria-hidden="true" />
      <a className="skip-link" href="#main">
        Đến nội dung chính
      </a>
      {preview && <div className="preview-bar">Bản xem trước · Chưa nhận đăng ký thật</div>}
      <header className="site-header">
        <Link to="/" className="brand" aria-label="FTUCharm, trang chủ">
          <Crown size={27} strokeWidth={1.3} />
          <span>
            ftu<span className="brand-italic">charm</span>
          </span>
        </Link>
        <nav
          className={menu ? 'main-nav is-open' : 'main-nav'}
          id="main-navigation"
          aria-label="Điều hướng chính"
        >
          <NavLink to="/" end>
            Trang chủ
          </NavLink>
          <NavLink to="/gioi-thieu">Về FTUCharm</NavLink>
          <NavLink to="/timeline">Hành trình</NavLink>
          <NavLink to="/thi-sinh">Thí sinh</NavLink>
          <NavLink to="/ve">Vé</NavLink>
          <NavLink to="/binh-chon">Bình chọn</NavLink>
          <NavLink to="/tin-tuc">Tin tức</NavLink>
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
            ftu<i>charm</i>
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
            <Link to="/tin-tuc">Tin tức</Link>
          </div>
          <div>
            <h3>Kết nối</h3>
            <a href={officialFacebook} target="_blank" rel="noreferrer">
              Fanpage chính thức <ArrowUpRight size={16} />
            </a>
            <Link to="/thu-vien">Những khoảnh khắc</Link>
            <div className="social-links">
              <a
                href={officialFacebook}
                target="_blank"
                rel="noreferrer"
                aria-label="Facebook FTUCharm"
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
              <a
                href="https://m.me/ftucharm.duyendangngoaithuong"
                target="_blank"
                rel="noreferrer"
                aria-label="Nhắn tin cho FTUCharm trên Messenger"
              >
                <MessageCircle size={21} />
              </a>
              <Link to="/thu-vien" aria-label="Thư viện ảnh FTUCharm">
                <Camera size={21} />
              </Link>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} FTUCharm • Duyên dáng Ngoại thương</span>
          <div>
            <button
              className="motion-toggle"
              onClick={() => setMotionPaused(!motionPaused)}
              aria-pressed={motionPaused}
            >
              {motionPaused ? <Play size={14} /> : <Pause size={14} />}{' '}
              {motionPaused ? 'Bật chuyển động' : 'Dừng chuyển động'}
            </button>
            <Link to="/the-le">Thể lệ</Link>
            <Link to="/quyen-rieng-tu">Quyền riêng tư</Link>
            <Link to="/admin">Ban tổ chức</Link>
          </div>
        </div>
      </footer>
      <button
        className="back-to-top"
        aria-label="Về đầu trang"
        onClick={() =>
          window.scrollTo({
            top: 0,
            behavior:
              motionPaused || matchMedia('(prefers-reduced-motion: reduce)').matches
                ? 'instant'
                : 'smooth',
          })
        }
      >
        <ArrowUp size={19} />
      </button>
    </InterfaceMotion>
  );
}
