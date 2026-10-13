import { z } from 'zod';
export const uuid = z.string().uuid();
export const roles = [
  'CONTESTANT',
  'AUDIENCE',
  'CONTENT_EDITOR',
  'CONTEST_REVIEWER',
  'TICKET_STAFF',
  'CHECKIN_STAFF',
  'VOTE_MANAGER',
  'SUPER_ADMIN',
] as const;
export type Role = (typeof roles)[number];
export const applicationSchema = z
  .object({
    edition_id: uuid,
    full_name: z.string().trim().min(2, 'Nhập họ tên đầy đủ').max(100),
    email: z.string().email('Email chưa hợp lệ').max(254),
    phone: z.string().regex(/^(\+84|0)[0-9]{9,10}$/, 'Số điện thoại chưa hợp lệ'),
    faculty: z.string().trim().min(2).max(150),
    bio: z.string().trim().min(30, 'Giới thiệu ít nhất 30 ký tự').max(2000),
    talents: z.string().trim().max(1000),
    media_ids: z
      .array(uuid)
      .length(3, 'Cần 3 ảnh hồ sơ')
      .refine((ids) => new Set(ids).size === ids.length, 'Ba ảnh hồ sơ phải khác nhau'),
    student_card_media_id: z.string().uuid('Cần ảnh thẻ sinh viên FTU'),
    consent: z.literal(true, { error: 'Bạn cần chấp nhận thể lệ và thông báo dữ liệu' }),
    turnstile_token: z.string().min(1).max(2048),
  })
  .strict()
  .refine((data) => !data.media_ids.includes(data.student_card_media_id), {
    message: 'Ảnh thẻ sinh viên phải khác ảnh hồ sơ',
    path: ['student_card_media_id'],
  });
export const voteSchema = z
  .object({
    round_id: uuid,
    contestant_id: uuid,
    ticket_id: uuid,
    turnstile_token: z.string().min(1).max(2048),
  })
  .strict();
export const reviewSchema = z
  .object({
    status: z.enum(['approved', 'needs_changes', 'rejected']),
    note: z.string().trim().min(5).max(1000),
  })
  .strict();
export const profileUpdateSchema = z
  .object({
    faculty: z.string().trim().min(2).max(150),
    bio: z.string().trim().min(30).max(2000),
    talents: z.string().trim().max(1000),
  })
  .strict();
export const roundSchema = z
  .object({
    edition_id: uuid,
    title: z.string().trim().min(2).max(120),
    kind: z.enum(['preliminary', 'semifinal', 'final']),
    position: z.number().int().min(0).max(100),
    cutoff: z.number().int().min(1).max(1000),
    published: z.boolean(),
    vote_open_at: z.string().datetime().nullable(),
    vote_close_at: z.string().datetime().nullable(),
  })
  .strict()
  .refine(
    (r) =>
      !r.vote_open_at ||
      !r.vote_close_at ||
      Date.parse(r.vote_close_at) > Date.parse(r.vote_open_at),
    'Thời gian đóng phải sau thời gian mở',
  );
export const editionSchema = z
  .object({
    title: z.string().trim().min(2).max(100),
    slug: z
      .string()
      .regex(/^[a-z0-9-]+$/)
      .max(100),
    theme: z.string().trim().max(160),
    year: z.number().int().min(2020).max(2100),
    registration_open_at: z.string().datetime().nullable(),
    registration_close_at: z.string().datetime().nullable(),
    published: z.boolean(),
  })
  .strict();
export const timelineSchema = z
  .object({
    edition_id: uuid,
    title: z.string().min(2).max(120),
    description: z.string().max(1000),
    position: z.number().int().min(0),
    starts_at: z.string().datetime().nullable(),
    ends_at: z.string().datetime().nullable(),
    published: z.boolean(),
  })
  .strict();
export const newsSchema = z
  .object({
    edition_id: uuid,
    title: z.string().min(3).max(160),
    slug: z
      .string()
      .regex(/^[a-z0-9-]+$/)
      .max(160),
    excerpt: z.string().max(300),
    body: z.string().min(20).max(20000),
    category: z.string().max(60),
    published: z.boolean(),
  })
  .strict();
export const sponsorSchema = z
  .object({
    edition_id: uuid,
    name: z.string().min(2).max(120),
    tier: z.enum(['diamond', 'gold', 'silver', 'partner']),
    url: z.string().url().startsWith('https://'),
    logo_url: z
      .string()
      .regex(
        /^\/images\/sponsors\/[a-zA-Z0-9_-]+\.(?:webp|png|jpe?g|avif)$/,
        'Dùng đường dẫn /images/sponsors/ten-logo.webp',
      )
      .or(z.literal(''))
      .nullable()
      .optional(),
    published: z.boolean(),
  })
  .strict();
