import { Crown, ArrowUpRight } from 'lucide-react';
import { officialFacebook } from '../config/site-content';
export default function Tribute() {
  return (
    <section className="tribute-section" id="dau-an-2025" aria-labelledby="tribute-title">
      <div className="tribute-heading" data-reveal>
        <Crown size={30} strokeWidth={1} />
        <p>Dấu ấn rực rỡ · FTUCharm 2025</p>
        <h2 id="tribute-title">
          Một vương miện.
          <br />
          Ngàn cảm hứng tiếp nối.
        </h2>
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
          <p>
            Trân trọng dấu ấn của một hành trình đã qua. Tiếp nối niềm tự hào và cảm hứng cho những
            vẻ đẹp Ngoại thương.
          </p>
          <a className="text-link" href={officialFacebook} target="_blank" rel="noreferrer">
            Theo dõi hành trình <ArrowUpRight size={18} />
          </a>
        </figcaption>
      </figure>
    </section>
  );
}
