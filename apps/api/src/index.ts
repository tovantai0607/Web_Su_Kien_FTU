import { Hono, type Context } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import {
  applicationSchema,
  contestantAdminSchema,
  voteSchema,
  reviewSchema,
  editionSchema,
  roundSchema,
  timelineSchema,
  sponsorSchema,
  profileUpdateSchema,
  checkinSchema,
  uuid,
  roles,
  demoEdition,
  demoTimeline,
  demoContestants,
  demoFinalRound,
  demoVoting,
  demoSalesCatalog,
  salesHoldSchema,
  votingSettingsSchema,
  saleSettingsSchema,
} from '@ftu/shared';
import {
  authenticate,
  authorize,
  service,
  readClient,
  verifyTurnstile,
  digest,
  imageSignature,
  stripWebPMetadata,
  type Env,
  type Principal,
} from './security';
import { sendOutbox } from './outbox';
import { purchases } from './purchases';
import { program, officialEdition, publishedRoundPhotos } from './program';
import { demoOffer, enforceDemoWrite, requireDemoAdmin, visiblePurchaseRows } from './demo-scope';
type AppEnv = { Bindings: Env; Variables: { principal: Principal } };
export const app = new Hono<AppEnv>();
const publicFields =
  'id,edition_id,slug,display_name,number,cohort,class_name,height_cm,gender,faculty,bio,talents,stage,photo_url,published';
