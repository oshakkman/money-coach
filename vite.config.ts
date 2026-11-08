import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Serves the same /api/rafiq handler used in production (api/rafiq.ts) while
 * running locally with `npm run dev` or `npm start`. The API key is read from
 * .env.local on YOUR computer and never reaches the browser bundle.
 */
function rafiqApi(env: Record<string, string>): Plugin {
  const middleware = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url?.startsWith('/api/rafiq')) return next();
    try {
      const { handleRafiqRequest } = await import('./server/rafiqHandler');
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const request = new Request(`http://localhost${req.url}`, {
        method: req.method,
        headers: req.headers as Record<string, string>,
        body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
      });
      const response = await handleRafiqRequest(request, env);
      res.statusCode = response.status;
      response.headers.forEach((value, key) => res.setHeader(key, value));
      res.end(await response.text());
    } catch (err) {
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: 'Local API error: ' + (err as Error).message }));
    }
  };
  return {
    name: 'rafiq-local-api',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

export default defineConfig(({ mode }) => {
  // Load ALL variables (no VITE_ prefix) for the server-side middleware only.
  // Nothing here is injected into the client bundle.
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env } as Record<string, string>;
  return {
    plugins: [
      react(),
      rafiqApi(env),
      VitePWA({
        registerType: 'prompt',
        includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
        manifest: {
          name: 'Rafiq — Money Accountability Partner',
          short_name: 'Rafiq',
          description: 'Your personal money accountability partner. Works offline.',
          theme_color: '#0f3d3e',
          background_color: '#f6f5f1',
          display: 'standalone',
          orientation: 'portrait',
          start_url: '/',
          scope: '/',
          icons: [
            { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//],
          cleanupOutdatedCaches: true,
        },
      }),
    ],
    build: {
      chunkSizeWarningLimit: 900,
    },
  };
});
