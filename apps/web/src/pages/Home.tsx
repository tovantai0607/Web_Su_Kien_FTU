import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDown,
  ArrowUpRight,
  Sparkles,
  CalendarDays,
  Ticket,
  Heart,
  Flower2,
} from 'lucide-react';
import { Badge, Button, SectionHeading, EmptyState } from '@ftu/ui';
import type { Edition, TimelineEvent, Contestant, News } from '@ftu/shared';
import { useContent, DataState, ContestantCard } from '../components/Content';
export default function Home() {
  const edition = useContent<Edition | null>('/editions/current');
  const timeline = useContent<TimelineEvent[]>('/timeline');
  const contestants = useContent<Contestant[]>('/contestants');
  const news = useContent<News[]>('/news');
  const [step, setStep] = useState(1);
  const events = [...(timeline.data ?? [])].sort((a, b) => a.position - b.position);
  const current = events[step];
  return (
    <>
      <section className="hero">
        <img
          className="hero-art"
          src="/images/silk-bloom.webp"
          alt=""
          width="1536"
          height="1024"
          fetchPriority="high"
        />
        <div className="hero-wash" />
        <div className="hero-content">
          <div className="hero-label">
            <span className="tiny-flower">
              <Flower2 size={17} />
            </span>
            Duyên dáng Ngoại thương<em>Vẻ đẹp • Tri thức • Bản lĩnh</em>
          </div>
          <h1>
            Duyên dáng
            <br />
            <i>từ bên trong.</i>
          </h1>
          <p>
            Mỗi vẻ đẹp là một câu chuyện.
            <br />
            Hãy để câu chuyện của bạn bắt đầu tại FTUCharm.
          </p>
          <div className="hero-buttons">
            <Button asChild>
              <Link to="/dang-ky">
                Bắt đầu hành trình <ArrowUpRight size={18} />
              </Link>
            </Button>
            <Button variant="ghost" asChild>
              <Link to="/gioi-thieu">
                Khám phá FTUCharm{' '}
                <span className="round-arrow">
                  <ArrowUpRight size={17} />
                </span>
              </Link>
            </Button>
          </div>
          <div className="hero-footnote">
            <span className="line" /> {edition.data?.theme ?? 'Vẻ đẹp khởi nguồn từ chính bạn'}
          </div>
        </div>
        <div className="hero-seal">
          <Sparkles size={24} strokeWidth={1} />
          <span>
            Bloom
            <br />
            in your own way
          </span>
        </div>
        <a className="scroll-cue" href="#hanh-trinh">
          Cuộn để khám phá <ArrowDown size={16} />
        </a>
        <div className="hero-side-note">A journey to your brightest self</div>
      </section>
      <div className="values-strip">
        <span>Vẻ đẹp của tri thức</span>
        <Flower2 size={22} strokeWidth={1} />
        <span>Bản lĩnh của tuổi trẻ</span>
        <Flower2 size={22} strokeWidth={1} />
        <span>Dấu ấn của chính bạn</span>
      </div>
      <section className="section journey" id="hanh-trinh">
        <SectionHeading
          kicker="Từng bước trưởng thành"
          title="Một hành trình, ngàn dấu ấn."
          description="Từ bước chân đầu tiên đến khoảnh khắc rực rỡ trên sân khấu."
        >
          <Link className="text-link" to="/timeline">
            Toàn bộ hành trình <ArrowUpRight size={19} />
          </Link>
        </SectionHeading>
        <DataState query={timeline} />
        {events.length > 0 ? (
          <div className="journey-layout">
            <div className="journey-map">
              {events.slice(0, 4).map((event, i) => (
                <button
                  key={event.id}
                  className={i === step ? 'journey-stop active' : 'journey-stop'}
                  onClick={() => setStep(i)}
                  aria-pressed={i === step}
                >
                  <span className="stop-dot" />
                  <span className="stop-number">0{i + 1}</span>
                  <strong>{event.title}</strong>
                  <small>
                    {event.starts_at
                      ? new Date(event.starts_at).toLocaleDateString('vi-VN')
                      : 'Lịch sắp công bố'}
                  </small>
                </button>
              ))}
            </div>
            <div className="journey-feature">
              <div className="feature-icon">
                <CalendarDays size={25} strokeWidth={1.4} />
              </div>
              <div>
                <Badge>Chặng {String(step + 1).padStart(2, '0')}</Badge>
                <h3>{current?.title}</h3>
                <p>{current?.description}</p>
                <Link to={step === 1 ? '/dang-ky' : '/timeline'} className="text-link">
                  {step === 1 ? 'Chuẩn bị hồ sơ' : 'Khám phá chặng đường'}{' '}
                  <ArrowUpRight size={18} />
                </Link>
              </div>
              <span className="feature-petal" aria-hidden="true" />
            </div>
          </div>
        ) : !timeline.isPending && !timeline.isError ? (
          <EmptyState title="Hành trình đang được chuẩn bị">
            Lịch chính thức sẽ được BTC công bố tại đây.
          </EmptyState>
        ) : null}
      </section>
      <section className="intro-section">
        <div className="intro-visual">
          <img
            src="/images/silk-bloom.webp"
            alt="Tác phẩm hoa lụa trang trí"
            loading="lazy"
            width="1536"
            height="1024"
          />
          <div className="intro-caption">
            Không chỉ tỏa sáng.
            <br />
            <i>Mà còn là chính mình.</i>
          </div>
        </div>
        <div className="intro-copy">
          <p className="eyebrow">Về FTUCharm</p>
          <h2>
            Nơi vẻ đẹp
            <br />
            gặp <i>bản lĩnh.</i>
          </h2>
          <p>
            FTUCharm – Duyên dáng Ngoại thương là hành trình để những người trẻ khám phá giá trị của
            chính mình, tự tin thể hiện và cùng nhau trưởng thành.
          </p>
          <p>Một sân khấu cho vẻ đẹp. Một cơ hội cho tri thức. Một dấu ấn cho tuổi trẻ.</p>
          <Link className="text-link" to="/gioi-thieu">
            Câu chuyện FTUCharm <ArrowUpRight size={18} />
          </Link>
          <div className="intro-values">
            <span>
              <strong>50</strong>Thí sinh dự kiến
            </span>
            <span>
              <strong>11</strong>Chặng hành trình
            </span>
            <span>
              <Heart size={28} strokeWidth={1} />
              Một dấu ấn riêng
            </span>
          </div>
        </div>
      </section>
      <section className="section spotlight">
        <SectionHeading
          kicker="Những vẻ đẹp đang nở rộ"
          title="Gương mặt của hành trình."
          description="Những câu chuyện, tài năng và bản lĩnh làm nên FTUCharm."
        >
          <Link className="text-link" to="/thi-sinh">
            Khám phá thí sinh <ArrowUpRight size={19} />
          </Link>
        </SectionHeading>
        <DataState query={contestants} />
        <div className="contestant-grid">
          {contestants.data?.slice(0, 4).map((c, i) => (
            <ContestantCard contestant={c} index={i} key={c.id} />
          ))}
        </div>
        {contestants.data?.length === 0 && (
          <EmptyState title="Những gương mặt sắp được hé lộ">
            Danh sách chỉ xuất hiện sau khi BTC duyệt và công bố.
          </EmptyState>
        )}
      </section>
      <section className="finale-banner">
        <div className="banner-orbit" aria-hidden="true" />
        <div>
          <Badge>Hẹn nhau tại đêm chung kết</Badge>
          <h2>
            Một sân khấu.
            <br />
            <i>Muôn vàn cảm xúc.</i>
          </h2>
          <p>
            Đồng hành cùng những cô gái trên hành trình rực rỡ nhất.
            <br />
            Và dành một phiếu cho vẻ đẹp chạm đến bạn.
          </p>
        </div>
        <div className="finale-actions">
          <Button asChild>
            <Link to="/ve">
              <Ticket size={20} /> Khám phá đêm hội <ArrowUpRight size={18} />
            </Link>
          </Button>
          <Link to="/binh-chon" className="text-link">
            Bình chọn tại chung kết <Heart size={17} />
          </Link>
          <small>1 phiếu / vé đã check-in • Mỗi lượt mở 10 phút</small>
        </div>
      </section>
      <section className="section news-section">
        <SectionHeading kicker="Nhịp đập FTUCharm" title="Câu chuyện mới nhất.">
          <Link className="text-link" to="/tin-tuc">
            Tất cả tin tức <ArrowUpRight size={18} />
          </Link>
        </SectionHeading>
        <DataState query={news} />
        <div className="news-grid">
          {news.data?.slice(0, 2).map((n, i) => (
            <Link className="news-card" to={'/tin-tuc/' + n.slug} key={n.id}>
              <div className={'news-art art-' + i}>
                <Flower2 strokeWidth={0.6} />
                <span>{i === 0 ? 'The journey' : 'Your story'}</span>
              </div>
              <div>
                <Badge>{n.category}</Badge>
                <h3>{n.title}</h3>
                <p>{n.excerpt}</p>
                <span className="text-link">
                  Đọc câu chuyện <ArrowUpRight size={18} />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>
      <section className="join-section">
        <Flower2 size={45} strokeWidth={0.8} />
        <h2>
          Vẻ đẹp của bạn.
          <br />
          <i>Câu chuyện của bạn.</i>
        </h2>
        <p>Hành trình mới đang chờ một phiên bản rực rỡ của chính bạn.</p>
        <Button asChild>
          <Link to="/dang-ky">
            Tôi sẵn sàng tỏa sáng <ArrowUpRight size={18} />
          </Link>
        </Button>
      </section>
    </>
  );
}
