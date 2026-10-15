import { HTTPException } from 'hono/http-exception';
import { authenticate, authorize, service, type Env, type Principal } from './security';

export async function requireDemoAdmin(request: Request, env: Env, principal?: Principal) {
  const verified = principal ?? (await authenticate(request, env));
  // Same admin entry policy as /me/access; an email or user_metadata flag is not a role.
  await authorize(verified, env, ['SUPER_ADMIN', 'CONTENT_EDITOR']);
  return verified;
}

export async function canUseDemo(request: Request, env: Env, principal?: Principal) {
  try {
    await requireDemoAdmin(request, env, principal);
    return true;
  } catch (error) {
    if (error instanceof HTTPException && [401, 403].includes(error.status)) return false;
    throw error;
  }
}

export async function visiblePurchaseRows<T extends { round_id: string }>(
  rows: T[],
  request: Request,
  env: Env,
  principal: Principal,
) {
  if (!rows.length || !env.DEMO_TEST_OFFER_SLUG || (await canUseDemo(request, env, principal)))
    return rows;
  const offer = await demoOffer(env);
  return rows.filter((row) => row.round_id !== offer.round_id);
}

export async function demoOffer(env: Env) {
  const { data, error } = await service(env)
    .from('purchase_offers')
    .select('id,mode,edition_id,round_id')
    .eq('slug', env.DEMO_TEST_OFFER_SLUG!)
    .eq('mode', 'DEMO')
    .maybeSingle();
  if (error || !data) throw new HTTPException(503, { message: 'Đợt thử DEMO chưa sẵn sàng.' });
  return data;
}

// An additional environment fence, never a replacement for Auth, roles or ownership.
export async function enforceDemoWrite(request: Request, env: Env, principal?: Principal) {
  if (!env.DEMO_TEST_OFFER_SLUG || ['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
  await requireDemoAdmin(request, env, principal);
  const path = new URL(request.url).pathname;
  // Preparing an image object does not create or publish a LIVE program record.
  // The route still requires authenticated CONTENT_EDITOR/SUPER_ADMIN access.
  // Keep every publication, registration and other LIVE mutation fenced below.
  if (request.method === 'POST' && path === '/api/admin/public-images') return;
  const offer = await demoOffer(env);
  let allowed = false;
  if (
    request.method === 'POST' &&
    ['/api/purchases', '/api/admin/purchase-offers', '/api/votes'].includes(path)
  ) {
    let input: Record<string, unknown>;
    try {
      input = await request.clone().json();
    } catch {
      throw new HTTPException(400, { message: 'JSON không hợp lệ.' });
    }
    if (path === '/api/purchases') allowed = input?.offer_id === offer.id;
    else if (path === '/api/votes') allowed = input?.round_id === offer.round_id;
    else
      allowed =
        input?.id === offer.id &&
        input.mode === 'DEMO' &&
        input.edition_id === offer.edition_id &&
        input.round_id === offer.round_id;
  } else if (request.method === 'POST') {
    const purchase = path.match(
      /^\/api\/(?:purchases|admin\/sheets\/purchases)\/([a-f0-9-]{36})(?:\/(?:evidence|complete))?$/i,
    );
    const session = path.match(
      /^\/api\/admin\/vote-sessions\/([a-f0-9-]{36})\/(?:open|close|finalize|publish|reopen)$/i,
    );
    const prepare = path.match(/^\/api\/admin\/rounds\/([a-f0-9-]{36})\/prepare-categories$/i);
    if (purchase) {
      const { data, error } = await service(env)
        .from('purchase_requests')
        .select('id')
        .eq('id', purchase[1])
        .eq('offer_id', offer.id)
        .maybeSingle();
      allowed = !error && !!data;
    } else if (session) {
      const { data, error } = await service(env)
        .from('vote_sessions')
        .select('id')
        .eq('id', session[1])
        .eq('round_id', offer.round_id)
        .maybeSingle();
      allowed = !error && !!data;
    } else if (prepare) allowed = prepare[1] === offer.round_id;
  } else if (request.method === 'PUT') {
    const round = path.match(/^\/api\/admin\/rounds\/([a-f0-9-]{36})\/voting-settings$/i);
    allowed = !!round && round[1] === offer.round_id;
  }
  if (!allowed)
    throw new HTTPException(403, {
      message: 'Môi trường thử chỉ cho phép thay đổi dữ liệu của đợt DEMO.',
    });
}
