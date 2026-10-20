// Gera os ícones PNG do PWA a partir de public/favicon.svg usando o Chromium do Playwright.
// Uso: npm run icons   (requer o pacote "playwright" disponível globalmente ou no projeto)
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = await import('playwright'));
}

const svg = await readFile('public/favicon.svg', 'utf8');
const targets = [
  { file: 'public/pwa-192x192.png', size: 192, pad: 0 },
  { file: 'public/pwa-512x512.png', size: 512, pad: 0 },
  { file: 'public/apple-touch-icon.png', size: 180, pad: 0, bg: '#009C3B' }, // iOS não aceita transparência
  // Ícone "maskable": área segura de 80%, fundo verde sólido (o sistema recorta o formato).
  { file: 'public/maskable-512x512.png', size: 512, pad: 0.12, bg: '#009C3B' },
];

const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {},
);
const page = await browser.newPage();
for (const t of targets) {
  await page.setViewportSize({ width: t.size, height: t.size });
  const inner = Math.round(t.size * (1 - 2 * t.pad));
  await page.setContent(
    `<html><body style="margin:0;background:${t.bg ?? 'transparent'};display:grid;place-items:center;width:${t.size}px;height:${t.size}px">` +
      `<div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div></body></html>`,
  );
  await page.screenshot({ path: t.file, omitBackground: !t.bg });
  console.log('gerado', t.file);
}
await browser.close();
