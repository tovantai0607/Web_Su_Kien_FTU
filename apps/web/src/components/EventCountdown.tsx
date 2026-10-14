import { useEffect, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import type { TimelineEvent } from '@ftu/shared';

export function countdownParts(target: number, now: number) {
  const seconds = Math.max(0, Math.floor((target - now) / 1000));
  return [
    Math.floor(seconds / 86400),
    Math.floor(seconds / 3600) % 24,
    Math.floor(seconds / 60) % 60,
    seconds % 60,
  ];
}

export default function EventCountdown({ events }: { events: TimelineEvent[] }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!document.hidden) setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  const upcoming = events
    .filter((e) => e.starts_at && Date.parse(e.starts_at) > now)
    .sort((a, b) => Date.parse(a.starts_at!) - Date.parse(b.starts_at!))[0];
  return (
    <section className="event-countdown" aria-label="Mốc sự kiện tiếp theo">
      <div className="countdown-event">
        <CalendarDays size={24} strokeWidth={1.3} />
        <div>
          <p>{upcoming ? 'Cùng đếm ngược đến' : 'Hẹn gặp tại FTUCHARM'}</p>
          <h2>{upcoming?.title ?? 'Lịch chính thức sắp công bố'}</h2>
        </div>
      </div>
      {upcoming ? (
        <div className="countdown-digits" role="timer" aria-live="off">
          {countdownParts(Date.parse(upcoming.starts_at!), now).map((value, i) => (
            <div key={i}>
              <strong>{String(value).padStart(2, '0')}</strong>
              <span>{['Ngày', 'Giờ', 'Phút', 'Giây'][i]}</span>
            </div>
          ))}
        </div>
      ) : (
        <a className="text-link" href="#hanh-trinh">
          Khám phá hành trình
        </a>
      )}
    </section>
  );
}
