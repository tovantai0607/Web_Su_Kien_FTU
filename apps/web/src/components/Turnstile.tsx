import { useEffect, useRef } from 'react';
type TurnstileAPI = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileAPI;
  }
}
let scriptReady: Promise<void> | undefined;
export function Turnstile({
  action,
  onToken,
}: {
  action: string;
  onToken: (value: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const callback = useRef(onToken);
  callback.current = onToken;
  const sitekey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
  useEffect(() => {
    if (!sitekey || sitekey === 'replace_with_site_key') return;
    let id: string | undefined,
      cancelled = false;
    scriptReady ??= new Promise((resolve, reject) => {
      if (window.turnstile) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.onload = () => resolve();
      script.onerror = reject;
      document.head.appendChild(script);
    });
    scriptReady
      .then(() => {
        if (!cancelled && ref.current)
          id = window.turnstile?.render(ref.current, {
            sitekey,
            action,
            callback: (v: string) => callback.current(v),
            'expired-callback': () => callback.current(''),
            'error-callback': () => callback.current(''),
          });
      })
      .catch(() => callback.current(''));
    return () => {
      cancelled = true;
      if (id) window.turnstile?.remove(id);
    };
  }, [action, sitekey]);
  return (
    <div ref={ref}>
      {!sitekey || sitekey === 'replace_with_site_key' ? (
        <p className="fine-print">Xác minh chống spam sẽ xuất hiện khi BTC hoàn tất cấu hình.</p>
      ) : null}
    </div>
  );
}
