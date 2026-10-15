import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { officialEditionSlug, publicationSchema, registrationState, uuid } from '@ftu/shared';
import {
  authorize,
  service,
  imageSignature,
  stripWebPMetadata,
  type Env,
  type Principal,
} from './security';

type AppEnv = { Bindings: Env; Variables: { principal: Principal } };
const fields =
  'id,edition_id,slug,display_name,number,cohort,class_name,height_cm,gender,faculty,bio,talents,stage,photo_url,published';
export const program = new Hono<AppEnv>();
function checked<T>(result: { data: T; error: { message: string } | null }) {
  if (result.error)
    throw new HTTPException(503, { message: 'Không thể tải thông tin chương trình.' });
  return result.data;
}
export async function officialEdition(env: Env) {
  return checked(
    await service(env)
      .from('contest_editions')
      .select('*')
      .eq('slug', env.PUBLIC_EDITION_SLUG ?? officialEditionSlug)
      .eq('published', true)
      .maybeSingle(),
  );
}
export async function publishedRoundPhotos(env: Env, editionId: string, roundId?: string) {
  const db = service(env);
  const [photos, rounds, entries] = await Promise.all([
    db
      .from('program_publications')
      .select('contestant_id,round_id,photo_url')
      .eq('edition_id', editionId)
      .eq('published', true),
    db
      .from('contest_rounds')
      .select('id,position')
      .eq('edition_id', editionId)
      .eq('published', true)
      .order('position'),
    db
      .from('round_entries')
      .select('round_id,contestant_id')
      .eq('edition_id', editionId)
      .eq('eligible', true),
  ]);
  const map = new Map<string, string>();
  for (const round of (checked(rounds) ?? []).filter((r) => !roundId || r.id === roundId))
    for (const photo of checked(photos) ?? []) {
      if (
        photo.round_id === round.id &&
        photo.photo_url &&
        (checked(entries) ?? []).some(
          (e) => e.round_id === round.id && e.contestant_id === photo.contestant_id,
        )
      )
        map.set(photo.contestant_id, photo.photo_url);
    }
  return map;
}
program.get('/program', async (c) => {
  const db = service(c.env);
  const edition = await officialEdition(c.env);
  const tick = new Date();
  if (!edition)
    return c.json({
      data: {
        edition: null,
        server_time: tick.toISOString(),
        timeline: [],
        offers: [],
        registration_state: 'UNCONFIGURED',
      },
    });
  const [timeline, catalog] = await Promise.all([
    db
      .from('timeline_events')
      .select('*')
      .eq('edition_id', edition.id)
      .eq('published', true)
      .order('position'),
    db.rpc('purchase_catalog', { p_slug: null }),
  ]);
  const data = checked(catalog);
  return c.json({
    data: {
      edition,
      server_time: data.server_time,
      timeline: checked(timeline),
      offers: data.offers.filter(
        (o: { edition_id: string; mode: string }) =>
          o.edition_id === edition.id && o.mode === 'LIVE',
      ),
      registration_state: registrationState(edition, Date.parse(data.server_time)),
    },
  });
});
program.get('/awards', async (c) => {
  const edition = await officialEdition(c.env);
  if (!edition) return c.json({ data: [] });
  const db = service(c.env);
  const rows = checked(
    await db
      .from('program_publications')
      .select('*')
      .eq('edition_id', edition.id)
      .eq('published', true)
      .is('round_id', null)
      .order('award_name'),
  );
  const contestants = checked(
    await db.from('contestants').select(fields).eq('edition_id', edition.id).eq('published', true),
  );
  return c.json({
    data: (rows ?? []).flatMap((row) => {
      const contestant = (contestants ?? []).find((person) => person.id === row.contestant_id);
      return contestant ? [{ ...row, contestant }] : [];
    }),
  });
});
program.get('/rounds/:id/contestants', async (c) => {
  if (!uuid.safeParse(c.req.param('id')).success)
    throw new HTTPException(400, { message: 'Vòng thi không hợp lệ.' });
  const edition = await officialEdition(c.env);
  if (!edition) return c.json({ data: [] });
  const db = service(c.env);
  const round = checked(
    await db
      .from('contest_rounds')
      .select('id')
      .eq('id', c.req.param('id'))
      .eq('edition_id', edition.id)
      .eq('published', true)
      .maybeSingle(),
  );
  if (!round) return c.json({ data: [] });
  const entries = checked(
    await db
      .from('round_entries')
      .select('contestant_id')
      .eq('round_id', round.id)
      .eq('eligible', true),
  );
  const rows = checked(
    await db
      .from('program_publications')
      .select('*')
      .eq('edition_id', edition.id)
      .eq('round_id', c.req.param('id'))
      .eq('published', true),
  );
  const contestants = checked(
    await db.from('contestants').select(fields).eq('edition_id', edition.id).eq('published', true),
  );
  return c.json({
    data: (rows ?? []).flatMap((row) => {
      const contestant = (contestants ?? []).find((person) => person.id === row.contestant_id);
      return contestant && entries?.some((e) => e.contestant_id === row.contestant_id)
        ? [{ ...contestant, photo_url: row.photo_url, round_id: row.round_id }]
        : [];
    }),
  });
});
program.get('/admin/publications', async (c) => {
  await authorize(c.get('principal'), c.env, ['CONTENT_EDITOR']);
  const db = service(c.env);
  const [editions, rounds, contestants, publications] = await Promise.all([
    db
      .from('contest_editions')
      .select('*')
      .eq('slug', c.env.PUBLIC_EDITION_SLUG ?? officialEditionSlug),
    db.from('contest_rounds').select('id,edition_id,title').order('position'),
    db.from('contestants').select(fields).eq('published', true).order('number'),
    db.from('program_publications').select('*'),
  ]);
  const e = checked(editions),
    ids = (e ?? []).map((row) => row.id);
  return c.json({
    data: {
      editions: e,
      rounds: (checked(rounds) ?? []).filter((row) => ids.includes(row.edition_id)),
      contestants: (checked(contestants) ?? []).filter((row) => ids.includes(row.edition_id)),
      publications: (checked(publications) ?? []).filter((row) => ids.includes(row.edition_id)),
    },
  });
});
program.post('/admin/publications', async (c) => {
  const principal = c.get('principal');
  await authorize(principal, c.env, ['CONTENT_EDITOR']);
  const input = publicationSchema.safeParse(await c.req.json());
  if (!input.success) throw new HTTPException(400, { message: input.error.issues[0].message });
  const { data, error } = await service(c.env).rpc('save_program_publication', {
    p_actor: principal.id,
    p_aal: principal.aal,
    p_data: input.data,
  });
  if (error)
    throw new HTTPException(400, {
      message: 'Kiểm tra ảnh, thí sinh đã công bố và danh sách thuộc vòng thi.',
    });
  return c.json({ data });
});
program.post('/admin/public-images', async (c) => {
  await authorize(c.get('principal'), c.env, ['CONTENT_EDITOR']);
  if (!c.env.IMAGES || !c.env.MEDIA)
    throw new HTTPException(503, { message: 'Lưu trữ ảnh chưa được cấu hình.' });
  const raw = await c.req.arrayBuffer();
  if (!raw.byteLength || raw.byteLength > 5 * 1024 * 1024 || !imageSignature(new Uint8Array(raw)))
    throw new HTTPException(400, { message: 'Chọn ảnh JPG/PNG tối đa 5 MB.' });
  const info = await c.env.IMAGES.info(new Blob([raw]).stream());
  if (!('width' in info) || info.width * info.height > 12000000)
    throw new HTTPException(400, { message: 'Ảnh vượt 12 megapixel.' });
  const clean = (
    await c.env.IMAGES.input(new Blob([raw]).stream())
      .transform({ width: 1600, fit: 'scale-down' })
      .output({ format: 'image/webp', quality: 85, anim: false })
  ).response();
  const id = crypto.randomUUID();
  const bytes = stripWebPMetadata(await clean.arrayBuffer());
  await c.env.MEDIA.put(`public-program/${id}.webp`, bytes, {
    httpMetadata: { contentType: 'image/webp' },
  });
  return c.json({ data: { photo_url: `/api/public-images/${id}.webp` } });
});
program.get('/public-images/:file', async (c) => {
  const file = c.req.param('file');
  if (!/^[a-f0-9-]{36}\.webp$/.test(file) || !c.env.MEDIA) return c.notFound();
  // Unpublished photos are only readable by the staff who can prepare publications.
  const db = service(c.env);
  const edition = await officialEdition(c.env);
  const rows = edition
    ? checked(
        await db
          .from('program_publications')
          .select('contestant_id,round_id')
          .eq('edition_id', edition.id)
          .eq('photo_url', `/api/public-images/${file}`)
          .eq('published', true),
      )
    : [];
  let publicImage = false;
  for (const row of rows ?? []) {
    const person = checked(
      await db
        .from('contestants')
        .select('id')
        .eq('id', row.contestant_id)
        .eq('published', true)
        .maybeSingle(),
    );
    if (!person) continue;
    if (row.round_id) {
      const [round, entry] = await Promise.all([
        db
          .from('contest_rounds')
          .select('id')
          .eq('id', row.round_id)
          .eq('published', true)
          .maybeSingle(),
        db
          .from('round_entries')
          .select('contestant_id')
          .eq('round_id', row.round_id)
          .eq('contestant_id', row.contestant_id)
          .eq('eligible', true)
          .maybeSingle(),
      ]);
      if (!checked(round) || !checked(entry)) continue;
    }
    publicImage = true;
    break;
  }
  if (!publicImage) {
    const { authenticate } = await import('./security');
    await authorize(await authenticate(c.req.raw, c.env), c.env, ['CONTENT_EDITOR']);
  }
  const object = await c.env.MEDIA.get(`public-program/${file}`);
  if (!object) return c.notFound();
  return new Response(object.body, {
    headers: {
      'Content-Type': 'image/webp',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});
