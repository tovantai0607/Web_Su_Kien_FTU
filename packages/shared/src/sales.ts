import { z } from 'zod';

export type SaleState = 'UPCOMING' | 'OPEN' | 'SOLD_OUT' | 'CLOSED';
export type SalesSeat = {
  id: string;
  category_id: string;
  row_label: string;
  seat_number: number;
  label: string;
  state: 'AVAILABLE' | 'HELD' | 'SOLD' | 'UNAVAILABLE';
};
export type SalesCategory = {
  id: string;
  name: string;
  position: number;
  price_vnd: number;
  capacity: number;
  held: number;
  sold: number;
  available: number;
};
export type SalesEvent = {
  id: string;
  edition_id: string;
  round_id: string;
  slug: string;
  title: string;
  venue: string;
  starts_at: string;
  sale_open_at: string;
  sale_close_at: string;
  hold_ttl_seconds: number;
  max_tickets: number;
  sale_state: SaleState;
  available: number;
  categories: SalesCategory[];
  seats: SalesSeat[];
  pricing_version?: string | null;
  phases?: { kind: 'EARLY' | 'REGULAR'; open_at: string; close_at: string }[];
  active_phase?: 'EARLY' | 'REGULAR' | null;
};
export type SalesCatalog = { server_time: string; events: SalesEvent[] };
export type SalesHold = {
  id: string;
  event_id: string;
  status: 'PENDING_PAYMENT' | 'PAID' | 'EXPIRED' | 'CANCELLED';
  quantity: number;
  total_vnd: number;
  expires_at: string;
  server_time: string;
  items: {
    seat_id: string;
    seat_label: string;
    category_id: string;
    category_name: string;
    unit_price_vnd: number;
  }[];
};
export const salesHoldSchema = z
  .object({
    pricing_version: z.string().max(100).nullable().optional(),
    seat_ids: z
      .array(z.string().uuid())
      .min(1, 'Chọn ít nhất một ghế.')
      .max(10, 'Tối đa 10 ghế mỗi lần.')
      .refine((ids) => new Set(ids).size === ids.length, 'Ghế không được trùng.'),
  })
  .strict();
export function currentSaleState(event: SalesEvent, serverNow: number): SaleState {
  if (event.phases?.length) {
    const active = event.phases.find(
      (p) => serverNow >= Date.parse(p.open_at) && serverNow < Date.parse(p.close_at),
    );
    if (active) return event.available === 0 ? 'SOLD_OUT' : 'OPEN';
    return event.phases.some((p) => serverNow < Date.parse(p.open_at)) ? 'UPCOMING' : 'CLOSED';
  }
  if (serverNow < Date.parse(event.sale_open_at)) return 'UPCOMING';
  if (serverNow >= Date.parse(event.sale_close_at)) return 'CLOSED';
  return event.available === 0 ? 'SOLD_OUT' : 'OPEN';
}

// Explicit preview fixtures only; no seed or production inventory is created here.
const previewStart = Date.now();
const fixtureId = (n: number) => `99000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export function demoSalesCatalog(identifier?: string): SalesCatalog {
  const events: SalesEvent[] = ['Bán kết', 'Chung kết'].map((title, index) => {
    const categories: SalesCategory[] = [1, 2].map((position) => ({
      id: fixtureId(100 + index * 10 + position),
      name: `Hạng ${position}`,
      position,
      price_vnd: 100000,
      capacity: 64,
      held: 2,
      sold: 3,
      available: 59,
    }));
    const event: SalesEvent = {
      id: fixtureId(index + 1),
      edition_id: fixtureId(10),
      round_id: fixtureId(index + 20),
      slug: index === 0 ? 'ban-ket-demo' : 'chung-ket-demo',
      title: `Đêm ${title.toLowerCase()} · Minh họa`,
      venue: 'Địa điểm minh họa · BTC sẽ cấu hình',
      starts_at: new Date(previewStart + (index + 2) * 86400000).toISOString(),
      sale_open_at: new Date(previewStart + (index === 0 ? 86400000 : -60000)).toISOString(),
      sale_close_at: new Date(previewStart + (index === 0 ? 172800000 : 3600000)).toISOString(),
      hold_ttl_seconds: 300,
      max_tickets: 10,
      sale_state: index === 0 ? 'UPCOMING' : 'OPEN',
      available: 118,
      categories,
      seats: categories.flatMap((category, c) =>
        Array.from({ length: 4 }, (_, row) =>
          Array.from({ length: 16 }, (_, seat) => ({
            id: fixtureId(1000 + index * 1000 + c * 200 + row * 16 + seat),
            category_id: category.id,
            row_label: String.fromCharCode(65 + c * 4 + row),
            seat_number: seat + 1,
            label: `${String.fromCharCode(65 + c * 4 + row)}${seat + 1}`,
            state:
              row === 0 && seat < 2
                ? ('HELD' as const)
                : row === 2 && seat >= 5 && seat <= 7
                  ? ('SOLD' as const)
                  : ('AVAILABLE' as const),
          })),
        ).flat(),
      ),
    };
    event.sale_state = currentSaleState(event, Date.now());
    return event;
  });
  return {
    server_time: new Date().toISOString(),
    events: events
      .filter((event) => !identifier || event.slug === identifier || event.id === identifier)
      .map((event) => ({ ...event, seats: identifier ? event.seats : [] })),
  };
}
