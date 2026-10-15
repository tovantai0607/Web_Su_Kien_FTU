import { z } from 'zod';
import type { Contestant, Edition, TimelineEvent } from './index';
import type { Offer } from './purchases';

export const officialEditionSlug = 'ftucharm-2027';
export function registrationState(edition: Edition | null, now: number) {
  if (!edition?.registration_open_at || !edition.registration_close_at) return 'UNCONFIGURED';
  if (now < Date.parse(edition.registration_open_at)) return 'UPCOMING';
  return now < Date.parse(edition.registration_close_at) ? 'OPEN' : 'CLOSED';
}
export type Program = {
  edition: Edition | null;
  server_time: string;
  timeline: TimelineEvent[];
  offers: Offer[];
  registration_state: ReturnType<typeof registrationState>;
};
const photo = z
  .string()
  .regex(/^\/api\/public-images\/[a-f0-9-]{36}\.webp$|^\/images\/[a-zA-Z0-9_/-]+\.(webp|png|jpg)$/)
  .nullable();
export const publicationSchema = z
  .object({
    id: z.uuid(),
    edition_id: z.uuid(),
    contestant_id: z.uuid(),
    round_id: z.uuid().nullable(),
    award_name: z.string().trim().max(160),
    photo_url: photo,
    published: z.boolean(),
  })
  .strict()
  .refine((v) => v.round_id !== null || v.award_name.length > 0, 'Nhập tên hạng mục.');
export type Publication = z.infer<typeof publicationSchema> & { contestant?: Contestant };
export type PublicationAdmin = {
  editions: Edition[];
  rounds: { id: string; edition_id: string; title: string }[];
  contestants: Contestant[];
  publications: Publication[];
};
