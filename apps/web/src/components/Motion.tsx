import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';

/** One observer per route; late-arriving content shares the same reveal lifecycle. */
export function MotionPage({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = root.current;
    if (!container || !('IntersectionObserver' in window)) return;
    const seen = new WeakSet<Element>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) {
            entry.target.classList.remove('reveal-waiting');
            entry.target.classList.add('is-revealed');
            observer.unobserve(entry.target);
          }
      },
      { threshold: 0.08 },
    );
    const scan = () => {
      container
        .querySelectorAll(
          '[data-reveal], .section-heading, .contestant-card, .full-timeline article, .article-grid > *, .ticket-card',
        )
        .forEach((element) => {
          if (seen.has(element)) return;
          seen.add(element);
          element.classList.add('reveal-item');
          if (element.getBoundingClientRect().top > innerHeight)
            element.classList.add('reveal-waiting');
          observer.observe(element);
        });
    };
    scan();
    const mutation = new MutationObserver(scan);
    mutation.observe(container, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      mutation.disconnect();
    };
  }, []);
  return (
    <div ref={root} className="route-scene">
      {children}
    </div>
  );
}

export function AnimatedText({ text }: { text: string }) {
  return (
    <span className="animated-text">
      <span className="sr-only">{text}</span>
      {text.split(' ').map((word, index) => (
        <span className="word-mask" aria-hidden="true" key={`${word}-${index}`}>
          <span style={{ '--word': index } as CSSProperties}>{word}</span>{' '}
        </span>
      ))}
    </span>
  );
}

export function StageCrown() {
  return (
    <svg className="stage-crown" viewBox="0 0 600 500" fill="none" aria-hidden="true">
      <defs>
        <linearGradient
          id="crown-metal"
          x1="100"
          y1="80"
          x2="440"
          y2="400"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#fff" />
          <stop offset=".24" stopColor="#f2cbea" />
          <stop offset=".45" stopColor="#9981c2" />
          <stop offset=".55" stopColor="#fff" />
          <stop offset=".8" stopColor="#b2bcf1" />
          <stop offset="1" stopColor="#fff1fa" />
        </linearGradient>
        <linearGradient
          id="crown-gem"
          x1="260"
          y1="160"
          x2="340"
          y2="310"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#fff" />
          <stop offset=".5" stopColor="#dc9ec8" />
          <stop offset="1" stopColor="#7361a8" />
        </linearGradient>
      </defs>
      <ellipse cx="300" cy="406" rx="160" ry="19" fill="#8064a2" opacity=".1" />
      <path
        d="M138 330 94 173l114 77 92-134 92 134 114-77-44 157Z"
        fill="url(#crown-metal)"
        fillOpacity=".42"
        stroke="url(#crown-metal)"
        strokeWidth="8"
        strokeLinejoin="round"
      />
      <path
        d="m138 330 70-80 92 80 92-80 70 80M208 250l32 80m152-80-32 80"
        stroke="url(#crown-metal)"
        strokeWidth="4"
      />
      <path
        d="M138 330q162 54 324 0v35q-162 57-324 0Z"
        fill="url(#crown-metal)"
        stroke="#fff"
        strokeWidth="2"
      />
      <path d="m300 203 38 52-38 57-38-57Z" fill="url(#crown-gem)" stroke="#fff" strokeWidth="3" />
      <path d="m300 203 0 109m-38-57h76" stroke="#fff" strokeOpacity=".65" />
      {[
        [94, 166],
        [300, 108],
        [506, 166],
      ].map(([cx, cy]) => (
        <circle
          key={cx}
          cx={cx}
          cy={cy}
          r="12"
          fill="url(#crown-metal)"
          stroke="#fff"
          strokeWidth="3"
        />
      ))}
      {[175, 225, 275, 325, 375, 425].map((cx) => (
        <circle key={cx} cx={cx} cy={cx < 200 || cx > 400 ? 353 : 362} r="5" fill="#fff" />
      ))}
      <path d="m404 117 6 21 21 6-21 6-6 21-6-21-21-6 21-6Z" fill="white" />
    </svg>
  );
}
