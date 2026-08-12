import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Dev server port 5173 is pre-authorized in the Keycloak realm (web-portal client
// redirect URIs) and in the gateway's CORS default — do not change it casually.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      output: {
        // Stable vendor chunks so app code changes don't invalidate framework
        // caches; feature code splits per route through React Router's `lazy`.
        //
        // `auth` is separate from `framework` because oidc-client-ts is the
        // one boot-critical dependency that is NOT needed by a page render:
        // pinning it here keeps a token-handling upgrade from invalidating the
        // React chunk, and vice versa. Recharts is deliberately absent — it
        // must stay attached to the analytics and audit routes that lazy-load
        // it, and naming it here would pull it into the eager graph.
        manualChunks: {
          framework: ['react', 'react-dom', 'react-router-dom'],
          data: ['@tanstack/react-query', 'axios', 'zod'],
          auth: ['oidc-client-ts'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    /**
     * Resolve packages the way a BROWSER would, not the way Node does.
     *
     * Vitest runs in Node, so a dual-published package resolves to its Node
     * build by default — and for `axios` those two builds behave differently in
     * ways that matter here. The Node build serialises a `FormData` it does not
     * recognise (jsdom's `FormData` is not undici's) into the string
     * "[object FormData]", so the multipart document upload would be tested
     * against a request the browser never sends. Pinning the browser condition
     * makes the tests exercise the same axios the bundle ships: the XHR
     * adapter, real multipart encoding, real `responseType: 'blob'`.
     */
    alias: [{ find: /^axios$/, replacement: 'axios/dist/browser/axios.cjs' }],
    setupFiles: ['./src/shared/testing/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/shared/testing/**',
        'src/main.tsx',
        'src/vite-env.d.ts',
        'src/**/*.d.ts',
      ],
    },
  },
});
