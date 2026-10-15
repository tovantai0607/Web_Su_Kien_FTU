import { z } from 'zod';

const text = (label: string, max = 160) => z.string().trim().min(1, `Nhập ${label}.`).max(max);
export const buyerSchema = z
  .object({
    name: text('họ tên'),
    school: text('trường'),
    cohort_class: text('khóa/lớp'),
    student_id: text('MSSV', 80),
    email: z.string().trim().email('Email không hợp lệ.').max(254),
    phone: text('số điện thoại', 32),
    facebook: text('Facebook', 300),
  })
  .strict();
export const purchaseSelectionSchema = z
  .object({
    offer_id: z.string().uuid(),
    buyer: buyerSchema,
    lines: z
      .array(
        z
          .object({
            product_id: z.string().uuid(),
            bundle_size: z.union([z.literal(1), z.literal(2), z.literal(3)]),
            quantity: z.number().int().positive().max(2147483647),
          })
          .strict(),
      )
      .min(1)
      .max(100)
      .refine(
        (v) => new Set(v.map((l) => `${l.product_id}:${l.bundle_size}`)).size === v.length,
        'Không gửi trùng loại vé/combo.',
      ),
  })
  .strict();
export const completionSchema = z.object({ evidence_id: z.string().uuid() }).strict();
export const productConfigSchema = z
  .object({
    id: z.string().uuid(),
    name: text('tên loại vé'),
    tier: z.enum(['EARLY', 'NORMAL']),
    quota: z.number().int().nonnegative().max(2147483647),
    price_vnd: z.number().int().positive().max(2147483647),
    combo2_vnd: z.number().int().positive().max(2147483647).nullable(),
    combo3_vnd: z.number().int().positive().max(2147483647).nullable(),
    opens_at: z.string().datetime({ offset: true }),
    closes_at: z.string().datetime({ offset: true }),
    enabled: z.boolean(),
  })
  .strict()
  .refine((p) => Date.parse(p.closes_at) > Date.parse(p.opens_at), {
    message: 'Ngày đóng phải sau ngày mở.',
    path: ['closes_at'],
  });
export const offerConfigSchema = z
  .object({
    id: z.string().uuid(),
    edition_id: z.string().uuid(),
    round_id: z.string().uuid(),
    slug: z.string().regex(/^[a-z0-9-]{1,100}$/),
    title: text('tên đêm'),
    venue: z.string().trim().max(300),
    starts_at: z.string().datetime({ offset: true }).nullable(),
    published: z.boolean(),
    mode: z.enum(['DEMO', 'LIVE']),
    payment_instructions: z.string().trim().max(2000),
    // Same-origin, locally hosted image; never accept executable SVG/data or an arbitrary external URL.
    qr_path: z
      .string()
      .regex(/^\/images\/[a-zA-Z0-9_/-]+\.(png|webp|jpg)$/)
      .nullable(),
    products: z.array(productConfigSchema).max(100),
    total_quota: z.number().int().positive().nullable().optional(),
    early_quota: z.number().int().nonnegative().nullable().optional(),
    early_open_at: z.string().datetime({ offset: true }).nullable().optional(),
    early_close_at: z.string().datetime({ offset: true }).nullable().optional(),
    normal_close_at: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message });
    if (
      new Set(v.products.map((p) => p.id)).size !== v.products.length ||
      new Set(v.products.map((p) => JSON.stringify([p.name, p.tier]))).size !== v.products.length
    )
      issue('products', 'Mỗi hạng chỉ có một cấu hình cho từng đợt vé sớm/vé thường.');
    if (v.total_quota == null) return;
    if (v.early_quota == null || v.early_quota > v.total_quota)
      issue('early_quota', 'Số vé sớm phải từ 0 đến tổng số vé.');
    if (!v.early_open_at) issue('early_open_at', 'Nhập giờ mở vé sớm.');
    if (!v.early_close_at || Date.parse(v.early_close_at) <= Date.parse(v.early_open_at ?? ''))
      issue('early_close_at', 'Kết thúc vé sớm phải sau giờ mở.');
    if (!v.normal_close_at || Date.parse(v.normal_close_at) <= Date.parse(v.early_close_at ?? ''))
      issue('normal_close_at', 'Đóng vé thường phải sau khi kết thúc vé sớm.');
    const early = v.products.filter((p) => p.tier === 'EARLY').reduce((n, p) => n + p.quota, 0);
    const normal = v.products.filter((p) => p.tier === 'NORMAL').reduce((n, p) => n + p.quota, 0);
    if (v.early_quota != null && (early > v.early_quota || normal > v.total_quota - v.early_quota))
      issue('products', 'Phân bổ từng hạng vượt số vé sớm hoặc số vé thường còn lại.');
  });

export type Buyer = z.infer<typeof buyerSchema>;
export type PurchaseSelection = z.infer<typeof purchaseSelectionSchema>;
export type Product = z.infer<typeof productConfigSchema> & {
  available: number;
  sold: number;
  held: number;
  base_quota?: number;
  state: 'UPCOMING' | 'OPEN' | 'SOLD_OUT' | 'CLOSED';
};
export type Offer = Omit<z.infer<typeof offerConfigSchema>, 'products'> & {
  products: Product[];
  checkout_enabled: boolean;
  event_date?: string | null;
  phase?: 'UPCOMING' | 'EARLY' | 'NORMAL' | 'CLOSED';
};
export type PurchaseCatalog = { server_time: string; offers: Offer[] };
export type PurchaseLine = {
  product_id: string;
  name: string;
  tier: string;
  bundle_size: number;
  quantity: number;
  ticket_quantity: number;
  unit_price_vnd: number;
};
export type Purchase = {
  id: string;
  code: string;
  offer_id: string;
  round_id: string;
  status: 'HELD' | 'EXPIRED' | 'COMPLETED';
  buyer: Buyer;
  lines: PurchaseLine[];
  quantity: number;
  total_vnd: number;
  expires_at: string;
  completed_at: string | null;
  evidence_id: string | null;
  server_time: string;
  payment: { mode: 'DEMO' | 'LIVE'; instructions: string; qr_path: string | null };
};
export function demoPurchaseCatalog(): PurchaseCatalog {
  const id = (n: number) => `98000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  return {
    server_time: new Date().toISOString(),
    offers: ['ban-ket', 'chung-ket'].map((slug, i) => ({
      id: id(i + 1),
      edition_id: id(10),
      round_id: id(20 + i),
      slug: `${slug}-demo`,
      title: i ? 'Đêm chung kết' : 'Đêm bán kết',
      venue: 'Địa điểm do BTC công bố',
      starts_at: i ? null : '2027-04-25T12:00:00Z',
      published: true,
      mode: 'DEMO',
      payment_instructions: 'DEMO — không chuyển tiền thật. Giá và quota chỉ minh họa.',
      qr_path: null,
      checkout_enabled: false,
      products: ['The Intro', 'The Bridge', 'The Chorus'].map((name, j) => ({
        id: id(100 + i * 10 + j),
        name,
        tier: 'EARLY' as const,
        quota: 100,
        price_vnd: 100000,
        combo2_vnd: 190000,
        combo3_vnd: 280000,
        opens_at: i ? '2027-04-26T00:00:00+07:00' : '2027-03-29T00:00:00+07:00',
        closes_at: i ? '2027-04-27T00:00:00+07:00' : '2027-03-31T00:00:00+07:00',
        enabled: true,
        available: 100,
        held: 0,
        sold: 0,
        state: 'UPCOMING' as const,
      })),
    })),
  };
}
