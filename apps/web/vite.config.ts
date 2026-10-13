import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
export default defineConfig(({ command, mode }) => ({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react(), tailwindcss()],
  envDir: fileURLToPath(new URL('../../', import.meta.url)),
  define: {
    'import.meta.env.VITE_PREVIEW_MODE': JSON.stringify(
      process.env.VITE_PREVIEW_MODE ??
        (command === 'serve'
          ? (loadEnv(mode, fileURLToPath(new URL('../../', import.meta.url)), 'VITE_')
              .VITE_PREVIEW_MODE ?? 'true')
          : 'false'),
    ),
  },
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
    sourcemap: false,
    rolldownOptions: {
      output: {
        codeSplitting: {
          // Keep the existing SDK separately cacheable across visual-only releases.
          groups:
            process.env.VITE_PREVIEW_MODE === 'true'
              ? []
              : [{ name: 'supabase-vendor', test: /node_modules[\\/]@supabase[\\/]/ }],
        },
      },
    },
  },
  server: { port: 5173, proxy: { '/api': 'http://127.0.0.1:8787' } },
  resolve: {
    alias: {
      '@ftu/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)),
      '@ftu/ui': fileURLToPath(new URL('../../packages/ui/src/index.tsx', import.meta.url)),
    },
  },
}));
