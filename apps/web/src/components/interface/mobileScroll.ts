export const compactMotionQuery = '(max-width: 900px), (pointer: coarse)';
export const mobileScrollEvent = 'ftucharm:mobile-scroll';
export const isMobileScrolling = () => document.documentElement.dataset.mobileScrolling === 'true';

/** One passive listener for the page; no layout reads or React renders per scroll. */
export function trackMobileScroll() {
  const compact = matchMedia(compactMotionQuery);
  let timer = 0;
  const update = (scrolling: boolean) => {
    if (scrolling === isMobileScrolling()) return;
    if (scrolling) document.documentElement.dataset.mobileScrolling = 'true';
    else delete document.documentElement.dataset.mobileScrolling;
    document.dispatchEvent(new Event(mobileScrollEvent));
  };
  const finish = () => {
    window.clearTimeout(timer);
    update(false);
  };
  const scroll = () => {
    if (!compact.matches || document.hidden) return;
    update(true);
    window.clearTimeout(timer);
    // Includes inertial scrolling; fallback for browsers without scrollend.
    timer = window.setTimeout(finish, 180);
  };
  window.addEventListener('scroll', scroll, { passive: true });
  window.addEventListener('scrollend', finish, { passive: true });
  compact.addEventListener('change', finish);
  document.addEventListener('visibilitychange', finish);
  return () => {
    window.removeEventListener('scroll', scroll);
    window.removeEventListener('scrollend', finish);
    compact.removeEventListener('change', finish);
    document.removeEventListener('visibilitychange', finish);
    finish();
  };
}
