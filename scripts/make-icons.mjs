// Renders public/favicon.svg into the PNG icons the PWA manifest and iOS need.
import { createRequire } from 'node:module';
// One-time developer tool (icons are committed). Uses a globally installed Playwright.
const { chromium } = createRequire(import.meta.url)('playwright');
import { readFileSync } from 'node:fs';
const svg = readFileSync(new URL('../public/favicon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size, pad] of [['pwa-192.png', 192, 0], ['pwa-512.png', 512, 0], ['apple-touch-icon.png', 180, 0]]) {
  await page.setViewportSize({ width: size, height: size });
  // iOS rounds corners itself, so the apple icon uses a full-bleed square.
  const s = name.startsWith('apple') ? svg.replace('rx="112"', 'rx="0"') : svg.replace('rx="112"', 'rx="0"');
  await page.setContent(`<html><body style="margin:0;padding:${pad}px">${s.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: new URL(`../public/${name}`, import.meta.url).pathname, omitBackground: false });
}
await browser.close();
console.log('icons written');
