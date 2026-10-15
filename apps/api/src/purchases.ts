import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import {
  completionSchema,
  demoPurchaseCatalog,
  offerConfigSchema,
  purchaseSelectionSchema,
} from '@ftu/shared';
import {
  authorize,
  digest,
  imageSignature,
  service,
  stripWebPMetadata,
  type Env,
  type Principal,
} from './security';
import { officialEdition } from './program';

type AppEnv = { Bindings: Env; Variables: { principal: Principal } };
function failure(error: { message: string } | null) {
  if (!error) return;
  const messages: Record<string, [number, string]> = {
    PURCHASE_NOT_FOUND: [404, 'Không tìm thấy đơn của bạn.'],
    PURCHASE_EXPIRED: [409, 'Đã hết 30 phút giữ vé. Vui lòng đặt vé lại.'],
    QUOTA_UNAVAILABLE: [409, 'Số vé còn lại đã thay đổi. Vui lòng chọn lại số lượng.'],
    SALE_NOT_CONFIGURED: [409, 'BTC đang chuẩn bị giá và phân bổ vé.'],
    PROGRAM_QUOTA_EXCEEDED: [400, 'Quota vượt giới hạn vé sớm hoặc tổng vé của vòng.'],
    PROGRAM_CAPACITY_FIXED: [400, 'Giữ nguyên hạn mức vé đã chốt của vòng.'],
    QUOTA_BELOW_ALLOCATED: [409, 'Quota không được thấp hơn số vé đã giữ hoặc Hoàn tất.'],
    IDEMPOTENCY_CONFLICT: [409, 'Yêu cầu gửi lại có nội dung khác.'],
    SALE_CLOSED: [409, 'Loại vé chưa mở bán hoặc đã đóng bán.'],
    PAYMENT_NOT_CONFIGURED: [409, 'BTC chưa cấu hình thanh toán.'],
    INVALID_EVIDENCE: [400, 'Ảnh minh chứng không thuộc đơn này.'],
    COMBO_NOT_CONFIGURED: [409, 'Combo chưa được BTC cấu hình.'],
    FORBIDDEN: [403, 'Không có quyền thực hiện.'],
    IMMUTABLE_PURCHASE_SCOPE: [409, 'Không đổi vòng hoặc chế độ của đợt đã có đơn.'],
    INVALID_SESSION_TRANSITION: [409, 'Trạng thái phiên không cho phép thao tác này.'],
    REOPEN_APPROVAL_REQUIRED: [403, 'Cần SUPER_ADMIN và lý do để mở lại.'],
    VOTE_REASON_REQUIRED: [400, 'SUPER_ADMIN cần ghi lý do để đóng sớm phiên đang mở.'],
    VOTE_ALREADY_CLOSED: [409, 'Phiên đã đóng không được mở lại.'],
    LEGACY_VOTE_RECONCILIATION_REQUIRED: [
      409,
      'Cần đối chiếu hạng mục của phiếu cũ trước khi chốt.',
    ],
  };
  const match = Object.entries(messages).find(([code]) => error.message.includes(code));
  throw new HTTPException((match?.[1][0] ?? 503) as 400, {
    message: match?.[1][1] ?? 'Chưa lưu được dữ liệu. Vui lòng thử lại.',
  });
}
async function json<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new HTTPException(400, { message: 'JSON không hợp lệ.' });
  }
  const result = schema.safeParse(body);
  if (!result.success) throw new HTTPException(400, { message: result.error.issues[0].message });
  return result.data;
}
const id = (value: string) => {
  if (!z.uuid().safeParse(value).success)
    throw new HTTPException(400, { message: 'Mã không hợp lệ.' });
  return value;
};
export const purchases = new Hono<AppEnv>();
purchases.get('/purchase-catalog', async (c) => {
  if (c.env.DEMO_MODE === 'true') return c.json({ data: demoPurchaseCatalog() });
  const slug = c.req.query('slug') ?? null;
  if (slug && !/^[a-z0-9-]{1,100}$/.test(slug))
    throw new HTTPException(400, { message: 'Đợt vé không hợp lệ.' });
  const { data, error } = await service(c.env).rpc('purchase_catalog', { p_slug: slug });
  failure(error);
  if (c.env.PUBLIC_EDITION_SLUG) {
    const edition = await officialEdition(c.env);
    data.offers = data.offers.filter(
      (o: { mode: string; edition_id: string }) =>
        o.mode === 'LIVE' && o.edition_id === edition?.id,
    );
  }
  return c.json({ data });
});
purchases.post('/purchases', async (c) => {
  const input = await json(c.req.raw, purchaseSelectionSchema);
  const key = id(c.req.header('Idempotency-Key') ?? '');
  const paymentConfig = await service(c.env)
    .from('purchase_offers')
    .select('mode,qr_path,published,edition_id')
    .eq('id', input.offer_id)
    .maybeSingle();
  failure(paymentConfig.error);
  if (c.env.PUBLIC_EDITION_SLUG) {
    const edition = await officialEdition(c.env);
    if (paymentConfig.data?.mode !== 'LIVE' || paymentConfig.data.edition_id !== edition?.id)
      throw new HTTPException(409, { message: 'Đợt vé chưa mở bán.' });
  }
  if (paymentConfig.data?.published && paymentConfig.data.mode === 'LIVE') {
    const qr = paymentConfig.data.qr_path;
    if (!qr || !c.env.ASSETS)
      throw new HTTPException(503, { message: 'BTC chưa cấu hình ảnh QR thanh toán thật.' });
    const asset = await c.env.ASSETS.fetch(new Request(new URL(qr, c.req.url)));
    if (
      !asset.ok ||
      !['image/png', 'image/jpeg', 'image/webp'].includes(
        asset.headers.get('Content-Type')?.split(';')[0] ?? '',
      )
    )
      throw new HTTPException(503, { message: 'QR thanh toán chưa khả dụng. Liên hệ BTC.' });
    await asset.body?.cancel();
  }
  const canonical = {
    ...input,
    lines: [...input.lines].sort(
      (a, b) => a.product_id.localeCompare(b.product_id) || a.bundle_size - b.bundle_size,
    ),
  };
  const { data, error } = await service(c.env).rpc('reserve_purchase', {
    p_user: c.get('principal').id,
    p_data: canonical,
    p_key: key,
    p_hash: await digest(JSON.stringify(canonical)),
  });
  failure(error);
  return c.json({ data });
});
purchases.get('/purchases/:id', async (c) => {
  const { data, error } = await service(c.env).rpc('read_purchase', {
    p_user: c.get('principal').id,
    p_request: id(c.req.param('id')),
  });
  failure(error);
  return c.json({ data });
});
purchases.post('/purchases/:id/complete', async (c) => {
  const input = await json(c.req.raw, completionSchema);
  const { data, error } = await service(c.env).rpc('complete_purchase', {
    p_user: c.get('principal').id,
    p_request: id(c.req.param('id')),
    p_evidence: input.evidence_id,
  });
  failure(error);
  return c.json({ data });
});
purchases.post('/purchases/:id/evidence', async (c) => {
  const requestId = id(c.req.param('id')),
    principal = c.get('principal'),
    db = service(c.env);
  const owned = await db.rpc('read_purchase', { p_user: principal.id, p_request: requestId });
  failure(owned.error);
  const prior = await db
    .from('purchase_evidence')
    .select('id')
    .eq('request_id', requestId)
    .eq('user_id', principal.id)
    .maybeSingle();
  failure(prior.error);
  if (prior.data) return c.json({ data: prior.data });
  if (owned.data.status !== 'HELD')
    throw new HTTPException(409, { message: 'Đơn đã hết hạn hoặc Hoàn tất.' });
  if (!c.env.IMAGES || !c.env.MEDIA)
    throw new HTTPException(503, { message: 'Lưu ảnh minh chứng chưa được cấu hình.' });
  const mime = c.req.header('Content-Type');
  if (mime !== 'image/jpeg' && mime !== 'image/png')
    throw new HTTPException(400, { message: 'Chọn ảnh JPG hoặc PNG, tối đa 5 MB.' });
  const raw = await c.req.arrayBuffer();
  if (!raw.byteLength || raw.byteLength > 5242880 || imageSignature(new Uint8Array(raw)) !== mime)
    throw new HTTPException(400, { message: 'Ảnh không hợp lệ hoặc quá 5 MB.' });
  let info: Awaited<ReturnType<ImagesBinding['info']>>;
  try {
    info = await c.env.IMAGES.info(new Blob([raw]).stream());
  } catch {
    throw new HTTPException(400, { message: 'Ảnh không đọc được. Chọn JPG/PNG khác.' });
  }
  if (!('width' in info) || !('height' in info) || info.width * info.height > 12000000)
    throw new HTTPException(400, { message: 'Chọn ảnh tối đa 12 megapixel.' });
  const transformed = await (
    await c.env.IMAGES.input(new Blob([raw]).stream())
      .transform({ width: 1600, fit: 'scale-down' })
      .output({ format: 'image/webp', quality: 85, anim: false })
  ).response();
  const clean = stripWebPMetadata(await transformed.arrayBuffer());
  if (clean.byteLength > 5242880)
    throw new HTTPException(400, { message: 'Ảnh quá lớn sau xử lý.' });
  const evidenceId = crypto.randomUUID();
  const object = `private/purchases/${principal.id}/${requestId}/${evidenceId}.webp`;
  await c.env.MEDIA.put(object, clean, { httpMetadata: { contentType: 'image/webp' } });
  const attached = await db.rpc('attach_purchase_evidence', {
    p_user: principal.id,
    p_request: requestId,
    p_id: evidenceId,
    p_object: object,
    p_bytes: clean.byteLength,
  });
  // A simultaneous retry may have won; remove only this request's unused object.
  // On an uncertain network failure the DB may already have committed. Keep the private object
  // until reconciliation confirms it is unreferenced; never delete a possibly attached proof.
  if (!attached.error && attached.data?.id !== evidenceId) await c.env.MEDIA.delete(object);
  failure(attached.error);
  return c.json({ data: attached.data });
});
purchases.get('/purchase-evidence/:id', async (c) => {
  const { data, error } = await service(c.env)
    .from('purchase_evidence')
    .select('user_id,object_key,mime')
    .eq('id', id(c.req.param('id')))
    .maybeSingle();
  failure(error);
  if (!data) throw new HTTPException(404, { message: 'Không tìm thấy ảnh.' });
  if (data.user_id !== c.get('principal').id)
    await authorize(c.get('principal'), c.env, ['TICKET_STAFF']);
  if (!c.env.MEDIA) throw new HTTPException(503, { message: 'Lưu ảnh chưa cấu hình.' });
  const object = await c.env.MEDIA.get(data.object_key);
  if (!object) throw new HTTPException(404, { message: 'Không tìm thấy ảnh.' });
  return new Response(object.body, {
    headers: {
      'Content-Type': data.mime,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});
purchases.get('/me/purchases', async (c) => {
  const { data, error } = await service(c.env)
    .from('purchase_requests')
    .select(
      'id,code,buyer,lines,quantity,total_vnd,status,expires_at,completed_at,evidence_id,round_id',
    )
    .eq('user_id', c.get('principal').id)
    .order('created_at', { ascending: false })
    .limit(100);
  failure(error);
  return c.json({ data });
});
purchases.get('/admin/purchases', async (c) => {
  await authorize(c.get('principal'), c.env, ['TICKET_STAFF']);
  const page = Number(c.req.query('page') ?? '0');
  if (!Number.isSafeInteger(page) || page < 0 || page > 100000)
    throw new HTTPException(400, { message: 'Trang không hợp lệ.' });
  const { data, error, count } = await service(c.env)
    .from('purchase_requests')
    .select(
      'id,code,buyer,lines,quantity,total_vnd,status,expires_at,completed_at,evidence_id,round_id',
      { count: 'exact' },
    )
    .eq('status', 'COMPLETED')
    .order('completed_at', { ascending: false })
    .order('id')
    .range(page * 50, page * 50 + 49);
  failure(error);
  return c.json({ data: { rows: data, count } });
});
purchases.get('/admin/purchase-offers', async (c) => {
  await authorize(c.get('principal'), c.env, ['TICKET_STAFF']);
  const { data, error } = await service(c.env)
    .from('purchase_offers')
    .select('*,products:purchase_products(*)')
    .order('slug')
    .limit(100);
  failure(error);
  return c.json({ data });
});
purchases.get('/admin/purchase-statistics', async (c) => {
  await authorize(c.get('principal'), c.env, ['TICKET_STAFF']);
  const { data, error } = await service(c.env).rpc('purchase_statistics', {
    p_actor: c.get('principal').id,
    p_aal: c.get('principal').aal,
  });
  failure(error);
  return c.json({ data });
});
purchases.post('/admin/purchase-offers', async (c) => {
  await authorize(c.get('principal'), c.env, ['TICKET_STAFF']);
  const input = await json(c.req.raw, offerConfigSchema);
  const { data, error } = await service(c.env).rpc('save_purchase_offer', {
    p_actor: c.get('principal').id,
    p_aal: c.get('principal').aal,
    p_data: input,
  });
  failure(error);
  return c.json({ data });
});
purchases.post('/admin/vote-sessions/:id/:action', async (c) => {
  await authorize(c.get('principal'), c.env, ['VOTE_MANAGER']);
  const action = z
    .enum(['close', 'reopen', 'finalize', 'publish'])
    .safeParse(c.req.param('action'));
  if (!action.success) throw new HTTPException(400, { message: 'Thao tác không hợp lệ.' });
  const input = await json(
    c.req.raw,
    z.object({ reason: z.string().trim().max(1000).optional() }).strict(),
  );
  const { data, error } = await service(c.env).rpc('manage_purchase_voting', {
    p_actor: c.get('principal').id,
    p_aal: c.get('principal').aal,
    p_session: id(c.req.param('id')),
    p_action: action.data,
    p_reason: input.reason ?? null,
  });
  failure(error);
  return c.json({ data });
});
purchases.get('/vote-results/:id', async (c) => {
  const db = service(c.env);
  const session = await db
    .from('vote_sessions')
    .select('id,round_id')
    .eq('id', id(c.req.param('id')))
    .eq('published', true)
    .eq('results_published', true)
    .eq('state', 'FINALIZED')
    .maybeSingle();
  failure(session.error);
  if (!session.data) return c.json({ data: [] });
  const round = await db
    .from('contest_rounds')
    .select('edition_id')
    .eq('id', session.data.round_id)
    .eq('published', true)
    .maybeSingle();
  failure(round.error);
  if (!round.data) return c.json({ data: [] });
  const edition = await db
    .from('contest_editions')
    .select('id,slug')
    .eq('id', round.data.edition_id)
    .eq('published', true)
    .maybeSingle();
  failure(edition.error);
  if (!edition.data) return c.json({ data: [] });
  if (c.env.PUBLIC_EDITION_SLUG && edition.data.slug !== c.env.PUBLIC_EDITION_SLUG)
    return c.json({ data: [] });
  const { data, error } = await db
    .from('vote_result_snapshots')
    .select('category_id,results')
    .eq('session_id', session.data.id);
  failure(error);
  return c.json({ data });
});
purchases.get('/admin/legacy-votes', async (c) => {
  await authorize(c.get('principal'), c.env, ['VOTE_MANAGER']);
  const { data, error } = await service(c.env)
    .from('votes')
    .select('id,ticket_id,round_id,contestant_id,created_at')
    .eq('vote_format', 'LEGACY')
    .order('created_at')
    .limit(100);
  failure(error);
  return c.json({ data });
});
purchases.post('/admin/legacy-votes/:id/classify', async (c) => {
  await authorize(c.get('principal'), c.env, ['VOTE_MANAGER']);
  const input = await json(c.req.raw, z.object({ category_id: z.uuid() }).strict());
  const { data, error } = await service(c.env).rpc('classify_purchase_legacy_vote', {
    p_actor: c.get('principal').id,
    p_aal: c.get('principal').aal,
    p_vote: id(c.req.param('id')),
    p_category: input.category_id,
  });
  failure(error);
  return c.json({ data });
});
