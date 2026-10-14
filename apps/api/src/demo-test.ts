// Local-only entry point selected by the demo-test Wrangler environment.
// Calls the real application's Auth/ownership/validation; it only adds restrictions.
import { app } from './index';
import { service, type Env } from './security';

type DemoTestEnv = Env & { DEMO_TEST_OFFER_SLUG: string };
export default {
  async fetch(request: Request, env: DemoTestEnv, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (!['127.0.0.1', 'localhost'].includes(url.hostname))
      return Response.json(
        { error: 'Môi trường thử chỉ hoạt động trên máy local.' },
        { status: 403 },
      );
    const db = service(env);
    if (url.pathname === '/api/purchase-catalog') {
      if (url.searchParams.has('slug') && url.searchParams.get('slug') !== env.DEMO_TEST_OFFER_SLUG)
        return Response.json({ data: { server_time: new Date().toISOString(), offers: [] } });
      url.searchParams.set('slug', env.DEMO_TEST_OFFER_SLUG);
      request = new Request(url, request);
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      const { data: offer, error } = await db
        .from('purchase_offers')
        .select('id,mode,edition_id,round_id')
        .eq('slug', env.DEMO_TEST_OFFER_SLUG)
        .maybeSingle();
      if (error || !offer || offer.mode !== 'DEMO')
        return Response.json({ error: 'Đợt thử DEMO chưa sẵn sàng.' }, { status: 503 });
      let allowed = false;
      if (request.method === 'POST' && url.pathname === '/api/purchases') {
        try {
          const input = (await request.clone().json()) as { offer_id?: string };
          allowed = input.offer_id === offer.id;
        } catch {
          /* Real API returns the input error if it is a valid target; otherwise deny. */
        }
      } else if (request.method === 'POST' && url.pathname === '/api/admin/purchase-offers') {
        try {
          const input = (await request.clone().json()) as {
            id?: string;
            mode?: string;
            edition_id?: string;
            round_id?: string;
          };
          allowed =
            input.id === offer.id &&
            input.mode === 'DEMO' &&
            input.edition_id === offer.edition_id &&
            input.round_id === offer.round_id;
          // The application still checks the actual role/MFA and validates every field.
        } catch {
          /* Deny malformed configs. */
        }
      } else if (request.method === 'POST') {
        const match = url.pathname.match(
          /^\/api\/purchases\/([a-f0-9-]{36})\/(evidence|complete)$/,
        );
        if (match) {
          const { data: purchase } = await db
            .from('purchase_requests')
            .select('id')
            .eq('id', match[1])
            .eq('offer_id', offer.id)
            .maybeSingle();
          allowed = !!purchase;
        }
      }
      if (!allowed)
        return Response.json(
          { error: 'Link thử chỉ cho phép ghi đơn của đợt DEMO.' },
          { status: 403 },
        );
    }
    return app.fetch(request, env, ctx);
  },
};
