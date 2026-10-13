import type { ReactNode } from 'react';

/** Adapted from Magic UI Marquee. Copyright (c) Magic UI, MIT.
 * docs/licenses/magic-ui.txt. Duplicate is inert; original links remain reachable. */
export function Marquee({ children }: { children: ReactNode }) {
  return (
    <div className="logo-marquee">
      <div className="marquee-track">{children}</div>
      <div className="marquee-track marquee-copy" aria-hidden="true" inert>
        {children}
      </div>
    </div>
  );
}
