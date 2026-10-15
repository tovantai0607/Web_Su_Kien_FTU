import { z } from 'zod';

const time = z.string().datetime();
const price = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const votingSettingsSchema = z
  .object({
    open_at: time,
    close_at: time,
    reason: z.string().trim().max(1000).default(''),
  })
  .strict()
  .refine((v) => Date.parse(v.close_at) > Date.parse(v.open_at), {
    message: 'Giờ đóng phải sau giờ mở.',
    path: ['close_at'],
  });
export const saleSettingsSchema = z
  .object({
    revision: z.number().int().min(0),
    phases: z
      .array(
        z
          .object({
            kind: z.enum(['EARLY', 'REGULAR']),
            open_at: time,
            close_at: time,
            prices: z
              .array(z.object({ category_id: z.string().uuid(), price_vnd: price }).strict())
              .length(2),
          })
          .strict()
          .refine((p) => Date.parse(p.close_at) > Date.parse(p.open_at), {
            message: 'Giờ đóng phải sau giờ mở.',
            path: ['close_at'],
          })
          .refine(
            (p) => new Set(p.prices.map((x) => x.category_id)).size === 2,
            'Hai hạng vé phải khác nhau.',
          ),
      )
      .min(1)
      .max(2),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (
      new Set(v.phases.map((p) => p.kind)).size !== v.phases.length ||
      !v.phases.some((p) => p.kind === 'REGULAR')
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Cần một đợt bán thường và tối đa một đợt bán sớm.',
        path: ['phases'],
      });
    const early = v.phases.find((p) => p.kind === 'EARLY'),
      regular = v.phases.find((p) => p.kind === 'REGULAR');
    if (early && regular && Date.parse(early.close_at) > Date.parse(regular.open_at))
      ctx.addIssue({
        code: 'custom',
        message: 'Bán sớm phải kết thúc trước hoặc đúng lúc bán thường mở.',
        path: ['phases'],
      });
  });
export type VotingSettingsInput = z.infer<typeof votingSettingsSchema>;
export type SaleSettingsInput = z.infer<typeof saleSettingsSchema>;
export type AccountAccess = {
  is_admin: boolean;
  aal: 'aal1' | 'aal2';
  default_admin_path?: '/admin/cau-hinh' | '/admin?muc=publications';
};
export type AdminSettings = {
  server_time: string;
  editions: { id: string; title: string; year: number }[];
  rounds: {
    id: string;
    edition_id: string;
    title: string;
    kind: string;
    published: boolean;
    vote_open_at: string | null;
    vote_close_at: string | null;
    session_state: string | null;
  }[];
  events: {
    id: string;
    edition_id: string;
    title: string;
    published: boolean;
    sales_revision: number;
    categories: { id: string; name: string; position: number; price_vnd: number }[];
    phases: SaleSettingsInput['phases'];
  }[];
};

/** datetime-local always represents Vietnamese time, independent of the device timezone. */
export function toVietnamTime(iso: string | null | undefined) {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.valueOf())
    ? ''
    : new Date(date.valueOf() + 7 * 3600000).toISOString().slice(0, 16);
}
export function fromVietnamTime(local: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) throw new Error('Nhập ngày và giờ hợp lệ.');
  const date = new Date(local + ':00+07:00');
  if (Number.isNaN(date.valueOf()) || toVietnamTime(date.toISOString()) !== local)
    throw new Error('Nhập ngày và giờ hợp lệ.');
  return date.toISOString();
}
