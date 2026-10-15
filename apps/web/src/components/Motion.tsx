import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { useCompactMotion, useMotionDisabled } from './interface/MotionSystem';

export function StageParallax({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const disabled = useMotionDisabled();
  const compact = useCompactMotion();
  useEffect(() => {
    const element = root.current;
    const section = element?.closest('section');
    if (!element || !section) return;
    if (disabled) {
      element.style.transform = 'none';
      return;
    }
    let frame = 0;
    let visible = true;
    const draw = () => {
      frame = 0;
      if (!visible || document.hidden || compact) return;
      const progress = Math.max(
        0,
        Math.min(1, -section.getBoundingClientRect().top / section.offsetHeight),
      );
      element.style.transform = `translate3d(0, ${-progress * 50}px, 0) rotateY(${progress * 12}deg) rotateZ(${progress * 8}deg)`;
    };
    const schedule = () => {
      if (visible && !document.hidden && !frame) frame = requestAnimationFrame(draw);
    };
    const syncVisibility = () => {
      if (document.hidden || !visible) {
        cancelAnimationFrame(frame);
        frame = 0;
      } else schedule();
      section.dataset.stageRunning = visible && !document.hidden ? 'true' : 'false';
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      syncVisibility();
    });
    observer.observe(section);
    document.addEventListener('visibilitychange', syncVisibility);
    if (!compact) {
      window.addEventListener('scroll', schedule, { passive: true });
      window.addEventListener('resize', schedule);
    }
    draw();
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      observer.disconnect();
      document.removeEventListener('visibilitychange', syncVisibility);
      section.dataset.stageRunning = 'false';
      element.style.transform = 'none';
    };
  }, [disabled, compact]);
  return (
    <div ref={root} className="crown-scroll">
      {children}
    </div>
  );
}

/** One observer per route; late-arriving content shares the same reveal lifecycle. */
export function MotionPage({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const disabled = useMotionDisabled();
  useEffect(() => {
    const container = root.current;
    if (!container || disabled || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    let active: HTMLElement | null = null;
    let frame = 0;
    let x = 0,
      y = 0;
    const reset = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      active?.style.removeProperty('--tilt-x');
      active?.style.removeProperty('--tilt-y');
      active = null;
    };
    const move = (event: PointerEvent) => {
      const target =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>(
              '.contestant-card, .article-grid > article, .sponsor-tile',
            )
          : null;
      if (!target || event.pointerType !== 'mouse') {
        reset();
        return;
      }
      if (active !== target) {
        reset();
        active = target;
      }
      const rect = target.getBoundingClientRect();
      x = (event.clientX - rect.left) / rect.width - 0.5;
      y = (event.clientY - rect.top) / rect.height - 0.5;
      if (!frame)
        frame = requestAnimationFrame(() => {
          active?.style.setProperty('--tilt-x', `${-y * 6}deg`);
          active?.style.setProperty('--tilt-y', `${x * 8}deg`);
          frame = 0;
        });
    };
    container.addEventListener('pointermove', move, { passive: true });
    container.addEventListener('pointerleave', reset);
    window.addEventListener('scroll', reset, { passive: true });
    document.addEventListener('visibilitychange', reset);
    return () => {
      reset();
      container.removeEventListener('pointermove', move);
      container.removeEventListener('pointerleave', reset);
      window.removeEventListener('scroll', reset);
      document.removeEventListener('visibilitychange', reset);
    };
  }, [disabled]);
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
        src="/images/ftucharm-logo-transparent.webp"
        sizes="(max-width: 900px) 100vw, 55vw"
        crossOrigin="anonymous"
        width="900"
        height="734"
        alt=""
        fetchPriority="high"
        decoding="async"
      />
      <div className="logo-pieces" aria-hidden="true">
        {['star-left', 'star-right', 'wing-left', 'spine', 'wing-right'].map((part) => (
          <span className={`logo-piece logo-${part}`} key={part} />
        ))}
      </div>
    </div>
  );
}
