import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUpRight, Crown, CalendarDays, Ticket, Heart, Flower2 } from 'lucide-react';
import { Badge, Button, SectionHeading, EmptyState } from '@ftu/ui';
import type { Edition, TimelineEvent, Contestant, News } from '@ftu/shared';
import { useContent, DataState, ContestantCard } from '../components/Content';
import { AnimatedText, StageCrown } from '../components/Motion';
import Tribute from '../components/Tribute';
import SponsorWall from '../components/SponsorWall';
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
      <section className="luminous-hero">
        <div className="aurora aurora-one" aria-hidden="true" />
        <div className="aurora aurora-two" aria-hidden="true" />
        <div className="starfield" aria-hidden="true">
          {Array.from({ length: 18 }, (_, i) => (
            <span
              key={i}
              style={{
                left: `${(i * 37) % 100}%`,
                top: `${(i * 23) % 95}%`,
                animationDelay: `${i * 0.31}s`,
              }}
            >
              ✦
            </span>
          ))}
        </div>
        <div className="hero-topline">
          <span>Dành cho nữ sinh Đại học Ngoại thương</span>
          <span>Vẻ đẹp · Tri thức · Bản lĩnh</span>
        </div>
        <div className="luminous-hero-grid">
          <div className="luminous-copy">
            <p className="hero-edition">
              <Crown size={20} strokeWidth={1.2} /> Hành trình tỏa sáng của bạn
            </p>
            <h1>
              <AnimatedText text="Duyên dáng Ngoại thương" />
            </h1>
            <div className="hero-wordmark" aria-hidden="true">
              FTU<span>CHARM</span>
            </div>
            <p className="hero-description">
              Có một vẻ đẹp chỉ thuộc về bạn.
              <br />
              Có một sân khấu chờ bạn viết nên câu chuyện.
            </p>
            <div className="hero-buttons">
              <Button asChild>
                <Link to="/dang-ky">
                  Đăng ký tỏa sáng <ArrowUpRight size={18} />
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to="/thi-sinh">Khám phá thí sinh</Link>
              </Button>
            </div>
            <p className="hero-theme">
              {edition.data?.theme || 'Nơi vẻ đẹp, tri thức và bản lĩnh cùng tỏa sáng.'}
            </p>
          </div>
          <div className="crown-stage" aria-hidden="true">
            <div className="stage-halo" />
            <div className="stage-ring ring-one" />
            <div className="stage-ring ring-two" />
            <StageCrown />
            <span className="stage-script">Your light. Your story.</span>
            <div className="stage-plinth" />
          </div>
        </div>
        <div className="hero-bottomline">
          <a href="#hanh-trinh" className="luminous-scroll">
            <span className="scroll-orb">
              <ArrowDown size={17} />
            </span>
            Khám phá hành trình
          </a>
          <span>
            50 thí sinh dự kiến <b>✦</b> 11 chặng tỏa sáng
          </span>
        </div>
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
              {events.map((event, i) => (
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
            <div className="journey-feature" key={step}>
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
      <Tribute />
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
      <SponsorWall />
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
