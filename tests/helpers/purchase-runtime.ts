// Test adapter only: never bundled into Worker or frontend. No remote Auth/DB/R2 calls.
import sharp from 'sharp';
import { HTTPException } from 'hono/http-exception';
import type { Env, Principal } from '../../apps/api/src/security';
export const fixture = (n: number) => `98010000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const owner = fixture(1),
  other = fixture(2),
  admin = fixture(3),
  offerId = fixture(40),
  productId = fixture(50);
export const fakeBuyer = {
  name: 'DEMO ONLY',
  school: 'DEMO',
  cohort_class: 'DEMO',
  student_id: 'DEMO',
  email: 'demo@example.test',
  phone: '0000000000',
  facebook: 'DEMO',
};
export const selection = (quantity = 1) => ({
  offer_id: offerId,
  buyer: fakeBuyer,
  lines: [{ product_id: productId, bundle_size: 1, quantity }],
});
export type Query = (
  sql: string,
  params?: unknown[],
) => Promise<{ rows: Record<string, unknown>[] }>;
const calls: Record<string, string[]> = {
  purchase_catalog: ['p_slug'],
  read_purchase: ['p_user', 'p_request'],
  reserve_purchase: ['p_user', 'p_data', 'p_key', 'p_hash'],
  attach_purchase_evidence: ['p_user', 'p_request', 'p_id', 'p_object', 'p_bytes'],
  complete_purchase: ['p_user', 'p_request', 'p_evidence'],
  has_role: ['p_user', 'p_roles'],
  cast_category_vote: ['p_user', 'p_round', 'p_ticket', 'p_contestant', 'p_category', 'p_session'],
  save_purchase_offer: ['p_actor', 'p_aal', 'p_data'],
  purchase_statistics: ['p_actor', 'p_aal'],
  manage_purchase_voting: ['p_actor', 'p_aal', 'p_session', 'p_action', 'p_reason'],
};
export function databaseAdapter(query: Query) {
  return {
    rpc: async (name: string, data: Record<string, unknown>) => {
      if (!calls[name]) throw new Error('Unexpected test RPC: ' + name);
      const args = calls[name].map((k) => data[k] ?? null);
      try {
        return {
          data: (
            await query(
              `select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) data`,
              args,
            )
          ).rows[0].data,
          error: null,
        };
      } catch (e) {
        return { data: null, error: { message: (e as Error).message } };
      }
    },
    from: (table: string) => new TableQuery(query, table),
  };
}
class TableQuery {
  private columns = '*';
  private filters: string[] = [];
  private values: unknown[] = [];
  private orders: string[] = [];
  private take = 1000;
  private skip = 0;
  private single = false;
  private count = false;
  constructor(
    private query: Query,
    private table: string,
  ) {
    if (
      ![
        'purchase_requests',
        'purchase_evidence',
        'purchase_offers',
        'tickets',
        'votes',
        'contest_rounds',
        'round_entries',
        'contestants',
        'vote_categories',
        'vote_sessions',
        'vote_eligible_contestants',
        'vote_result_snapshots',
        'contest_editions',
      ].includes(table)
    )
      throw new Error('Unexpected table: ' + table);
  }
  select(fields: string, options?: { count?: string }) {
    if (!/^[a-z_,*]+$/.test(fields) && fields !== '*,products:purchase_products(*)')
      throw new Error('Unexpected select');
    this.columns =
      fields === '*,products:purchase_products(*)'
        ? "*,(select coalesce(jsonb_agg(to_jsonb(p)),'[]') from public.purchase_products p where p.offer_id=purchase_offers.id) products"
        : fields;
    this.count = options?.count === 'exact';
    return this;
  }
  eq(col: string, value: unknown) {
    this.filters.push(`${identifier(col)}=$${this.values.push(value)}`);
    return this;
  }
  in(col: string, values: unknown[]) {
    this.filters.push(`${identifier(col)}=any($${this.values.push(values)})`);
    return this;
  }
  order(col: string, options?: { ascending: boolean }) {
    this.orders.push(identifier(col) + (options?.ascending === false ? ' desc' : ' asc'));
    return this;
  }
  limit(n: number) {
    this.take = n;
    return this;
  }
  range(start: number, end: number) {
    this.skip = start;
    this.take = end - start + 1;
    return this;
  }
  maybeSingle() {
    this.single = true;
    return this;
  }
  async execute() {
    try {
      const where = this.filters.length ? ' where ' + this.filters.join(' and ') : '';
      const rows = (
        await this.query(
          `select ${this.columns} from public.${this.table}${where}${this.orders.length ? ' order by ' + this.orders.join(',') : ''} limit ${this.take} offset ${this.skip}`,
          this.values,
        )
      ).rows;
      const count = this.count
        ? Number(
            (await this.query(`select count(*) n from public.${this.table}${where}`, this.values))
              .rows[0].n,
          )
        : null;
      return { data: this.single ? (rows[0] ?? null) : rows, error: null, count };
    } catch (e) {
      return { data: null, error: { message: (e as Error).message }, count: null };
    }
  }
  then<T>(
    fulfilled: (value: Awaited<ReturnType<TableQuery['execute']>>) => T,
    rejected?: (e: unknown) => unknown,
  ) {
    return this.execute().then(fulfilled, rejected);
  }
}
function identifier(s: string) {
  if (!/^[a-z_]+$/.test(s)) throw new Error('Invalid identifier');
  return s;
}
export async function testAuthenticate(request: Request) {
  const bearer = request.headers.get('Authorization') ?? '';
  const match = /^Bearer local-test:([a-f0-9-]{36}):(aal1|aal2)$/.exec(bearer);
  if (!match) throw new HTTPException(401, { message: 'Local test token required' });
  return { id: match[1], email: 'demo@example.test', aal: match[2] };
}
export async function testAuthorize(
  query: Query,
  principal: Principal,
  _env: Env,
  roles: string[],
) {
  if (principal.aal !== 'aal2') throw new HTTPException(403, { message: 'MFA required' });
  const result = await query('select public.has_role($1,$2) allowed', [principal.id, roles]);
  if (!result.rows[0].allowed) throw new HTTPException(403, { message: 'Forbidden' });
}
export function localEnvironment(origin = 'http://127.0.0.1:5173') {
  const objects = new Map<string, ArrayBuffer>();
  const env = {
    SUPABASE_URL: 'http://127.0.0.1',
    SUPABASE_PUBLISHABLE_KEY: 'test-only',
    SUPABASE_JWKS_URL: 'http://127.0.0.1/auth/v1/.well-known/jwks.json',
    ALLOWED_ORIGIN: origin,
    DEMO_MODE: 'false',
    RATE_LIMITER: { limit: async () => ({ success: true }) },
    MEDIA: {
      put: async (key: string, value: ArrayBuffer) => {
        objects.set(key, value);
      },
      delete: async (key: string) => {
        objects.delete(key);
      },
      get: async (key: string) =>
        objects.has(key) ? { body: new Blob([objects.get(key)!]).stream() } : null,
    },
    IMAGES: {
      info: async (stream: ReadableStream) => {
        const b = Buffer.from(await new Response(stream).arrayBuffer());
        return sharp(b).metadata();
      },
      input: (stream: ReadableStream) => ({
        transform: () => ({
          output: async () => ({
            response: async () => {
              const b = Buffer.from(await new Response(stream).arrayBuffer());
              return new Response(
                new Uint8Array(
                  await sharp(b)
                    .resize({ width: 1600, withoutEnlargement: true })
                    .webp({ quality: 85 })
                    .toBuffer(),
                ),
              );
            },
          }),
        }),
      }),
    },
  } as unknown as Env;
  return { env, objects };
}
export const token = (user = owner, aal = 'aal1') => 'Bearer local-test:' + user + ':' + aal;
