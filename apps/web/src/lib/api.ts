import { createClient } from '@supabase/supabase-js';
import { demoEdition, demoTimeline, demoContestants, demoNews, type Edition } from '@ftu/shared';
import { createAuthStorage } from './auth-policy';
export const preview = import.meta.env.VITE_PREVIEW_MODE === 'true';
const url = import.meta.env.VITE_SUPABASE_URL,
  key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const supabase =
  !preview && url && key && key !== 'replace_with_publishable_key'
    ? createClient(url, key, {
        auth: {
          // Custom storage keeps tokens in memory, and persists only temporary PKCE verifiers.
          persistSession: true,
          storage: createAuthStorage({
            getItem: (k) => window.localStorage.getItem(k),
            setItem: (k, v) => window.localStorage.setItem(k, v),
            removeItem: (k) => window.localStorage.removeItem(k),
          }),
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: 'pkce',
        },
      })
    : null;
// Preview contains clearly labeled public fixtures and never pretends to complete a write.
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (preview && (!options.method || options.method === 'GET')) {
    const route = path.split('?')[0];
    const fixtures: Record<string, unknown> = {
      '/editions/current': demoEdition,
      '/editions': [demoEdition],
      '/timeline': demoTimeline,
      '/contestants': demoContestants,
      '/news': demoNews,
      '/rounds': [],
      '/sponsors': [],
    };
    if (route in fixtures) return fixtures[route] as T;
    if (route.startsWith('/contestants/'))
      return (demoContestants.find((s) => s.slug === route.split('/').at(-1)) ?? null) as T;
    if (route.startsWith('/news/'))
      return (demoNews.find((s) => s.slug === route.split('/').at(-1)) ?? null) as T;
  }
  if (preview && options.method && options.method !== 'GET')
    throw new Error('Bản xem trước không lưu hồ sơ hoặc phiếu bầu.');
  const session = await supabase?.auth.getSession();
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof File))
    headers.set('Content-Type', 'application/json');
  if (session?.data.session)
    headers.set('Authorization', `Bearer ${session.data.session.access_token}`);
  const response = await fetch('/api' + path, {
    ...options,
    headers,
    signal: options.signal ?? AbortSignal.timeout(15000),
  });
  const result = (await response.json()) as { data: T; error?: string };
  if (!response.ok) throw new Error(result.error ?? 'Không thể kết nối. Vui lòng thử lại.');
  return result.data;
}
export async function currentEdition() {
  return api<Edition | null>('/editions/current');
}
