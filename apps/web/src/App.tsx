import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import {
  Crown,
  Menu,
  X,
  ArrowUpRight,
  Camera as Instagram,
  MessageCircle as Facebook,
} from 'lucide-react';
import { Button, Spinner } from '@ftu/ui';
import { preview } from './lib/api';
import Home from './pages/Home';
import { useAuth } from './lib/auth';
const PublicPages = lazy(() => import('./pages/PublicPages'));
const Registration = lazy(() => import('./pages/Registration'));
const Account = lazy(() => import('./pages/Account'));
const Voting = lazy(() => import('./pages/Voting'));
const Admin = lazy(() => import('./pages/Admin'));
function ScrollReset() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    const title: Record<string, string> = {
      '/': 'Duyên dáng Ngoại thương',
      '/dang-ky': 'Đăng ký thí sinh',
      '/thi-sinh': 'Thí sinh',
      '/binh-chon': 'Bình chọn chung kết',
      '/timeline': 'Hành trình',
      '/admin': 'Quản trị',
    };
    document.title = `${title[pathname] ?? 'Khám phá'} • FTUCharm`;
  }, [pathname]);
  return null;
}
export default function App() {
  const [menu, setMenu] = useState(false);
  const location = useLocation();
  const { user } = useAuth();
  useEffect(() => setMenu(false), [location.pathname]);
  return (
    <>
      <ScrollReset />
      <a className="skip-link" href="#main">
        Đến nội dung chính
      </a>
      {preview && (
        <div className="preview-bar">
          Bản thiết kế xem trước • Nội dung, lịch và hồ sơ minh họa • Không ghi dữ liệu thật
        </div>
      )}
      <header className="site-header">
        <Link to="/" className="brand" aria-label="FTUCharm, trang chủ">
          <Crown size={27} strokeWidth={1.3} />
          <span>
            ftu<span className="brand-italic">charm</span>
            <small>Duyên dáng Ngoại thương</small>
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
          <NavLink to="/binh-chon">Bình chọn</NavLink>
        </nav>
        <div className="header-actions">
          <Link className="account-link" to="/tai-khoan/ho-so">
            {user ? 'Tài khoản' : 'Đăng nhập'}
          </Link>
          <Button asChild size="small">
            <Link to="/dang-ky">
              Đăng ký <ArrowUpRight size={16} />
            </Link>
          </Button>
          <button
            className="menu-toggle"
            aria-label={menu ? 'Đóng menu' : 'Mở menu'}
            aria-expanded={menu}
            aria-controls="main-navigation"
            onClick={() => setMenu(!menu)}
          >
            {menu ? <X /> : <Menu />}
          </button>
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        <Suspense
          fallback={
            <div className="page-shell">
              <Spinner />
            </div>
          }
        >
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/dang-ky" element={<Registration />} />
            <Route path="/tai-khoan/*" element={<Account />} />
            <Route path="/binh-chon" element={<Voting />} />
            <Route path="/admin/*" element={<Admin />} />
            <Route path="*" element={<PublicPages />} />
          </Routes>
        </Suspense>
      </main>
      <footer>
        <div className="footer-top">
          <Link className="footer-brand" to="/">
            ftu<i>charm</i>
            <small>Nơi vẻ đẹp, tri thức và bản lĩnh cùng tỏa sáng.</small>
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
            <h3>Kết nối với FTUCharm</h3>
            <a
              href="https://www.facebook.com/ftucharm.duyendangngoaithuong"
              target="_blank"
              rel="noreferrer"
            >
              <Facebook size={18} /> Fanpage chính thức <ArrowUpRight size={16} />
            </a>
            <Link to="/thu-vien">
              <Instagram size={18} /> Những khoảnh khắc
            </Link>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} FTUCharm • Duyên dáng Ngoại thương</span>
          <div>
            <Link to="/the-le">Thể lệ</Link>
            <Link to="/quyen-rieng-tu">Quyền riêng tư</Link>
            <Link to="/admin">Ban tổ chức</Link>
          </div>
        </div>
      </footer>
    </>
  );
}
