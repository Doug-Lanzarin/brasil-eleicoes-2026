/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// Arquivos de zonas eleitorais publicados pelo workflow `zonas.yml` na branch `dados-zonas`.
// Em produção, a Vercel faz o mesmo encaminhamento (vercel.json → rewrites).
const zonasUpstream =
  process.env.ZONAS_UPSTREAM ??
  'https://raw.githubusercontent.com/Doug-Lanzarin/brasil-eleicoes-2026/dados-zonas/zonas';
const zonasProxy = {
  '/zonas': {
    target: new URL(zonasUpstream).origin,
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/zonas/, new URL(zonasUpstream).pathname),
  },
};

export default defineConfig({
  server: { proxy: zonasProxy },
  preview: { proxy: zonasProxy },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'favicon-*.png', 'apple-touch-icon*.png'],
      manifest: {
        name: 'Brasil Eleitoral — Apuração em tempo real',
        short_name: 'Brasil Eleitoral',
        description:
          'Acompanhe a apuração da eleição presidencial de 2026 com dados oficiais do TSE.',
        lang: 'pt-BR',
        theme_color: '#0b1220',
        background_color: '#0b1220',
        display: 'standalone',
        orientation: 'any',
        id: '/',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'apple-touch-icon.png', sizes: '180x180', type: 'image/png', purpose: 'any' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: 'maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Os arquivos estáticos (incluindo o chunk das geometrias do IBGE) são pré-cacheados
        // com hash de revisão: uma nova versão do mapa invalida o cache automaticamente.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/zonas\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Malhas municipais do IBGE (public/geo/mun/<uf>.json): baixadas só ao abrir
            // um estado e reaproveitadas depois, inclusive offline.
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.includes('/geo/mun/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'geo-municipios',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // Arquivos de configuração do TSE (lista de municípios, eleições):
            // mudam raramente, podem ser revalidados em segundo plano.
            urlPattern: ({ url }) =>
              url.hostname === 'resultados.tse.jus.br' && url.pathname.includes('/config/'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'tse-config',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // Zonas eleitorais: sempre da rede (o app mostra a idade do cálculo).
            urlPattern: ({ url }) => url.pathname.startsWith('/zonas/'),
            handler: 'NetworkOnly',
          },
          {
            // Resultados: nunca servidos pelo service worker. O app guarda o último
            // resultado válido com carimbo de horário e o exibe como "desatualizado".
            urlPattern: ({ url }) =>
              url.hostname === 'resultados.tse.jus.br' && url.pathname.includes('/dados/'),
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/tests/setup.ts'],
    css: false,
  },
});
