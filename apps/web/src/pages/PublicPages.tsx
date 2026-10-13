import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Flower2, CalendarDays, ArrowUpRight, Ticket } from 'lucide-react';
import { Badge, Card, Button, EmptyState, SearchBar, Pagination, Modal } from '@ftu/ui';
import type { TimelineEvent, Contestant, News, Sponsor, Edition } from '@ftu/shared';
import { PageTitle, useContent, DataState, ContestantCard } from '../components/Content';
function Timeline() {
  const q = useContent<TimelineEvent[]>('/timeline');
  return (
    <div className="page-shell">
      <PageTitle
        label="Hành trình FTUCharm"
        title="Từ khởi đầu đến rực rỡ."
        description="11 chặng đường. Những trải nghiệm để trở thành phiên bản tự tin nhất của chính bạn."
      />
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
      <PageTitle
        label="Gương mặt FTUCharm"
        title="Mỗi vẻ đẹp, một câu chuyện."
        description="Khám phá những cô gái với tri thức, tài năng và dấu ấn riêng."
      />
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
            <ContestantCard contestant={q.data} />
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
      <PageTitle
        label="Nhịp đập FTUCharm"
        title={post?.title ?? 'Những câu chuyện trên hành trình.'}
      />
      <DataState query={q} />
      {slug ? (
        post ? (
          <article className="prose">
            <Badge>{post.category}</Badge>
            <p className="lead">{post.excerpt}</p>
            <p>{post.body}</p>
            <Link className="text-link" to="/tin-tuc">
              Khám phá tin khác <ArrowUpRight size={18} />
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
                    Đọc câu chuyện <ArrowUpRight size={18} />
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
  const q = useContent<Sponsor[]>('/sponsors');
  return (
    <div className="page-shell">
      <PageTitle
        label="Cùng nhau tạo dấu ấn"
        title="Những người bạn đồng hành."
        description="Cảm ơn các đơn vị chung tay tạo nên hành trình FTUCharm."
      />
      <DataState query={q} />
      <div className="article-grid">
        {q.data?.map((s) => (
          <Card key={s.id}>
            <Badge>{s.tier}</Badge>
            <h2>{s.name}</h2>
            <a className="text-link" href={s.url} target="_blank" rel="noreferrer">
              Website chính thức <ArrowUpRight size={18} />
            </a>
          </Card>
        ))}
      </div>
      {q.data?.length === 0 && (
        <EmptyState title="Danh sách đối tác sẽ được công bố">
          Để tìm hiểu cơ hội đồng hành, vui lòng kết nối với BTC qua fanpage chính thức.
        </EmptyState>
      )}
      <a
        className="text-link"
        href="https://www.facebook.com/ftucharm.duyendangngoaithuong"
        target="_blank"
        rel="noreferrer"
      >
        Kết nối với ban tổ chức <ArrowUpRight size={18} />
      </a>
    </div>
  );
}
function Gallery() {
  const [open, setOpen] = useState(false);
  return (
    <div className="page-shell">
      <PageTitle
        label="Thư viện"
        title="Khoảnh khắc của thanh xuân."
        description="Bộ ảnh theo từng vòng thi sẽ được BTC công bố tại đây."
      />
      <button className="gallery-image" onClick={() => setOpen(true)}>
        <img
          src="/images/silk-bloom.webp"
          alt="Mở tác phẩm hoa lụa trang trí minh họa"
          width="1536"
          height="1024"
          loading="lazy"
        />
        <span>Bloom in your own way • Tác phẩm minh họa AI</span>
      </button>
      <Modal open={open} onOpenChange={setOpen} title="Tác phẩm trang trí minh họa">
        <img
          className="lightbox-image"
          src="/images/silk-bloom.webp"
          alt="Hoa lụa hồng minh họa, không phải ảnh cuộc thi"
        />
      </Modal>
    </div>
  );
}
function Tickets() {
  const q = useContent<Edition | null>('/editions/current');
  return (
    <div className="page-shell">
      <PageTitle
        label="Đêm hội FTUCharm"
        title="Hẹn bạn dưới ánh đèn sân khấu."
        description="Vé bán kết và chung kết được mở theo từng chặng của mùa thi."
      />
      <div className="ticket-layout">
        {['Bán kết', 'Chung kết'].map((name, i) => (
          <Card key={name} className="ticket-card">
            <Ticket size={36} strokeWidth={1} />
            <Badge>Lịch mở bán chưa công bố</Badge>
            <h2>Đêm {name.toLowerCase()}</h2>
            <p>
              {i
                ? 'Chứng kiến khoảnh khắc tỏa sáng và bình chọn cho thí sinh bạn yêu thích.'
                : 'Đồng hành cùng những gương mặt trên chặng đường đến chung kết.'}
            </p>
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
      <p className="fine-print">
        Website chưa mở thanh toán. Vé đủ điều kiện bình chọn phải được cấp và check-in bởi BTC.
      </p>
    </div>
  );
}
function About() {
  return (
    <div className="page-shell">
      <PageTitle
        label="Về FTUCharm"
        title="Vẻ đẹp mang dấu ấn riêng."
        description="Duyên dáng Ngoại thương • Vẻ đẹp, tri thức và bản lĩnh."
      />
      <div className="about-layout">
        <img
          src="/images/silk-bloom.webp"
          alt="Hoa lụa hồng, tác phẩm trang trí"
          width="1536"
          height="1024"
        />
        <article className="prose">
          <Flower2 size={42} strokeWidth={1} />
          <h2>Trưởng thành từ những trải nghiệm.</h2>
          <p>
            FTUCharm là nơi những người trẻ tự tin kể câu chuyện của mình. Hành trình đi qua sơ
            khảo, training, hoạt động truyền thông, bán kết và chung kết.
          </p>
          <p>Mỗi chặng là cơ hội để học hỏi, kết nối, thể hiện tài năng và nuôi dưỡng bản lĩnh.</p>
          <p>
            Thông tin mùa thi, đơn vị tổ chức và thể lệ chính thức sẽ được ban tổ chức công bố. Theo
            dõi fanpage để cập nhật thông tin đã xác nhận.
          </p>
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
              được duyệt và cho phép công bố xuất hiện công khai.
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
              Điều kiện về trường, độ tuổi, giấy tờ và đối tượng dự thi sẽ được BTC công bố. Website
              không tự đặt điều kiện tuyển chọn.
            </p>
            <h2>Hồ sơ & vòng thi</h2>
            <p>
              Hồ sơ gồm thông tin cá nhân, giới thiệu, năng khiếu và ba ảnh. Kết quả được BTC xét
              duyệt và công bố theo từng vòng. Số thí sinh qua vòng được cấu hình theo mùa.
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
