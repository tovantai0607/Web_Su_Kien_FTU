import { lazy, Suspense, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Flower2,
  CalendarDays,
  ArrowUpRight,
  Ticket,
  Armchair,
  ShoppingBag,
  LockKeyhole,
} from 'lucide-react';
import { Badge, Card, Button, EmptyState, SearchBar, Pagination, Skeleton } from '@ftu/ui';
import type { TimelineEvent, Contestant, News, Edition } from '@ftu/shared';
import { PageTitle, useContent, DataState, ContestantCard } from '../components/Content';
import SponsorWall from '../components/SponsorWall';
import Tribute from '../components/Tribute';
const PhotoCarousel = lazy(() => import('../components/interface/PhotoCarousel'));
function Timeline() {
  const q = useContent<TimelineEvent[]>('/timeline');
  return (
    <div className="page-shell">
      <PageTitle title="Hành trình" />
      <DataState query={q} />
      <div className="full-timeline">
        {[...(q.data ?? [])]
          .sort((a, b) => a.position - b.position)
          .map((e, i) => (
            <article key={e.id}>
              <span className="timeline-node">{String(i + 1).padStart(2, '0')}</span>
              <div>
                <Badge>
                  {e.starts_at
                    ? Date.now() < Date.parse(e.starts_at)
                      ? 'Sắp diễn ra'
                      : e.ends_at && Date.now() > Date.parse(e.ends_at)
                        ? 'Đã kết thúc'
                        : 'Đang diễn ra'
                    : 'Lịch sắp công bố'}
                </Badge>
                <h2>{e.title}</h2>
                <p>{e.description}</p>
                {e.starts_at && (
                  <small>
                    {new Date(e.starts_at).toLocaleString('vi-VN', {
                      timeZone: 'Asia/Ho_Chi_Minh',
                    })}
                  </small>
                )}
              </div>
              <CalendarDays strokeWidth={1} size={32} />
            </article>
          ))}
      </div>
      {q.data?.length === 0 && <EmptyState title="Lịch chính thức đang được chuẩn bị" />}
    </div>
  );
}
function Contestants() {
  const q = useContent<Contestant[]>('/contestants');
  const [search, setSearch] = useState(''),
    [stage, setStage] = useState('all'),
    [page, setPage] = useState(1);
  const filtered = (q.data ?? []).filter(
    (c) =>
      (stage === 'all' || c.stage === stage) &&
      `${c.display_name} ${c.number}`
        .toLocaleLowerCase('vi')
        .includes(search.toLocaleLowerCase('vi')),
  );
  return (
    <div className="page-shell">
      <PageTitle title="Thí sinh" />
      <div className="filter-row">
        <SearchBar
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Tìm theo tên hoặc số báo danh"
        />
        <label>
          Vòng thi{' '}
          <select
            className="input"
            value={stage}
            onChange={(e) => {
              setStage(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">Tất cả vòng thi</option>
            {[...new Set(q.data?.map((c) => c.stage))].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>
      {!q.isPending && !q.isError && (
        <p className="results-count" role="status">
          {filtered.length} thí sinh{search || stage !== 'all' ? ' phù hợp' : ''}
        </p>
      )}
      <DataState query={q} />
      <div className="contestant-grid">
        {filtered.slice((page - 1) * 8, page * 8).map((c, i) => (
          <ContestantCard key={c.id} contestant={c} index={i} />
        ))}
      </div>
      {!q.isPending && !q.isError && !filtered.length && (
        <EmptyState title="Chưa tìm thấy gương mặt phù hợp">
          Thử thay đổi từ khóa hoặc quay lại khi BTC công bố danh sách.
        </EmptyState>
      )}
      <Pagination page={page} pages={Math.ceil(filtered.length / 8)} onChange={setPage} />
    </div>
  );
}
function ContestantProfile({ slug }: { slug: string }) {
  const q = useContent<Contestant | null>('/contestants/' + slug);
  return (
    <div className="page-shell">
      <DataState query={q} />
      {q.data ? (
        <>
          <Link className="text-link" to="/thi-sinh">
            Quay lại danh sách
          </Link>
          <div className="profile-layout">
            {q.data.photo_url ? (
              <Suspense fallback={<Skeleton />}>
                <PhotoCarousel
                  label={`Ảnh ${q.data.display_name}`}
                  photos={[
                    {
                      src: q.data.photo_url,
                      alt: q.data.display_name,
                      caption: `Thí sinh #${q.data.number}`,
                      width: 420,
                      height: 560,
                    },
                  ]}
                />
              </Suspense>
            ) : (
              <ContestantCard contestant={q.data} />
            )}
            <div>
              <Badge>Thí sinh #{q.data.number}</Badge>
              <PageTitle title={q.data.display_name} description={q.data.faculty} />
              <p>{q.data.bio}</p>
              <h2>Tài năng & dấu ấn</h2>
              <p>{q.data.talents}</p>
              <Badge>{q.data.stage}</Badge>
              <div className="profile-actions">
                <Button asChild>
                  <Link to="/binh-chon">
                    Khám phá bình chọn <ArrowUpRight size={18} />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </>
      ) : !q.isPending && !q.isError ? (
        <EmptyState title="Hồ sơ chưa được công bố" />
      ) : null}
    </div>
  );
}
function NewsPage({ slug }: { slug?: string }) {
  const q = useContent<News[]>('/news');
  const [search, setSearch] = useState('');
  const post = q.data?.find((p) => p.slug === slug);
  return (
    <div className="page-shell">
      <PageTitle title={post?.title ?? 'Tin tức'} />
      <DataState query={q} />
      {slug ? (
        post ? (
          <article className="prose">
            <Badge>{post.category}</Badge>
            <p className="lead">{post.excerpt}</p>
            <p>{post.body}</p>
            <Link className="text-link" to="/tin-tuc">
              Tin khác <ArrowUpRight size={18} />
            </Link>
          </article>
        ) : !q.isPending ? (
          <EmptyState title="Bài viết chưa được công bố" />
        ) : null
      ) : (
        <>
          <SearchBar value={search} onChange={setSearch} placeholder="Tìm bài viết" />
          <div className="article-grid">
            {q.data
              ?.filter((p) => p.title.toLowerCase().includes(search.toLowerCase()))
              .map((p) => (
                <Card key={p.id}>
                  <Badge>{p.category}</Badge>
                  <h2>{p.title}</h2>
                  <p>{p.excerpt}</p>
                  <Link className="text-link" to={'/tin-tuc/' + p.slug}>
                    Đọc thêm <ArrowUpRight size={18} />
                  </Link>
                </Card>
              ))}
          </div>
        </>
      )}
    </div>
  );
}
function Sponsors() {
  return (
    <div className="page-shell">
      <PageTitle title="Nhà tài trợ" />
      <SponsorWall />
    </div>
  );
}
function Gallery() {
  return (
    <div className="page-shell">
      <PageTitle title="Thư viện" description="Ảnh chính thức sẽ được công bố tại đây." />
      <Suspense fallback={<Skeleton />}>
        <PhotoCarousel
          label="Thư viện FTUCharm"
          photos={[
            {
              src: '/images/silk-bloom.webp',
              alt: 'tác phẩm hoa lụa trang trí minh họa',
              caption: 'Tác phẩm minh họa AI',
              width: 1536,
              height: 1024,
            },
            {
              src: '/images/le-phuong-nghi-2025.webp',
              alt: 'Lê Phương Nghi – Hoa khôi Duyên dáng Ngoại thương 2025',
              caption: 'Dấu ấn FTUCharm 2025',
              width: 1958,
              height: 745,
            },
          ]}
        />
      </Suspense>
    </div>
  );
}
function Tickets() {
  const q = useContent<Edition | null>('/editions/current');
  return (
    <div className="page-shell">
      <PageTitle title="Vé" description="Lịch mở bán sẽ được BTC công bố." />
      <div className="ticket-layout">
        {['Bán kết', 'Chung kết'].map((name) => (
          <Card key={name} className="ticket-card">
            <Ticket size={36} strokeWidth={1} />
            <Badge>Lịch mở bán chưa công bố</Badge>
            <h2>Đêm {name.toLowerCase()}</h2>
            <small>
              {q.data?.title ?? 'FTUCharm'} • Giá vé, sơ đồ ghế và ngày tổ chức do BTC công bố.
            </small>
            <Button variant="outline" asChild>
              <a
                href="https://www.facebook.com/ftucharm.duyendangngoaithuong"
                target="_blank"
                rel="noreferrer"
              >
                Theo dõi thông báo <ArrowUpRight size={18} />
              </a>
            </Button>
          </Card>
        ))}
      </div>
      <div className="ticket-planning">
        <section className="seat-preview" aria-labelledby="seat-title">
          <div className="seat-stage" aria-hidden="true">
            FTUCHARM
          </div>
          <div className="seat-illustration" aria-hidden="true">
            {Array.from({ length: 32 }, (_, i) => (
              <Armchair key={i} size={23} strokeWidth={1.2} />
            ))}
          </div>
          <h2 id="seat-title">Sơ đồ ghế sắp công bố</h2>
          <p>Vị trí và hạng vé sẽ hiển thị khi mở bán.</p>
          <small>Hình minh họa, chưa phải sơ đồ chính thức.</small>
        </section>
        <Card className="ticket-summary">
          <ShoppingBag size={26} strokeWidth={1.3} />
          <h2>Vé của bạn</h2>
          <p>Chưa có vé được chọn.</p>
          <ol className="checkout-steps">
            <li>Chọn đêm thi</li>
            <li>Chọn ghế</li>
            <li>Thanh toán</li>
          </ol>
          <Button disabled>
            <LockKeyhole size={16} /> Chưa mở thanh toán
          </Button>
          <Link className="text-link" to="/tai-khoan/dang-nhap">
            Đăng nhập tài khoản nhận vé
          </Link>
        </Card>
      </div>
      <p className="fine-print">
        Website chưa mở thanh toán. Vé đủ điều kiện bình chọn phải được cấp và check-in bởi BTC.
      </p>
    </div>
  );
}
function About() {
  return (
    <div className="page-shell">
      <PageTitle title="Về FTUCharm" />
      <div className="about-layout">
        <img
          src="/images/silk-bloom.webp"
          alt="Hoa lụa hồng, tác phẩm trang trí"
          width="1536"
          height="1024"
        />
        <article className="prose">
          <Flower2 size={42} strokeWidth={1} />
          <h2>Duyên dáng Ngoại thương</h2>
          <p>
            Cuộc thi dành cho nữ sinh Đại học Ngoại thương, với các vòng sơ khảo, đào tạo, bán kết
            và chung kết.
          </p>
          <p>Theo dõi fanpage để cập nhật lịch và thể lệ chính thức.</p>
          <a
            className="text-link"
            href="https://www.facebook.com/ftucharm.duyendangngoaithuong"
            target="_blank"
            rel="noreferrer"
          >
            Fanpage chính thức <ArrowUpRight size={18} />
          </a>
        </article>
      </div>
      <Tribute />
    </div>
  );
}
function Legal({ privacy }: { privacy: boolean }) {
  return (
    <div className="page-shell">
      <PageTitle
        title={privacy ? 'Thông báo xử lý dữ liệu' : 'Thể lệ & điều kiện tham gia'}
        description="Bản dự thảo cần được BTC rà soát và công bố trước khi mở đơn."
      />
      <article className="prose">
        {privacy ? (
          <>
            <h2>Dữ liệu và mục đích</h2>
            <p>
              Họ tên, email, điện thoại, thông tin học tập, giới thiệu và ảnh được dùng để tiếp
              nhận, xét duyệt và liên hệ thí sinh. Hồ sơ mới nộp được giữ riêng tư. Chỉ thông tin
              được duyệt và cho phép công bố xuất hiện công khai. Ảnh thẻ sinh viên chỉ phục vụ xác
              minh tư cách sinh viên FTU, được giới hạn cho chủ hồ sơ và người xét duyệt có quyền;
              không công bố trên hồ sơ thí sinh.
            </p>
            <h2>Quyền của bạn</h2>
            <p>
              Bạn có thể liên hệ BTC qua fanpage chính thức để yêu cầu xem, chỉnh sửa hoặc xóa hồ sơ
              theo quy trình xác minh danh tính. Dữ liệu không được chia sẻ cho các đơn vị khác khi
              chưa xác định mục đích và căn cứ phù hợp.
            </p>
            <h2>Thời gian lưu và đơn vị xử lý</h2>
            <p>
              BTC cần điền thời hạn lưu, đầu mối liên hệ và thông tin đơn vị tổ chức trước khi sử
              dụng thật. Supabase và Cloudflare cung cấp hạ tầng; thông báo này cần rà soát các yêu
              cầu pháp lý và việc xử lý dữ liệu xuyên biên giới.
            </p>
          </>
        ) : (
          <>
            <h2>Điều kiện đăng ký</h2>
            <p>
              Cuộc thi dành riêng cho nữ sinh Đại học Ngoại thương (FTU). Ảnh thẻ sinh viên được BTC
              đối chiếu khi xét duyệt. Những điều kiện khác được công bố trong thể lệ chính thức.
            </p>
            <h2>Hồ sơ & vòng thi</h2>
            <p>
              Hồ sơ gồm thông tin cá nhân, giới thiệu, năng khiếu, ba ảnh hồ sơ và ảnh thẻ sinh viên
              FTU. Kết quả được BTC xét duyệt và công bố theo từng vòng. Số thí sinh qua vòng được
              cấu hình theo mùa.
            </p>
            <h2>Bình chọn chung kết</h2>
            <p>
              Mỗi vé đã check-in được bỏ một phiếu trong một lượt bình chọn. Lượt mở 10 phút theo
              thời gian server, chỉ dành cho thí sinh đủ điều kiện. Không thể đổi lựa chọn sau khi
              xác nhận. Số phiếu được lưu bằng transaction tại database.
            </p>
          </>
        )}
        <Link className="text-link" to="/dang-ky">
          Quay lại đăng ký
        </Link>
      </article>
    </div>
  );
}
export default function PublicPages() {
  const path = useLocation().pathname;
  if (path === '/timeline') return <Timeline />;
  if (path === '/thi-sinh') return <Contestants />;
  if (path.startsWith('/thi-sinh/')) return <ContestantProfile slug={path.split('/').at(-1)!} />;
  if (path.startsWith('/tin-tuc')) return <NewsPage slug={path.split('/')[2]} />;
  if (path === '/nha-tai-tro') return <Sponsors />;
  if (path === '/thu-vien') return <Gallery />;
  if (path === '/ve') return <Tickets />;
  if (path === '/gioi-thieu') return <About />;
  if (path === '/the-le' || path === '/quyen-rieng-tu')
    return <Legal privacy={path === '/quyen-rieng-tu'} />;
  return (
    <div className="page-shell">
      <PageTitle title="Trang này chưa được tìm thấy." />
      <Button asChild>
        <Link to="/">Về trang chủ</Link>
      </Button>
    </div>
  );
}
