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
    <div className="stage-crown">
      <img
        src="/images/crown-pearl.webp"
        srcSet="/images/crown-pearl-700.webp 700w, /images/crown-pearl.webp 1400w"
        sizes="(max-width: 900px) 100vw, 55vw"
        crossOrigin="anonymous"
        width="1400"
        height="700"
        alt=""
        fetchPriority="high"
        decoding="async"
      />
      <span className="crown-shine" />
    </div>
  );
}
