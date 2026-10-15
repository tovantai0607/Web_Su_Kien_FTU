import { initializeImageMagick } from '@imagemagick/magick-wasm';
import { cleanProof, configureCodecLimits } from './codec.ts';
import { proofHandler } from './handler.ts';

await initializeImageMagick(await Deno.readFile(new URL('./magick.wasm', import.meta.url)));
configureCodecLimits();
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const secrets: Record<string, string> = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}');
const publicKeys: Record<string, string> = JSON.parse(
  Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}',
);
const workerKeys = [...Object.values(secrets), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')].filter(
  (v): v is string => !!v,
);
Deno.serve(
  proofHandler(
    {
      SUPABASE_URL: supabaseUrl,
      SUPABASE_JWKS_URL: `${supabaseUrl}/auth/v1/.well-known/jwks.json`,
      SUPABASE_PUBLISHABLE_KEY: publicKeys.default ?? Deno.env.get('SUPABASE_ANON_KEY')!,
      SUPABASE_SECRET_KEY: secrets.default ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
      ALLOWED_ORIGIN: '',
      DEMO_TEST_OFFER_SLUG: 'test-giao-dich-demo',
    },
    cleanProof,
    workerKeys,
  ),
);
