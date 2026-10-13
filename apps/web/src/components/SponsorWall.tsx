import { ArrowUpRight, Gem, Handshake } from 'lucide-react';
import type { Sponsor } from '@ftu/shared';
import { SectionHeading } from '@ftu/ui';
import { DataState, useContent } from './Content';
import { sponsorLogos } from '../config/site-content';
import { Marquee } from './interface/Marquee';

export default function SponsorWall() {
  const sponsors = useContent<Sponsor[]>('/sponsors');
  const items = [...sponsorLogos, ...(sponsors.data ?? [])];
  return (
    <section className="section sponsor-section" id="dong-hanh">
      <SectionHeading title="Đồng hành" />
      <DataState query={sponsors} />
      {items.length > 0 ? (
        <Marquee>
          {items.map((s) => (
            <a className="sponsor-tile" href={s.url} key={s.id} target="_blank" rel="noreferrer">
              {s.logo_url ? (
                <img src={s.logo_url} alt={s.name} loading="lazy" width="240" height="100" />
              ) : (
                <strong>{s.name}</strong>
              )}
              <span>
                {(
                  {
                    diamond: 'Nhà tài trợ kim cương',
                    gold: 'Nhà tài trợ vàng',
                    silver: 'Nhà tài trợ bạc',
                    partner: 'Đơn vị đồng hành',
                  } as Record<string, string>
                )[s.tier] ?? 'Đơn vị đồng hành'}
              </span>
            </a>
          ))}
        </Marquee>
      ) : (
        <div
          className="sponsor-wall sponsor-placeholders"
          aria-label="Khu vực logo nhà tài trợ, danh sách sắp công bố"
        >
          {['Nhà tài trợ kim cương', 'Nhà tài trợ vàng', 'Nhà tài trợ bạc', 'Đơn vị đồng hành'].map(
            (name, i) => (
              <div className="sponsor-tile" key={name} data-reveal>
                {i < 3 ? (
                  <Gem size={29} strokeWidth={1} />
                ) : (
                  <Handshake size={30} strokeWidth={1} />
                )}
                <strong>{name}</strong>
                <span>Sắp công bố</span>
              </div>
            ),
          )}
        </div>
      )}
      <a
        className="text-link"
        href="https://www.facebook.com/ftucharm.duyendangngoaithuong"
        target="_blank"
        rel="noreferrer"
      >
        Liên hệ tài trợ <ArrowUpRight size={18} />
      </a>
    </section>
  );
}
