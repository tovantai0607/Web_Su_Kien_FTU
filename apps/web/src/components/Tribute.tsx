import { Crown, ArrowUpRight } from 'lucide-react';
import { officialFacebook } from '../config/site-content';
export default function Tribute() {
  return (
    <section className="tribute-section" id="dau-an-2025" aria-labelledby="tribute-title">
      <div className="tribute-heading" data-reveal>
        <Crown size={30} strokeWidth={1} />
        <p>FTUCharm 2025</p>
        <h2 id="tribute-title">Dấu ấn 2025</h2>
      </div>
      <figure className="tribute-banner" data-reveal>
        <img
          src="/images/le-phuong-nghi-2025.webp"
          width="1958"
          height="745"
          alt="Lê Phương Nghi – Hoa khôi Duyên dáng Ngoại thương 2025. Road to Miss Vietnam."
          loading="lazy"
        />
        <figcaption>
          <div>
            <span>Hoa khôi Duyên dáng Ngoại thương 2025</span>
            <h3>Lê Phương Nghi</h3>
          </div>

          <a className="text-link" href={officialFacebook} target="_blank" rel="noreferrer">
            Fanpage <ArrowUpRight size={18} />
          </a>
        </figcaption>
      </figure>
    </section>
  );
}
