import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // NFR-11: offline after the first load. Everything the game needs is precached, art included; `config.json` is
    // written per deploy after the build (CD-03), so it is fetched network-first instead of precached.
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['icons/*.png'],
      manifest: {
        name: 'Fast Lane 2026',
        short_name: 'Fast Lane',
        description: 'Keep up with the Joneses. The rent is already due.',
        lang: 'en',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#fff6e9',
        theme_color: '#ff5a4e',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,webp,png,json}'],
        globIgnores: ['config.json'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname === '/config.json',
            handler: 'NetworkFirst',
            options: { cacheName: 'runtime-config', networkTimeoutSeconds: 3 },
          },
        ],
      },
    }),
  ],
  server: { port: 5190, strictPort: true },
  // Source maps stay off until Sentry upload lands (CD-08): they must never be served publicly.
  build: { target: 'es2022', sourcemap: false },
});
