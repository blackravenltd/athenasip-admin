// `vitest/config` rather than `vite`, so the `test` block below is typed.
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * The admin client is served by AthenaSIP itself, from the same HTTP listener
 * that answers `/api/v1` (`http.files.path` in the server's config). That is
 * why the base is relative and why the dev server proxies `/api` rather than
 * the client holding an absolute URL: in production the API is same-origin,
 * so development should be same-origin too, or every cross-origin concern
 * (cookies, CORS, the `Origin` header) is one that only shows up on the day
 * it ships.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: process.env.ATHENASIP_API ?? 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'build',
    emptyOutDir: true,
  },
  test: {
    environment: 'node',
    setupFiles: './src/test/setup.ts',
  },
});
