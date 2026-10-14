import { Children, createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';
import { LazyMotion, MotionConfig, m } from 'motion/react';

const loadFeatures = () => import('./MotionFeatures').then((module) => module.default);
const MotionDisabled = createContext(false);
const reducedMotionQuery = '(prefers-reduced-motion: reduce)';
function subscribeReducedMotion(notify: () => void) {
  const query = window.matchMedia(reducedMotionQuery);
  query.addEventListener('change', notify);
  return () => query.removeEventListener('change', notify);
}
const readReducedMotion = () => window.matchMedia(reducedMotionQuery).matches;

export const useSystemReducedMotion = () =>
  useSyncExternalStore(subscribeReducedMotion, readReducedMotion, () => true);

export function InterfaceMotion({
  paused,
  allowMotion = false,
  children,
}: {
  paused: boolean;
  allowMotion?: boolean;
  children: ReactNode;
}) {
  const reduced = useSystemReducedMotion();
  const disabled = paused || (reduced && !allowMotion);
  return (
    <MotionDisabled.Provider value={disabled}>
      <LazyMotion features={loadFeatures} strict>
        <MotionConfig
          reducedMotion={disabled ? 'always' : allowMotion ? 'never' : 'user'}
          transition={{ duration: disabled ? 0 : 0.35 }}
        >
          {children}
        </MotionConfig>
      </LazyMotion>
    </MotionDisabled.Provider>
  );
}
export const useMotionDisabled = () => useContext(MotionDisabled);

/** Adapted from React Bits BlurText (David Haz). See docs/licenses/react-bits.txt. */
export function BlurText({ text }: { text: string }) {
  const disabled = useMotionDisabled();
  return (
    <span className="blur-text">
      <span className="sr-only">{text}</span>
      {text.split(' ').map((word, index) => (
        <m.span
          aria-hidden="true"
          key={`${word}-${index}`}
          initial={disabled ? false : { y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{
            duration: disabled ? 0 : 0.65,
            delay: disabled ? 0 : index * 0.055,
            ease: 'easeOut',
          }}
          style={{ display: 'inline-block' }}
        >
          {word}
          {index < text.split(' ').length - 1 ? '\u00a0' : ''}
        </m.span>
      ))}
    </span>
  );
}

/** Motion Primitives AnimatedGroup, reduced to a fade preset with stable child keys.
 * Copyright (c) 2024 ibelick. MIT — docs/licenses/motion-primitives.txt. */
export function AnimatedGroup({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const disabled = useMotionDisabled();
  return (
    <m.div
      className={className}
      initial={disabled ? false : 'hidden'}
      animate="visible"
      variants={{ visible: { transition: { staggerChildren: disabled ? 0 : 0.06 } } }}
    >
      {Children.toArray(children).map((child, index) => (
        <m.div
          key={typeof child === 'object' && 'key' in child ? child.key : index}
          variants={{ hidden: { opacity: 0.5, y: 8 }, visible: { opacity: 1, y: 0 } }}
          transition={{ duration: disabled ? 0 : 0.3 }}
        >
          {child}
        </m.div>
      ))}
    </m.div>
  );
}

export function HoverPortrait({ children }: { children: ReactNode }) {
  const disabled = useMotionDisabled();
  return (
    <m.div
      className="portrait"
      whileHover={disabled ? undefined : { y: -5 }}
      transition={{ duration: disabled ? 0 : 0.25 }}
    >
      {children}
    </m.div>
  );
}