app.use(
  '*',
  secureHeaders({
    referrerPolicy: 'strict-origin-when-cross-origin',
    xFrameOptions: 'DENY',
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://challenges.cloudflare.com'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'blob:', 'data:'],
      fontSrc: ["'self'"],
      connectSrc: [
        "'self'",
        'https://ifgtyslifgegwcguysbb.supabase.co',
        'https://challenges.cloudflare.com',
      ],
      frameSrc: ['https://challenges.cloudflare.com'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
    },
  }),
);
app.use('/api/*', (c, next) =>
  bodyLimit({
    maxSize:
      c.req.path === '/api/media/upload' ||
      c.req.path === '/api/admin/public-images' ||
      /^\/api\/(?:purchases|admin\/sheets\/purchases)\/[a-f0-9-]+\/evidence$/.test(c.req.path)
        ? 5 * 1024 * 1024
        : 64 * 1024,
    onError: (c) => c.json({ error: 'Tệp hoặc yêu cầu quá lớn.' }, 413),
  })(c, next),
);
app.use('/api/*', async (c, next) => {
  c.header('Cache-Control', 'no-store');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    if (c.req.header('Origin') !== c.env.ALLOWED_ORIGIN)
      return c.json({ error: 'Nguồn yêu cầu không hợp lệ.' }, 403);
    if (c.env.DEMO_MODE === 'true')
      return c.json(
        { error: 'Bản xem trước không ghi dữ liệu. Cần hoàn tất cấu hình để sử dụng.' },
        503,
      );
  }
  await next();
});
app.onError((error, c) => {
  if (error instanceof HTTPException) return c.json({ error: error.message }, error.status);
  return c.json({ error: 'Dịch vụ tạm thời không khả dụng. Vui lòng thử lại.' }, 503);
});
app.get('/api/health', (c) =>
  c.json({
    status: 'ok',
    mode:
      c.env.DEMO_MODE === 'true' ? 'preview' : c.env.DEMO_TEST_OFFER_SLUG ? 'demo-test' : 'live',
    server_time: new Date().toISOString(),
  }),
);
const demo = (c: Context<AppEnv>) => c.env.DEMO_MODE === 'true';
function ok<T>(c: Context<AppEnv>, data: T) {
  return c.json({ data });
}
function dbError(error: { message: string; code?: string } | null) {
  if (!error) return;
  const codes: Record<string, [number, string]> = {
    REGISTRATION_CLOSED: [409, 'Đăng ký chưa mở hoặc đã kết thúc.'],
    IDEMPOTENCY_CONFLICT: [409, 'Yêu cầu trùng có nội dung khác.'],
    INVALID_MEDIA: [400, 'Ảnh hồ sơ không hợp lệ.'],
    INVALID_STUDENT_CARD: [400, 'Cần ảnh thẻ sinh viên FTU hợp lệ, thuộc hồ sơ của bạn.'],
    VOTE_CLOSED: [409, 'Bình chọn chưa mở hoặc đã kết thúc.'],
    VOTING_CATEGORY_REQUIRED: [
      400,
      'Vui lòng chọn hạng mục nam hoặc nữ và tải lại lượt bình chọn.',
    ],
    CONTESTANT_CATEGORY_MISMATCH: [400, 'Thí sinh không thuộc hạng mục đã chọn.'],
    VOTING_NOT_CONFIGURED: [
      409,
      'Cần công bố ít nhất một thí sinh hợp lệ cho mỗi hạng mục nam và nữ.',
    ],
    LEGACY_VOTE_RECONCILIATION_REQUIRED: [
      409,
      'Vé có phiếu cũ cần BTC đối soát trước khi tiếp tục.',
    ],
    LEGACY_TICKET_MAPPING_REQUIRED: [
      409,
      'Vé cần được BTC liên kết với sự kiện trước khi bình chọn.',
    ],
    TICKET_NOT_ELIGIBLE: [403, 'Vé không hợp lệ hoặc không thuộc tài khoản của bạn.'],
    CONTESTANT_NOT_ELIGIBLE: [409, 'Thí sinh không thuộc lượt bình chọn này.'],
    ALREADY_VOTED: [409, 'Vé này đã bình chọn.'],
    ALREADY_CHECKED_IN: [409, 'Vé đã được check-in trước đó.'],
    TICKET_NOT_FOUND: [404, 'Không tìm thấy vé hợp lệ.'],
    FORBIDDEN: [403, 'Không có quyền thực hiện.'],
    VOTING_HAS_STARTED: [409, 'Lượt bình chọn đã được mở; không thể mở lại hoặc thay đổi.'],
    INVALID_CUTOFF: [400, 'Danh sách vượt số lượng qua vòng hoặc có thí sinh trùng.'],
    LAST_ADMIN: [409, 'Không thể thu hồi quản trị viên cuối cùng.'],
    NOT_FOUND: [404, 'Không tìm thấy dữ liệu.'],
    EVENT_NOT_FOUND: [404, 'Không tìm thấy sự kiện đã công bố.'],
    HOLD_NOT_FOUND: [404, 'Không tìm thấy lượt giữ ghế của bạn.'],
    SALE_CLOSED: [409, 'Sự kiện chưa mở bán hoặc đã đóng bán.'],
    SEAT_UNAVAILABLE: [409, 'Ghế vừa được giữ hoặc không còn bán. Chọn ghế khác.'],
    INVALID_SEAT_SELECTION: [400, 'Chọn từ 1 đến 10 ghế khác nhau.'],
    INVALID_IDEMPOTENCY_KEY: [400, 'Thiếu mã chống gửi trùng.'],
    PRICE_CHANGED: [409, 'Giá hoặc đợt bán vừa thay đổi. Hãy tải lại giá rồi xác nhận giữ ghế.'],
    SETTINGS_CHANGED: [409, 'Cấu hình vừa được thay đổi. Tải lại trước khi lưu.'],
    SALE_PHASE_OVERLAP: [400, 'Đợt bán sớm và bán thường không được chồng thời gian.'],
    SALE_PHASE_NOT_CONFIGURED: [400, 'Cần cấu hình đủ hai hạng vé và đợt bán thường.'],
    INVALID_VOTE_WINDOW: [400, 'Thời gian bình chọn không hợp lệ.'],
    VOTE_ALREADY_CLOSED: [409, 'Phiên bình chọn đã kết thúc; không thể mở lại.'],
    VOTE_REASON_REQUIRED: [400, 'Giữ nguyên giờ mở và nhập lý do thay đổi giờ đóng.'],
    VOTE_SETTINGS_REQUIRED: [409, 'Chỉnh lịch bình chọn tại trang cấu hình quản trị.'],
  };
  const matched = Object.entries(codes).find(([key]) => error.message.includes(key));
  if (matched) throw new HTTPException(matched[1][0] as 400, { message: matched[1][1] });
  if (error.code === '23505')
    throw new HTTPException(409, { message: 'Hồ sơ hoặc dữ liệu này đã tồn tại.' });
  throw new HTTPException(503, { message: 'Không thể xử lý dữ liệu. Vui lòng thử lại.' });
}
async function parse<T>(c: Context<AppEnv>, schema: z.ZodType<T>): Promise<T> {
  const type = c.req.header('Content-Type') ?? '';
  if (!type.startsWith('application/json'))
    throw new HTTPException(415, { message: 'Yêu cầu phải là JSON.' });
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: 'Nội dung yêu cầu không hợp lệ.' });
  }
  const r = schema.safeParse(body);
  if (!r.success)
    throw new HTTPException(400, {
      message: r.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ.',
    });
  return r.data;
}
const queryEdition = (c: Context<AppEnv>) => {
  const v = c.req.query('edition');
  if (v && !uuid.safeParse(v).success)
    throw new HTTPException(400, { message: 'Mùa thi không hợp lệ.' });
  return v;
};
async function publicEdition(c: Context<AppEnv>, requestedRound?: string) {
  const requested = queryEdition(c);
  if (
    c.env.DEMO_TEST_OFFER_SLUG &&
    (requestedRound || (c.req.path === '/api/rounds' && c.req.query('demo') === '1'))
  ) {
    const offer = await demoOffer(c.env);
    if (requestedRound === offer.round_id || c.req.query('demo') === '1') {
      c.set('principal', await requireDemoAdmin(c.req.raw, c.env, c.get('principal')));
      return !requested || requested === offer.edition_id ? (offer.edition_id as string) : null;
    }
  }
  if (c.env.PUBLIC_EDITION_SLUG || c.env.DEMO_TEST_OFFER_SLUG) {
    const edition = await officialEdition(c.env);
    return edition && (!requested || requested === edition.id) ? (edition.id as string) : null;
  }
  let query = readClient(c.env).from('contest_editions').select('id').eq('published', true);
  if (requested) query = query.eq('id', requested);
  const { data, error } = await query
    .order('year', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  dbError(error);
  return data?.id as string | null;
}
const rowId = (c: Context<AppEnv>) => {
  const v = c.req.param('id');
  if (!uuid.safeParse(v).success) throw new HTTPException(400, { message: 'Mã không hợp lệ.' });
  return v;
};
app.get('/api/editions', async (c) => {
  if (demo(c)) return ok(c, [demoEdition]);
  if (c.env.PUBLIC_EDITION_SLUG) {
    const edition = await officialEdition(c.env);
    return ok(c, edition ? [edition] : []);
  }
  const { data, error } = await readClient(c.env)
    .from('contest_editions')
    .select('*')
    .eq('published', true)
    .order('year', { ascending: false });
  dbError(error);
  return ok(c, data);
});
app.get('/api/editions/current', async (c) => {
  if (demo(c)) return ok(c, demoEdition);
  if (c.env.PUBLIC_EDITION_SLUG) return ok(c, await officialEdition(c.env));
  const { data, error } = await readClient(c.env)
    .from('contest_editions')
    .select('*')
    .eq('published', true)
    .order('year', { ascending: false })
    .limit(1)
    .maybeSingle();
  dbError(error);
  return ok(c, data);
});
for (const [path, table, fixture] of [
  ['timeline', 'timeline_events', demoTimeline],
  ['sponsors', 'sponsors', []],
  ['rounds', 'contest_rounds', [demoFinalRound]],
] as const) {
  app.get('/api/' + path, async (c) => {
    if (demo(c)) return ok(c, fixture);
    let q = readClient(c.env).from(table).select('*').eq('published', true).limit(200);
    const edition = await publicEdition(c);
    if (!edition) return ok(c, []);
    q = q.eq('edition_id', edition);
    const { data, error } = await q;
    dbError(error);
    return ok(c, data);
  });
}
app.get('/api/contestants', async (c) => {
  if (demo(c)) return ok(c, demoContestants);
  let q = readClient(c.env)
    .from('contestants')
    .select(publicFields)
    .eq('published', true)
    .order('number')
    .limit(1000);
  const edition = await publicEdition(c);
  if (!edition) return ok(c, []);
  q = q.eq('edition_id', edition);
  const { data, error } = await q;
  dbError(error);
  if (c.env.PUBLIC_EDITION_SLUG) {
    const photos = await publishedRoundPhotos(c.env, edition);
    return ok(
      c,
      data?.map((person) => ({
        ...person,
        photo_url: photos.get(person.id) ?? person.photo_url,
      })) ?? [],
    );
  }
  return ok(c, data);
});
app.get('/api/contestants/:slug', async (c) => {
  if (demo(c)) return ok(c, demoContestants.find((s) => s.slug === c.req.param('slug')) ?? null);
  const edition = await publicEdition(c);
  if (!edition) return ok(c, null);
  const { data, error } = await readClient(c.env)
    .from('contestants')
    .select(publicFields)
    .eq('published', true)
    .eq('slug', c.req.param('slug'))
    .eq('edition_id', edition)
    .limit(1)
    .maybeSingle();
  dbError(error);
  if (data && c.env.PUBLIC_EDITION_SLUG && edition) {
    const photos = await publishedRoundPhotos(c.env, edition);
    data.photo_url = photos.get(data.id) ?? data.photo_url;
  }
  return ok(c, data);
});
app.get('/api/voting/:id', async (c) => {
  const id = rowId(c);
  if (demo(c)) return ok(c, demoVoting());
  const db = readClient(c.env);
  const { data: round, error } = await db
    .from('contest_rounds')
    .select('*')
    .eq('id', id)
    .eq('published', true)
    .in('kind', ['semifinal', 'final'])
    .maybeSingle();
  dbError(error);
  if (!round) return c.json({ error: 'Chưa có lượt bình chọn công khai.' }, 404);
  if (
    (c.env.PUBLIC_EDITION_SLUG || c.env.DEMO_TEST_OFFER_SLUG) &&
    round.edition_id !== (await publicEdition(c, id))
  )
    return c.json({ error: 'Chưa có lượt bình chọn công khai.' }, 404);
  const { data: entries, error: err } = await db
    .from('round_entries')
    .select('contestant_id')
    .eq('round_id', id)
    .eq('eligible', true);
  dbError(err);
  const { data: contestants, error: cerr } = await db
    .from('contestants')
    .select(publicFields)
    .in('id', entries?.map((e) => e.contestant_id) ?? [])
    .eq('published', true);
  dbError(cerr);
  if (c.env.PUBLIC_EDITION_SLUG) {
    const photos = await publishedRoundPhotos(c.env, round.edition_id, id);
    contestants?.forEach((person) => {
      person.photo_url = photos.get(person.id) ?? person.photo_url;
    });
  }
  const [categories, sessions, participation] = await Promise.all([
    db
      .from('vote_categories')
      .select('id,round_id,code,name,gender')
      .eq('round_id', id)
      .order('code'),
    db
      .from('vote_sessions')
      .select('id,round_id,state,open_at,close_at')
      .eq('round_id', id)
      .eq('published', true)
      .order('open_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    // This aggregate RPC is intentionally server-only; the public read client cannot execute it.
    service(c.env).rpc('read_vote_participation', { p_round: id }),
  ]);
  dbError(categories.error);
  dbError(sessions.error);
  // Preserve the existing rollout until the additive migration is applied.
  if (participation.error && participation.error.code !== 'PGRST202') dbError(participation.error);
  const eligible = sessions.data
    ? await db
        .from('vote_eligible_contestants')
        .select('category_id,contestant_id')
        .eq('session_id', sessions.data.id)
    : { data: [], error: null };
  dbError(eligible.error);
  let demoLeaderboard = null;
  if (c.env.DEMO_TEST_OFFER_SLUG && id === (await demoOffer(c.env)).round_id) {
    const leaderboard = await service(c.env).rpc('read_demo_vote_leaderboard', { p_round: id });
    // A pending migration is unavailable data, never a made-up zero count.
    if (leaderboard.error && leaderboard.error.code !== 'PGRST202') dbError(leaderboard.error);
    demoLeaderboard = leaderboard.data;
  }
  return ok(c, {
    round,
    contestants,
    categories: categories.data,
    session: sessions.data,
    participation: participation.data ?? null,
    demo_leaderboard: demoLeaderboard,
    eligible: eligible.data,
    server_time: new Date().toISOString(),
  });
});
// Authenticate all private endpoints. Roles come from DB, never user_metadata or the request body.
for (const path of [
  '/api/me/*',
  '/api/admin/*',
  '/api/votes',
  '/api/media/*',
  '/api/contestants/apply',
  '/api/events/:id/holds',
  '/api/purchases',
  '/api/purchases/*',
  '/api/purchase-evidence/*',
]) {
  app.use(path, async (c, next) => {
    c.set('principal', await authenticate(c.req.raw, c.env));
    await next();
  });
}
app.use('/api/*', async (c, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    await next();
    return;
  }
  if (!c.env.RATE_LIMITER)
    throw new HTTPException(503, { message: 'Giới hạn chống spam chưa được cấu hình.' });
  const principal = c.get('principal');
  const key = await digest(
    `${c.req.path}:${principal?.id ?? c.req.header('CF-Connecting-IP') ?? 'unknown'}`,
  );
  const { success } = await c.env.RATE_LIMITER.limit({ key });
  if (!success) return c.json({ error: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau.' }, 429);
  await enforceDemoWrite(c.req.raw, c.env, c.get('principal'));
  await next();
});
app.get('/api/events', async (c) => {
  const edition = c.env.PUBLIC_EDITION_SLUG ? await publicEdition(c) : queryEdition(c);
  if (demo(c)) return ok(c, demoSalesCatalog());
  if (c.env.PUBLIC_EDITION_SLUG && !edition)
    return ok(c, { server_time: new Date().toISOString(), events: [] });
  const { data, error } = await service(c.env).rpc('sales_catalog', { p_edition: edition ?? null });
  dbError(error);
  return ok(c, data);
});
app.get('/api/events/:identifier', async (c) => {
  const identifier = c.req.param('identifier');
  if (!uuid.safeParse(identifier).success && !/^[a-z0-9-]{1,100}$/.test(identifier))
    throw new HTTPException(400, { message: 'Mã sự kiện không hợp lệ.' });
  const edition = c.env.PUBLIC_EDITION_SLUG ? await publicEdition(c) : queryEdition(c);
  if (demo(c)) {
    const data = demoSalesCatalog(identifier);
    if (!data.events.length) throw new HTTPException(404, { message: 'Không tìm thấy sự kiện.' });
    return ok(c, data);
  }
  const { data, error } = await service(c.env).rpc('sales_catalog', {
    p_edition: edition ?? null,
    p_event: uuid.safeParse(identifier).success ? identifier : null,
    p_slug: uuid.safeParse(identifier).success ? null : identifier,
  });
  dbError(error);
  if (!data?.events?.length) throw new HTTPException(404, { message: 'Không tìm thấy sự kiện.' });
  return ok(c, data);
});
app.post('/api/events/:id/holds', async (c) => {
  const event = rowId(c);
  const input = await parse(c, salesHoldSchema);
  const key = c.req.header('Idempotency-Key');
  if (!uuid.safeParse(key).success)
    throw new HTTPException(400, { message: 'Thiếu mã chống gửi trùng.' });
  const selected = [...input.seat_ids].sort();
  const { data, error } = await service(c.env).rpc('reserve_sales_seats', {
    p_user: c.get('principal').id,
    p_event: event,
    p_seats: selected,
    p_key: key,
    p_hash: await digest(JSON.stringify({ event_id: event, seat_ids: selected })),
    ...(input.pricing_version !== undefined ? { p_quote: input.pricing_version } : {}),
  });
  dbError(error);
  return ok(c, data);
});
app.get('/api/me/holds/:id', async (c) => {
  const { data, error } = await service(c.env).rpc('read_sales_hold', {
    p_user: c.get('principal').id,
    p_order: rowId(c),
  });
  dbError(error);
  return ok(c, data);
});
app.post('/api/me/holds/:id/release', async (c) => {
  await parse(c, z.object({}).strict());
  const { data, error } = await service(c.env).rpc('release_sales_hold', {
    p_user: c.get('principal').id,
    p_order: rowId(c),
  });
  dbError(error);
  return ok(c, data);
});
app.post('/api/contestants/apply', async (c) => {
  const input = await parse(c, applicationSchema);
  if (c.env.PUBLIC_EDITION_SLUG && input.edition_id !== (await publicEdition(c)))
    throw new HTTPException(409, { message: 'Mùa thi chưa nhận đăng ký.' });
  const p = c.get('principal');
  if (input.email.toLowerCase() !== p.email.toLowerCase())
    throw new HTTPException(400, { message: 'Email hồ sơ phải là email tài khoản đã xác minh.' });
  const key = c.req.header('Idempotency-Key');
  if (!uuid.safeParse(key).success)
    throw new HTTPException(400, { message: 'Thiếu mã chống gửi trùng.' });
  await verifyTurnstile(input.turnstile_token, c.env, 'apply', c.req.header('CF-Connecting-IP'));
  const { turnstile_token: _, ...data } = input;
  const { data: result, error } = await service(c.env).rpc('apply_contestant', {
    p_user: p.id,
    p_data: data,
    p_key: key,
    p_hash: await digest(JSON.stringify(data)),
  });
  dbError(error);
  return ok(c, result);
});
app.post('/api/votes', async (c) => {
  const input = await parse(c, voteSchema);
  if (c.env.PUBLIC_EDITION_SLUG) {
    const edition = await publicEdition(c, input.round_id);
    const round = await readClient(c.env)
      .from('contest_rounds')
      .select('id')
      .eq('id', input.round_id)
      .eq('edition_id', edition)
      .eq('published', true)
      .maybeSingle();
    dbError(round.error);
    if (!round.data) throw new HTTPException(409, { message: 'Vòng thi chưa mở bình chọn.' });
  }
  if (!!input.category_id !== !!input.session_id)
    throw new HTTPException(400, { message: 'Thiếu hạng mục hoặc lượt bình chọn.' });
  await verifyTurnstile(input.turnstile_token, c.env, 'vote', c.req.header('CF-Connecting-IP'));
  const { data, error } = await service(c.env).rpc(
    input.category_id ? 'cast_category_vote' : 'cast_vote',
    {
      p_user: c.get('principal').id,
      p_round: input.round_id,
      p_ticket: input.ticket_id,
      p_contestant: input.contestant_id,
      ...(input.category_id ? { p_category: input.category_id, p_session: input.session_id } : {}),
    },
  );
  dbError(error);
  return ok(c, data);
});
app.get('/api/me/application', async (c) => {
  const db = service(c.env);
  const { data, error } = await db
    .from('contestant_private')
    .select(
      'id,code,status,note,created_at,full_name,email,phone,contestants!contestant_private_id_fkey(faculty,bio,talents,cohort,class_name,height_cm,gender)',
    )
    .eq('user_id', c.get('principal').id)
    .order('created_at', { ascending: false });
  dbError(error);
  return ok(c, data);
});
app.patch('/api/me/application/:id', async (c) => {
  const input = await parse(c, profileUpdateSchema);
  const { data, error } = await service(c.env).rpc('update_application', {
    p_user: c.get('principal').id,
    p_id: rowId(c),
    p_data: input,
  });
  dbError(error);
  return ok(c, data);
});
app.get('/api/me/tickets', async (c) => {
  const { data, error } = await service(c.env)
    .from('tickets')
    .select('id,edition_id,round_id,seat_label,checked_in_at,status,ticket_code')
    .eq('user_id', c.get('principal').id);
  dbError(error);
  const visible = await visiblePurchaseRows(data ?? [], c.req.raw, c.env, c.get('principal'));
  if (visible.length) {
    const codes = await service(c.env).rpc('read_own_ticket_codes', {
      p_user: c.get('principal').id,
    });
    if (codes.error && codes.error.code !== 'PGRST202') dbError(codes.error);
    const byId = new Map<string, { display_code: string; group_code: string }>(
      (codes.data ?? []).map(
        (row: { ticket_id: string; display_code: string; group_code: string }) => [
          row.ticket_id,
          { display_code: row.display_code, group_code: row.group_code },
        ],
      ),
    );
    return ok(
      c,
      visible.map((ticket) => ({ ...ticket, ...byId.get(ticket.id) })),
    );
  }
  return ok(c, visible);
});
app.get('/api/me/votes', async (c) => {
  const { data, error } = await service(c.env)
    .from('votes')
    .select('id,round_id,ticket_id,contestant_id,category_id,session_id')
    .eq('user_id', c.get('principal').id);
  dbError(error);
  return ok(c, await visiblePurchaseRows(data ?? [], c.req.raw, c.env, c.get('principal')));
});
app.get('/api/me/notifications', async (c) => {
  const { data, error } = await service(c.env)
    .from('notifications')
    .select('id,title,body,created_at')
    .eq('user_id', c.get('principal').id)
    .order('created_at', { ascending: false })
    .limit(50);
  dbError(error);
  return ok(c, data);
});
app.post('/api/media/upload', async (c) => {
  const purpose = z
    .enum(['portfolio', 'student_card'])
    .safeParse(c.req.query('purpose') ?? 'portfolio');
  if (!purpose.success) throw new HTTPException(400, { message: 'Loại ảnh không hợp lệ.' });
  if (!c.env.IMAGES || !c.env.MEDIA)
    throw new HTTPException(503, { message: 'Lưu trữ ảnh chưa được cấu hình.' });
  const edition = c.req.query('edition');
  if (!uuid.safeParse(edition).success)
    throw new HTTPException(400, { message: 'Mùa thi không hợp lệ.' });
  if (c.env.PUBLIC_EDITION_SLUG && edition !== (await publicEdition(c)))
    throw new HTTPException(409, { message: 'Mùa thi chưa nhận ảnh hồ sơ.' });
  const db = service(c.env);
  const { data: season, error: seasonError } = await db
    .from('contest_editions')
    .select('published,registration_open_at,registration_close_at')
    .eq('id', edition)
    .maybeSingle();
  dbError(seasonError);
  const now = Date.now();
  if (
    !season?.published ||
    !season.registration_open_at ||
    !season.registration_close_at ||
    now < Date.parse(season.registration_open_at) ||
    now >= Date.parse(season.registration_close_at)
  )
    throw new HTTPException(409, { message: 'Chưa mở nhận ảnh hồ sơ.' });
  const { count, error: quotaError } = await db
    .from('media_assets')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', c.get('principal').id)
    .eq('edition_id', edition);
  dbError(quotaError);
  if ((count ?? 0) >= 12)
    throw new HTTPException(429, {
      message: 'Bạn đã đạt giới hạn ảnh hồ sơ. Liên hệ BTC để được hỗ trợ.',
    });
  const raw = await c.req.arrayBuffer();
  if (!raw.byteLength || raw.byteLength > 5 * 1024 * 1024 || !imageSignature(new Uint8Array(raw)))
    throw new HTTPException(400, { message: 'Chỉ nhận ảnh JPEG/PNG hợp lệ, tối đa 5 MB.' });
  const info = await c.env.IMAGES.info(new Blob([raw]).stream());
  if (!('width' in info) || info.width * info.height > 12000000)
    throw new HTTPException(400, { message: 'Ảnh vượt quá 12 megapixel.' });
  const clean = (
    await c.env.IMAGES.input(new Blob([raw]).stream())
      .transform({ width: 1600, fit: 'scale-down' })
      .output({ format: 'image/webp', quality: 85, anim: false })
  ).response();
  const bytes = stripWebPMetadata(await clean.arrayBuffer());
  const id = crypto.randomUUID();
  const key = `private/${edition}/${c.get('principal').id}/${id}.webp`;
  await c.env.MEDIA.put(key, bytes, { httpMetadata: { contentType: 'image/webp' } });
  const { error } = await service(c.env)
    .from('media_assets')
    .insert({
      id,
      edition_id: edition,
      user_id: c.get('principal').id,
      object_key: key,
      mime: 'image/webp',
      bytes: bytes.byteLength,
      purpose: purpose.data,
    });
  if (error) {
    await c.env.MEDIA.delete(key);
    dbError(error);
  }
  return ok(c, { id });
});
app.get('/api/media/:id', async (c) => {
  const db = service(c.env);
  const { data, error } = await db
    .from('media_assets')
    .select('user_id,object_key')
    .eq('id', rowId(c))
    .maybeSingle();
  dbError(error);
  if (!data || !c.env.MEDIA) return c.json({ error: 'Không tìm thấy ảnh.' }, 404);
  if (data.user_id !== c.get('principal').id)
    await authorize(c.get('principal'), c.env, ['CONTEST_REVIEWER']);
  const object = await c.env.MEDIA.get(data.object_key);
  if (!object) return c.json({ error: 'Không tìm thấy ảnh.' }, 404);
  return new Response(object.body, {
    headers: {
      'Content-Type': 'image/webp',
      'Content-Disposition': 'inline',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});
app.use('/api/admin/*', async (c, next) => {
  await authorize(c.get('principal'), c.env, [
    'CONTENT_EDITOR',
    'CONTEST_REVIEWER',
    'VOTE_MANAGER',
    'CHECKIN_STAFF',
    'TICKET_STAFF',
  ]);
  await next();
});
app.route('/api', program);
app.get('/api/admin/overview', async (c) => {
  const db = service(c.env);
  await authorize(c.get('principal'), c.env, [
    'CONTENT_EDITOR',
    'CONTEST_REVIEWER',
    'VOTE_MANAGER',
  ]);
  const [a, v, t] = await Promise.all([
    db.from('contestant_private').select('id', { count: 'exact', head: true }),
    db.from('votes').select('id', { count: 'exact', head: true }),
    db
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .not('checked_in_at', 'is', null),
  ]);
  for (const r of [a, v, t]) dbError(r.error);
  return ok(c, { applications: a.count, votes: v.count, checked_in: t.count });
});
app.get('/api/admin/applications', async (c) => {
  await authorize(c.get('principal'), c.env, ['CONTEST_REVIEWER']);
  const page = Math.max(0, Math.min(100, Number(c.req.query('page')) || 0));
  let q = service(c.env)
    .from('contestant_private')
    .select(
      '*,contestants!contestant_private_id_fkey(faculty,bio,talents,cohort,class_name,height_cm,gender,number,contestant_media(media_id,kind))',
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .range(page * 25, page * 25 + 24);
  const status = c.req.query('status');
  if (status && ['pending', 'approved', 'needs_changes', 'rejected'].includes(status))
    q = q.eq('status', status);
  const { data, error, count } = await q;
  dbError(error);
  return ok(c, { items: data, total: count });
});
app.get('/api/admin/contestant-profiles', async (c) => {
  await authorize(c.get('principal'), c.env, ['CONTEST_REVIEWER']);
  const { data, error } = await service(c.env)
    .from('contestants')
    .select(publicFields)
    .order('created_at', { ascending: false })
    .limit(1000);
  dbError(error);
  return ok(c, data);
});
app.patch('/api/admin/contestant-profiles/:id', async (c) => {
  const input = await parse(c, contestantAdminSchema);
  const p = c.get('principal');
  const { data, error } = await service(c.env).rpc('update_contestant_details', {
    p_actor: p.id,
    p_aal: p.aal,
    p_id: rowId(c),
    p_data: input,
  });
  dbError(error);
  return ok(c, data);
});
app.post('/api/admin/rounds/:id/prepare-categories', async (c) => {
  const p = c.get('principal');
  const { data, error } = await service(c.env).rpc('prepare_gender_voting', {
    p_actor: p.id,
    p_aal: p.aal,
    p_round: rowId(c),
  });
  dbError(error);
  return ok(c, data);
});
app.patch('/api/admin/applications/:id/review', async (c) => {
  const input = await parse(c, reviewSchema);
  const { data, error } = await service(c.env).rpc('review_application', {
    p_actor: c.get('principal').id,
    p_aal: c.get('principal').aal,
    p_id: rowId(c),
    p_status: input.status,
    p_note: input.note,
  });
  dbError(error);
  return ok(c, data);
});
const resources = [
  ['editions', 'contest_editions', editionSchema, 'CONTENT_EDITOR'],
  ['rounds', 'contest_rounds', roundSchema, 'VOTE_MANAGER'],
  ['timeline', 'timeline_events', timelineSchema, 'CONTENT_EDITOR'],
  ['sponsors', 'sponsors', sponsorSchema, 'CONTENT_EDITOR'],
] as const;
for (const [name, table, schema, role] of resources) {
  app.get('/api/admin/' + name, async (c) => {
    await authorize(c.get('principal'), c.env, [role]);
    const { data, error } = await service(c.env).from(table).select('*').limit(200);
    dbError(error);
    return ok(c, data);
  });
  for (const method of ['post', 'patch'] as const) {
    app[method]('/api/admin/' + name + (method === 'patch' ? '/:id' : ''), async (c) => {
      await authorize(c.get('principal'), c.env, [role]);
      const input = await parse(c, schema as z.ZodType);
      const { data, error } = await service(c.env).rpc('admin_save', {
        p_actor: c.get('principal').id,
        p_aal: c.get('principal').aal,
        p_table: table,
        p_id: method === 'patch' ? rowId(c) : crypto.randomUUID(),
        p_data: input,
      });
      dbError(error);
      return ok(c, data);
    });
  }
}
app.post('/api/admin/rounds/:id/publish', async (c) => {
  await authorize(c.get('principal'), c.env, ['VOTE_MANAGER']);
  const input = await parse(
    c,
    z.object({ contestant_ids: z.array(uuid).min(1).max(1000) }).strict(),
  );
  const { data, error } = await service(c.env).rpc('publish_round', {
    p_actor: c.get('principal').id,
    p_aal: c.get('principal').aal,
    p_round: rowId(c),
    p_ids: input.contestant_ids,
  });
  dbError(error);
  return ok(c, data);
});
app.post('/api/admin/rounds/:id/open-voting', async (c) => {
  await authorize(c.get('principal'), c.env, ['SUPER_ADMIN']);
  const input = await parse(c, votingSettingsSchema);
  const { data, error } = await service(c.env).rpc('save_voting_settings', {
    p_actor: c.get('principal').id,
    p_aal: c.get('principal').aal,
    p_round: rowId(c),
    p_open: input.open_at,
    p_close: input.close_at,
    p_reason: input.reason,
  });
  dbError(error);
  return ok(c, data);
});
app.post('/api/admin/checkin', async (c) => {
  const input = await parse(c, checkinSchema);
  const { data, error } = await service(c.env).rpc('check_in', {
    p_actor: c.get('principal').id,
    p_aal: c.get('principal').aal,
    p_hash: await digest(input.token),
  });
  dbError(error);
  return ok(c, data);
});
app.post('/api/admin/tickets', async (c) => {
  await authorize(c.get('principal'), c.env, ['TICKET_STAFF']);
  const input = await parse(
    c,
    z.object({ user_id: uuid, round_id: uuid, seat_label: z.string().min(1).max(32) }).strict(),
  );
  const token = crypto.randomUUID() + crypto.randomUUID();
  const { data, error } = await service(c.env).rpc('issue_ticket', {
    p_actor: c.get('principal').id,
    p_aal: c.get('principal').aal,
    p_user: input.user_id,
    p_round: input.round_id,
    p_seat: input.seat_label,
    p_hash: await digest(token),
  });
  dbError(error);
  return ok(c, { ...data, token });
});
app.get('/api/admin/audit', async (c) => {
  await authorize(c.get('principal'), c.env, ['SUPER_ADMIN']);
  const { data, error } = await service(c.env)
    .from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);
  dbError(error);
  return ok(c, data);
});
app.get('/api/admin/emails', async (c) => {
  await authorize(c.get('principal'), c.env, ['CONTEST_REVIEWER']);
  const { data, error } = await service(c.env)
    .from('email_outbox')
    .select('id,template,status,attempts,created_at')
    .order('created_at', { ascending: false })
    .limit(100);
  dbError(error);
  return ok(c, data);
});
app.post('/api/admin/roles', async (c) => {
  await authorize(c.get('principal'), c.env, ['SUPER_ADMIN']);
  const input = await parse(
    c,
    z.object({ user_id: uuid, role: z.enum(roles), enabled: z.boolean() }).strict(),
  );
  const { error } = await service(c.env).rpc('set_user_role', {
    p_actor: c.get('principal').id,
    p_aal: c.get('principal').aal,
    p_user: input.user_id,
    p_role: input.role,
    p_enabled: input.enabled,
  });
  dbError(error);
  return ok(c, { saved: true });
});
app.get('/api/admin/roles', async (c) => {
  await authorize(c.get('principal'), c.env, ['SUPER_ADMIN']);
  const { data, error } = await service(c.env).from('user_roles').select('user_id,role').limit(200);
  dbError(error);
  return ok(c, data);
});
app.get('/api/me/access', async (c) => {
  const principal = c.get('principal');
  const { data, error } = await service(c.env).rpc('has_role', {
    p_user: principal.id,
    p_roles: ['SUPER_ADMIN'],
  });
  dbError(error);
  let editor = false;
  if (!data && principal.aal === 'aal2') {
    const result = await service(c.env).rpc('has_role', {
      p_user: principal.id,
      p_roles: ['CONTENT_EDITOR'],
    });
    dbError(result.error);
    editor = result.data === true;
  }
  return ok(c, {
    is_admin: data === true || editor,
    aal: principal.aal,
    ...(editor ? { default_admin_path: '/admin?muc=publications' } : {}),
  });
});
app.get('/api/admin/settings', async (c) => {
  const p = c.get('principal');
  await authorize(p, c.env, ['SUPER_ADMIN']);
  const { data, error } = await service(c.env).rpc('admin_event_settings', {
    p_actor: p.id,
    p_aal: p.aal,
  });
  dbError(error);
  return ok(c, data);
});
app.put('/api/admin/rounds/:id/voting-settings', async (c) => {
  const p = c.get('principal');
  await authorize(p, c.env, ['SUPER_ADMIN']);
  const input = await parse(c, votingSettingsSchema);
  const { data, error } = await service(c.env).rpc('save_voting_settings', {
    p_actor: p.id,
    p_aal: p.aal,
    p_round: rowId(c),
    p_open: input.open_at,
    p_close: input.close_at,
    p_reason: input.reason,
  });
  dbError(error);
  return ok(c, data);
});
app.put('/api/admin/events/:id/sale-settings', async (c) => {
  const p = c.get('principal');
  await authorize(p, c.env, ['SUPER_ADMIN']);
  const input = await parse(c, saleSettingsSchema);
  const { data, error } = await service(c.env).rpc('save_sale_settings', {
    p_actor: p.id,
    p_aal: p.aal,
    p_event: rowId(c),
    p_revision: input.revision,
    p_phases: input.phases,
  });
  dbError(error);
  return ok(c, data);
});
app.route('/api', purchases);
app.all('/api/*', (c) => c.json({ error: 'Không tìm thấy API.' }, 404));
app.get('*', async (c) =>
  c.env.ASSETS ? c.env.ASSETS.fetch(c.req.raw) : c.text('FTUCHARM API', 200),
);
export default {
  fetch: app.fetch,
  scheduled: (_controller: ScheduledController, env: Env, ctx: ExecutionContext) => {
    if (env.DEMO_MODE !== 'true') {
      ctx.waitUntil(sendOutbox(env));
      ctx.waitUntil(
        Promise.resolve(service(env).rpc('expire_purchase_holds', { p_limit: 100 })).then(
          ({ error }) => {
            if (error) console.error('Purchase hold expiry failed');
          },
        ),
      );
      ctx.waitUntil(
        Promise.resolve(service(env).rpc('expire_sales_holds', { p_limit: 100 })).then(
          ({ error }) => {
            if (error) console.error('Sales hold expiry failed');
          },
        ),
      );
      ctx.waitUntil(
        Promise.resolve(service(env).rpc('close_due_vote_sessions', { p_limit: 100 })).then(
          ({ error }) => {
            if (error && error.code !== 'PGRST202') console.error('Vote deadline closure failed');
          },
        ),
      );
    }
  },
};
