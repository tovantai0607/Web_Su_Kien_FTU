import { useEffect, useRef, type CSSProperties } from 'react';
import { useMotionDisabled } from './MotionSystem';

/** Decorative stage layers share the same visibility and accessibility lifecycle. */
export function StageAtmosphere({ subtle = false }: { subtle?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const disabled = useMotionDisabled();
  useEffect(() => {
    const element = root.current;
    if (!element || disabled) return;
    let visible = false;
    const sync = () => {
      element.dataset.running = visible && !document.hidden ? 'true' : 'false';
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      sync();
    });
    observer.observe(element);
    document.addEventListener('visibilitychange', sync);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', sync);
    };
  }, [disabled]);
  return (
    <div
      ref={root}
      className={`stage-atmosphere${subtle ? ' stage-atmosphere-subtle' : ''}`}
      data-running="false"
      data-disabled={disabled}
      aria-hidden="true"
    >
      {!subtle && (
        <div className="stage-petals">
          {Array.from({ length: 12 }, (_, i) => (
            <span
              className="stage-petal"
              key={i}
              style={
                {
                  '--petal-x': `${[4, 92, 71, 15, 85, 62, 96, 7, 77, 89, 58, 20][i]}%`,
                  '--petal-size': `${12 + (i % 4) * 4}px`,
                  '--petal-duration': `${18 + (i % 5) * 3}s`,
                  '--petal-delay': `${-i * 3.7}s`,
                  '--petal-drift': `${i % 2 ? -45 : 55}px`,
                } as CSSProperties
              }
            />
          ))}
        </div>
      )}
      {subtle && (
        <div className="stage-pearls">
          <span className="stage-pearl stage-pearl-1" />
        </div>
      )}
      <div className="stage-smoke stage-smoke-near" />
      {!subtle && <div className="stage-smoke stage-smoke-far" />}
    </div>
  );
}