export const checkinSchema = z.object({ token: z.string().min(32).max(256) }).strict();
export type ApplicationInput = z.infer<typeof applicationSchema>;
export type Edition = {
  id: string;
  title: string;
  slug: string;
  theme: string;
  year: number;
  registration_open_at: string | null;
  registration_close_at: string | null;
  published: boolean;
};
export type Contestant = {
  id: string;
  edition_id: string;
  slug: string;
  display_name: string;
  number: number | null;
  faculty: string;
  bio: string;
  talents: string;
  stage: string;
  photo_url: string | null;
  published: boolean;
};
export type TimelineEvent = {
  id: string;
  edition_id: string;
  title: string;
  description: string;
  position: number;
  starts_at: string | null;
  ends_at: string | null;
  published: boolean;
};
export type Round = {
  id: string;
  edition_id: string;
  title: string;
  kind: string;
  position: number;
  cutoff: number;
  published: boolean;
  vote_open_at: string | null;
  vote_close_at: string | null;
};
export type News = {
  id: string;
  edition_id: string;
  title: string;
  slug: string;
  excerpt: string;
  body: string;
  category: string;
  published: boolean;
};
export type Sponsor = {
  id: string;
  name: string;
  tier: string;
  url: string;
  logo_url?: string | null;
  published: boolean;
};
export type Ticket = {
  id: string;
  edition_id: string;
  round_id: string;
  seat_label: string;
  checked_in_at: string | null;
  status: string;
};
export type Application = {
  id: string;
  code: string;
  status: string;
  note: string | null;
  created_at: string;
  full_name: string;
  email: string;
  phone: string;
  faculty: string;
  bio: string;
};
export const DEMO_EDITION = '11111111-1111-4111-8111-111111111111';
export const steps = [
  'Kick-off',
  'Mở đơn đăng ký',
  'Sơ khảo',
  'Training đầu tiên',
  'Bộ ảnh truyền thông',
  'Mở bán vé bán kết',
  'Bán kết',
  'Training chung kết',
  'Bộ ảnh chung kết',
  'Mở bán vé chung kết',
  'Đêm chung kết',
];
export const demoEdition: Edition = {
  id: DEMO_EDITION,
  title: 'FTUCharm',
  slug: 'preview',
  theme: 'Vẻ đẹp khởi nguồn từ chính bạn',
  year: 2026,
  registration_open_at: null,
  registration_close_at: null,
  published: true,
};
export const demoTimeline: TimelineEvent[] = steps.map((title, i) => ({
  id: `timeline-${i}`,
  edition_id: DEMO_EDITION,
  title,
  description: [
    'Khởi đầu một hành trình mới.',
    'Tự tin kể câu chuyện của chính mình.',
    'Vẻ đẹp, tri thức và bản lĩnh.',
    'Học hỏi, kết nối và trưởng thành.',
    'Tỏa sáng qua những góc nhìn mới.',
    'Hẹn gặp bạn tại sân khấu bán kết.',
    'Một bước gần hơn với giấc mơ.',
    'Chuẩn bị cho khoảnh khắc tỏa sáng.',
    'Lưu giữ dấu ấn của hành trình.',
    'Sẵn sàng cho đêm hội cuối cùng.',
    'Nơi những vẻ đẹp cùng thăng hoa.',
  ][i],
  position: i,
  starts_at: null,
  ends_at: null,
  published: true,
}));
export const demoContestants: Contestant[] = Array.from({ length: 6 }, (_, i) => ({
  id: `22222222-2222-4222-8222-${String(i + 1).padStart(12, '0')}`,
  edition_id: DEMO_EDITION,
  slug: `thi-sinh-minh-hoa-${i + 1}`,
  display_name: `Thí sinh ${String(i + 1).padStart(2, '0')}`,
  number: i + 1,
  faculty: 'Ngoại thương',
  bio: 'Mỗi cô gái mang một câu chuyện riêng. Đây là hồ sơ minh họa giao diện, không phải thí sinh đã đăng ký.',
  talents: 'Hồ sơ minh họa',
  stage: 'Hành trình bắt đầu',
  photo_url: null,
  published: true,
}));
export const demoNews: News[] = [
  {
    id: 'news-1',
    edition_id: DEMO_EDITION,
    title: 'Một hành trình. Nhiều phiên bản rực rỡ.',
    slug: 'hanh-trinh-toa-sang',
    excerpt: 'Khám phá các chặng đường từ kick-off đến đêm chung kết.',
    body: 'Hành trình gồm kick-off, mở đơn, sơ khảo, training, bộ ảnh truyền thông, bán kết và chung kết. Lịch chính thức sẽ được ban tổ chức công bố. Nội dung này minh họa bố cục website.',
    category: 'Hành trình',
    published: true,
  },
  {
    id: 'news-2',
    edition_id: DEMO_EDITION,
    title: 'Sẵn sàng kể câu chuyện của bạn?',
    slug: 'cam-nang-dang-ky',
    excerpt: 'Chuẩn bị hồ sơ để bước vào hành trình của chính mình.',
    body: 'Chuẩn bị phần giới thiệu bản thân, năng khiếu và ba ảnh hồ sơ: chân dung, bán thân, toàn thân. Chỉ nộp hồ sơ khi đã đọc thể lệ và thông báo xử lý dữ liệu do ban tổ chức công bố.',
    category: 'Cẩm nang',
    published: true,
  },
];
export function votingState(round: Round, now = Date.now()): 'scheduled' | 'open' | 'closed' {
  if (!round.vote_open_at || !round.vote_close_at) return 'scheduled';
  if (now < Date.parse(round.vote_open_at)) return 'scheduled';
  return now < Date.parse(round.vote_close_at) ? 'open' : 'closed';
}
