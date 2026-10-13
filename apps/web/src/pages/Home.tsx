import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUpRight, CalendarDays, Ticket, Heart, Flower2 } from 'lucide-react';
import { Badge, Button, SectionHeading, EmptyState } from '@ftu/ui';
import type { TimelineEvent, Contestant, News } from '@ftu/shared';
import { useContent, DataState, ContestantCard } from '../components/Content';
import { StageCrown } from '../components/Motion';
import { BlurText } from '../components/interface/MotionSystem';
import { Aurora } from '../components/interface/Aurora';
import EventCountdown from '../components/EventCountdown';
import Tribute from '../components/Tribute';
import SponsorWall from '../components/SponsorWall';
export default function Home() {
  const timeline = useContent<TimelineEvent[]>('/timeline');
  const contestants = useContent<Contestant[]>('/contestants');
  const news = useContent<News[]>('/news');
  const [step, setStep] = useState(1);
  const events = [...(timeline.data ?? [])].sort((a, b) => a.position - b.position);
  const current = events[step];
  return (
    <>
      <div className="crown-story">
        <section className="luminous-hero" aria-label="FTUCharm">
          <Aurora />
          <div className="luminous-hero-grid">
            <div className="luminous-copy">
              <h1>
                <span className="hero-name">
                  <BlurText text="Duyên dáng Ngoại thương" />
                </span>
                <span className="hero-wordmark">
                  <BlurText text="FTUCHARM" />
                </span>
              </h1>
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
            </div>
            <div className="crown-stage" aria-hidden="true">
              <div className="stage-halo" />
              <div className="crown-orbit">
                <span />
              </div>
              <div className="crown-scroll">
                <StageCrown />
              </div>
              <div className="crown-shadow" />
            </div>
          </div>
          <a href="#hanh-trinh" className="luminous-scroll">
            <span>Khám phá</span>
            <ArrowDown size={18} />
          </a>
        </section>
      </div>
      <EventCountdown events={events} />
      <section className="section journey" id="hanh-trinh">
        <SectionHeading title="Hành trình">
          <Link className="text-link" to="/timeline">
            Xem lịch <ArrowUpRight size={19} />
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
                  <span className="stop-number">{String(i + 1).padStart(2, '0')}</span>
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
                  {step === 1 ? 'Chuẩn bị hồ sơ' : 'Chi tiết'} <ArrowUpRight size={18} />
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
      <section className="section contest-intro" data-reveal aria-labelledby="intro-title">
        <h2 id="intro-title">
          Vẻ đẹp mang
          <br />
          dấu ấn riêng.
        </h2>
        <div>
          <p>
            Từ giảng đường đến sân khấu, mỗi hành trình là một câu chuyện về tri thức, tài năng và
            bản lĩnh.
          </p>
          <Link className="text-link" to="/gioi-thieu">
            Về FTUCharm <ArrowUpRight size={18} />
          </Link>
        </div>
      </section>
      <Tribute />
      <section className="section spotlight">
        <SectionHeading title="Thí sinh">
          <Link className="text-link" to="/thi-sinh">
            Xem tất cả <ArrowUpRight size={19} />
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
          <h2>Đêm chung kết</h2>
        </div>
        <div className="finale-actions">
          <Button asChild>
            <Link to="/ve">
              <Ticket size={20} /> Thông tin vé <ArrowUpRight size={18} />
            </Link>
          </Button>
          <Link to="/binh-chon" className="text-link">
            Bình chọn <Heart size={17} />
          </Link>
        </div>
      </section>
      <section className="section news-section">
        <SectionHeading title="Tin tức">
          <Link className="text-link" to="/tin-tuc">
            Xem tất cả <ArrowUpRight size={18} />
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
                  Đọc thêm <ArrowUpRight size={18} />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>
      <SponsorWall />
    </>
  );
}
