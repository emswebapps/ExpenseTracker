// Generates the home-screen icons for the standalone "Reset" app.
//
// Run with: node scripts/make-reset-icons.mjs
// Outputs are committed to public/, so CI never has to run this.
//
// The glyph is the same lucide "anchor" used for the tab inside the main app —
// steady rather than alarming, and recognisably the same tool. The ground is
// deliberately calm and unlike the finance app's icon, so the wrong one doesn't
// get tapped at the worst possible moment.

import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
mkdirSync(OUT, { recursive: true });

const GROUND_TOP = '#1e1b4b';
const GROUND_BOTTOM = '#0f172a';
const GLYPH = '#c4b5fd';

/**
 * @param size    pixel size of the square
 * @param inset   fraction of the canvas left as padding around the glyph.
 *                Maskable icons get a bigger inset so the launcher can crop to
 *                a circle without clipping the anchor.
 * @param radius  corner radius; maskable icons are full-bleed squares.
 */
function svg(size, { inset = 0.24, radius = size * 0.22 } = {}) {
  const box = size * (1 - inset * 2);
  const scale = box / 24;
  const off = size * inset;
  // stroke-width is in glyph units — the scale transform does the rest, so this
  // is simply lucide's own weight, nudged up to stay solid at 192px.
  const stroke = 2.2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${GROUND_TOP}"/>
      <stop offset="100%" stop-color="${GROUND_BOTTOM}"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="url(#g)"/>
  <g transform="translate(${off} ${off}) scale(${scale})"
     fill="none" stroke="${GLYPH}" stroke-width="${stroke}"
     stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 22V8"/>
    <path d="M5 12H2a10 10 0 0 0 20 0h-3"/>
    <circle cx="12" cy="5" r="3"/>
  </g>
</svg>`;
}

const targets = [
  { file: 'reset-icon-192.png', size: 192, opts: {} },
  { file: 'reset-icon-512.png', size: 512, opts: {} },
  // Full-bleed square with the glyph pulled well inside the safe zone.
  { file: 'reset-icon-512-maskable.png', size: 512, opts: { inset: 0.3, radius: 0 } },
  // iOS applies its own rounding and does not honour transparency.
  { file: 'reset-apple-touch.png', size: 180, opts: { radius: 0 } },
];

for (const { file, size, opts } of targets) {
  await sharp(Buffer.from(svg(size, { radius: size * 0.22, ...opts })))
    .png({ compressionLevel: 9 })
    .toFile(join(OUT, file));
  console.log(`wrote public/${file}`);
}
