const marks = [
  { id: 'cosmo', box: [2030, 50, 420, 210], label: 'COSMO Academy' },
  { id: 'uni', box: [2450, 65, 500, 160], label: 'UNI media' },
];

/** Official replacement emblems and outlined, scalable event lettering. */
export default function PartnerStrip() {
  return (
    <section className="partner-strip" aria-label="Đơn vị tổ chức và đồng hành">
      <div className="partner-strip-inner">
        <svg
          className="partner-organizers"
          viewBox="0 0 660 190"
          role="img"
          aria-label="Đại học Ngoại thương, Đoàn Thanh niên, Hội Sinh viên và LiS"
        >
          <image href="/images/ftu-official.png" x="10" y="25" width="140" height="140" />
          <svg
            x="170"
            y="0"
            width="140"
            height="190"
            aria-hidden="true"
            viewBox="260 45 155 190"
            overflow="hidden"
          >
            <image href="/images/partner-strip-original.png" width="3000" height="298" />
          </svg>
          <image href="/images/hsv-official.png" x="335" y="25" width="140" height="140" />
          <svg
            x="500"
            y="15"
            width="140"
            height="160"
            aria-hidden="true"
            viewBox="560 60 150 180"
            overflow="hidden"
          >
            <image href="/images/partner-strip-original.png" width="3000" height="298" />
          </svg>
        </svg>
        <svg
          className="partner-identity"
          viewBox="0 0 760 210"
          role="img"
          aria-label="FTUCHARM – Duyên dáng Ngoại thương"
        >
          <defs>
            <linearGradient id="partner-wordmark-fill" x1="0" x2="1">
              <stop offset="0" stopColor="#ee7775" />
              <stop offset="0.5" stopColor="#fff1e8" />
              <stop offset="1" stopColor="#e34c51" />
            </linearGradient>
          </defs>
          <image
            href="/images/ftucharm-logo-transparent.webp"
            x="0"
            y="4"
            width="230"
            height="202"
          />
          <text
            x="245"
            y="117"
            textLength="500"
            lengthAdjust="spacingAndGlyphs"
            className="partner-wordmark"
          >
            FTUCHARM
          </text>
          <text
            x="250"
            y="162"
            textLength="490"
            lengthAdjust="spacingAndGlyphs"
            className="partner-tagline"
          >
            DUYÊN DÁNG NGOẠI THƯƠNG
          </text>
        </svg>
        {marks.map(({ id, box: [x, y, width, height], label }) => (
          <svg
            key={id}
            className={`partner-${id}`}
            viewBox={`${x} ${y} ${width} ${height}`}
            role="img"
            aria-label={label}
          >
            <defs>
              <clipPath id={`partner-${id}-crop`}>
                <rect x={x} y={y} width={width} height={height} />
              </clipPath>
              <filter
                id={`partner-${id}-sharp`}
                x="-5%"
                y="-5%"
                width="110%"
                height="110%"
                colorInterpolationFilters="sRGB"
              >
                <feGaussianBlur in="SourceGraphic" stdDeviation="0.55" result="soft" />
                <feComposite
                  in="SourceGraphic"
                  in2="soft"
                  operator="arithmetic"
                  k1="0"
                  k2="1.6"
                  k3="-0.6"
                  k4="0"
                />
              </filter>
            </defs>
            <g clipPath={`url(#partner-${id}-crop)`}>
              <image
                href="/images/partner-strip-original.png"
                width="3000"
                height="298"
                filter={`url(#partner-${id}-sharp)`}
              />
            </g>
          </svg>
        ))}
      </div>
    </section>
  );
}
