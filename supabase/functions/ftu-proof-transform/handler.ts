import { HTTPException } from 'hono/http-exception';
import { authenticate, authorize, service, type Env } from '../../../apps/api/src/security.ts';
import {
  equalSignature,
  hashBytes,
  proofSignature,
} from '../../../apps/api/src/proof-signature.ts';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export function proofHandler(
  env: Env,
  transform: (bytes: Uint8Array, mime: string) => Uint8Array,
  workerKeys: string[],
) {
  return async (request: Request) => {
    const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
    try {
      if (request.method !== 'POST') return new Response(null, { status: 405, headers });
      const purchaseId = request.headers.get('X-FTU-Purchase') ?? '';
      const intent = request.headers.get('X-FTU-Proof-Intent');
      if (!uuid.test(purchaseId) || !['owner', 'staff'].includes(intent ?? ''))
        throw new HTTPException(400);
      const timestamp = request.headers.get('X-FTU-Proof-Time') ?? '';
      const bodyHash = request.headers.get('X-FTU-Proof-Hash') ?? '';
      const signature = request.headers.get('X-FTU-Proof-Signature') ?? '';
      if (
        !/^\d{13}$/.test(timestamp) ||
        Math.abs(Date.now() - Number(timestamp)) > 30000 ||
        !/^[a-f0-9]{64}$/.test(bodyHash)
      )
        throw new HTTPException(401);
      // Only a rate-limited Worker can call the codec, even with a valid user JWT.
      let trustedWorker = false;
      for (const secret of workerKeys) {
        if (
          equalSignature(
            signature,
            await proofSignature(secret, request, purchaseId, intent!, timestamp, bodyHash),
          )
        )
          trustedWorker = true;
      }
      if (!trustedWorker) throw new HTTPException(401);
      const principal = await authenticate(request, env);
      const db = service(env);
      const { data: purchase, error } = await db
        .from('purchase_requests')
        .select('user_id,status,expires_at,offer_id')
        .eq('id', purchaseId)
        .maybeSingle();
      if (error) throw new HTTPException(503);
      if (!purchase) throw new HTTPException(404);
      if (intent === 'staff') {
        await authorize(principal, env, ['TICKET_STAFF']);
        if (purchase.status !== 'COMPLETED') throw new HTTPException(409);
      } else if (purchase.user_id !== principal.id) throw new HTTPException(404);
      else if (purchase.status !== 'HELD' || new Date(purchase.expires_at).getTime() <= Date.now())
        throw new HTTPException(409);
      // This function is exclusively for the approved DEMO test on the shared project.
      if (!env.DEMO_TEST_OFFER_SLUG) throw new HTTPException(503);
      const { data: offer, error: offerError } = await db
        .from('purchase_offers')
        .select('id')
        .eq('id', purchase.offer_id)
        .eq('mode', 'DEMO')
        .eq('slug', env.DEMO_TEST_OFFER_SLUG)
        .maybeSingle();
      if (offerError) throw new HTTPException(503);
      if (!offer) throw new HTTPException(403);
      const mime = request.headers.get('Content-Type') ?? '';
      if (!['image/png', 'image/jpeg'].includes(mime)) throw new HTTPException(400);
      const reader = request.body?.getReader();
      if (!reader) throw new HTTPException(400);
      let size = 0;
      const chunks: Uint8Array[] = [];
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 5242880) throw new HTTPException(413);
          chunks.push(value);
        }
      } finally {
        await reader.cancel();
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      if (!equalSignature(bodyHash, await hashBytes(bytes))) throw new HTTPException(400);
      let clean: Uint8Array;
      try {
        clean = transform(bytes, mime);
      } catch {
        throw new HTTPException(400);
      }
      return new Response(new Uint8Array(clean).buffer, {
        headers: { ...headers, 'Content-Type': 'image/webp' },
      });
    } catch (error) {
      return Response.json(
        { error: 'Không thể xử lý ảnh minh chứng.' },
        {
          status: error instanceof HTTPException ? error.status : 503,
          headers,
        },
      );
    }
  };
}
