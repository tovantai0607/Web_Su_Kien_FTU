import { useLayoutEffect, useRef } from 'react';
import { useMotionDisabled } from './MotionSystem';
import { mountStage } from './stageScene';

/** Paint the first GPU frame before revealing the hero, including on reload. */
export function RibbonField() {
  const root = useRef<HTMLDivElement>(null);
  const disabled = useMotionDisabled();
  useLayoutEffect(() => {
    const element = root.current;
    const host = element?.closest('section');
    if (!element || !host || disabled) return;
    // A fresh canvas also handles StrictMode remounts and motion toggles safely.
    const canvas = document.createElement('canvas');
    element.appendChild(canvas);
    const cleanup = mountStage(canvas, host);
    return () => {
      cleanup();
      canvas.remove();
    };
  }, [disabled]);
  return <div ref={root} className="ribbon-field" aria-hidden="true" />;
}
