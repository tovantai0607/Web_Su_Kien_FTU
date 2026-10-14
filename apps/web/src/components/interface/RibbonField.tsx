import { useEffect, useRef } from 'react';
import { useMotionDisabled } from './MotionSystem';

/** Optional GPU scene; content and static artwork remain usable during loading. */
export function RibbonField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const disabled = useMotionDisabled();
  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.closest('section');
    if (!canvas || !host || disabled) return;
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    const timer = window.setTimeout(() => {
      void import('./stageScene')
        .then(({ mountStage }) => {
          if (!cancelled) cleanup = mountStage(canvas, host);
        })
        .catch(() => {
          /* CSS fallback covers failed chunk downloads. */
        });
    }, 1200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      cleanup?.();
    };
  }, [disabled]);
  return (
    <div className="ribbon-field" aria-hidden="true">
      {!disabled && <canvas ref={canvasRef} />}
    </div>
  );
}
