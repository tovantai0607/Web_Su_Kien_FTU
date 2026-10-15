import { HTTPException } from 'hono/http-exception';
import { service, type Env } from './security';

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
export async function enforceDemoWrite(request: Request, env: Env) {
  if (!env.DEMO_TEST_OFFER_SLUG || ['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
  const path = new URL(request.url).pathname;
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
