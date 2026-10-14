import { Crown, ArrowUpRight } from 'lucide-react';
import { officialFacebook } from '../config/site-content';
export default function Tribute() {
  return (
    <section className="tribute-section" id="dau-an-2025" aria-labelledby="tribute-title">
      <div className="tribute-heading" data-reveal>
        <Crown size={30} strokeWidth={1} />
        <p>FTUCHARM 2025</p>
        <h2 id="tribute-title">Dấu ấn 2025</h2>
      </div>
      <figure
        className="tribute-banner tribute-top-three"
        aria-labelledby="tribute-top-three-title"
        data-reveal
      >
        <img
          src="/images/top-3-ftucharm-2025-1536.webp"
          srcSet="/images/top-3-ftucharm-2025-768.webp 768w, /images/top-3-ftucharm-2025-1536.webp 1536w, /images/top-3-ftucharm-2025-2400.webp 2400w"
          sizes="(min-width: 1645px) 1480px, (max-width: 900px) calc(100vw - 30px), 90vw"
          width="3090"
          height="1357"
          alt="Top 3 FTUCHARM 2025: Á khôi 1 Dương Nguyễn Thục Mỹ bên trái, Hoa khôi Lê Phương Nghi ở giữa và Á khôi 2 Phạm Lê Thanh Trúc bên phải."
          loading="lazy"
          decoding="async"
        />
        <figcaption>
          <h3 id="tribute-top-three-title">Tri ân Top 3 FTUCHARM 2025</h3>
          <dl className="tribute-honorees">
            <div>
              <dt>Á khôi 1</dt>
              <dd>Dương Nguyễn Thục Mỹ</dd>
            </div>
            <div>
              <dt>Hoa khôi</dt>
              <dd>Lê Phương Nghi</dd>
            </div>
            <div>
              <dt>Á khôi 2</dt>
              <dd>Phạm Lê Thanh Trúc</dd>
            </div>
          </dl>
        </figcaption>
      </figure>
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
