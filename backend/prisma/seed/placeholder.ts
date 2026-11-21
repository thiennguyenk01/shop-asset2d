/**
 * Deterministic pixel-style placeholder images (SVG) for demo products.
 * They are clearly temporary: every image carries a "DEMO" badge and a diagonal watermark
 * (CLAUDE.md §11 — never pass illustrations off as real products).
 * No scripts, no external references — safe static SVG.
 */
import type { AssetKind } from "./data/catalog";

type Palette = { bg1: string; bg2: string; hill: string; hill2: string; a: string; b: string; c: string };

const PALETTES: Record<AssetKind, Palette> = {
  sprite: { bg1: "#2a1d12", bg2: "#0f0b08", hill: "#3b2a1a", hill2: "#221810", a: "#ddb94a", b: "#c23a2c", c: "#f3ead8" },
  map: { bg1: "#173a33", bg2: "#0b1412", hill: "#1f6b5c", hill2: "#124038", a: "#4fb39b", b: "#ddb94a", c: "#f3ead8" },
  vfx: { bg1: "#2b1740", bg2: "#0d0814", hill: "#3d2160", hill2: "#24123a", a: "#c79bff", b: "#ecd48a", c: "#ffffff" },
  ui: { bg1: "#33270f", bg2: "#100c05", hill: "#574026", hill2: "#3b2a1a", a: "#ecd48a", b: "#c9a227", c: "#f3ead8" },
  item: { bg1: "#3a1612", bg2: "#120807", hill: "#5a1f17", hill2: "#3a120d", a: "#c23a2c", b: "#ecd48a", c: "#4fb39b" },
  audio: { bg1: "#12263a", bg2: "#070d14", hill: "#1d3d5c", hill2: "#12263a", a: "#7fb7e6", b: "#ecd48a", c: "#f3ead8" },
  font: { bg1: "#2a2a24", bg2: "#0e0e0b", hill: "#3d3d33", hill2: "#26261f", a: "#f3ead8", b: "#c23a2c", c: "#ddb94a" },
  tech: { bg1: "#1a2230", bg2: "#090c11", hill: "#2a3548", hill2: "#1a2230", a: "#7fb7e6", b: "#4fb39b", c: "#f3ead8" },
};

/** Small seeded PRNG (mulberry32) so the same slug always produces the same image. */
function rng(seedText: string) {
  let h = 1779033703 ^ seedText.length;
  for (let i = 0; i < seedText.length; i++) h = Math.imul(h ^ seedText.charCodeAt(i), 3432918353);
  let a = (h << 13) | (h >>> 19);
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const PLACEHOLDER_SIZE = { width: 800, height: 600 } as const;

export function placeholderSvg(opts: { seed: string; kind: AssetKind; variant: number }): string {
  const { width: W, height: H } = PLACEHOLDER_SIZE;
  const p = PALETTES[opts.kind];
  const rand = rng(`${opts.seed}#${opts.variant}`);
  const px = 16; // "pixel" size of the scene
  const rects: string[] = [];

  // Two layers of blocky mountains.
  for (const [layer, color, base, amp] of [
    [0, p.hill, H * 0.55, H * 0.22],
    [1, p.hill2, H * 0.72, H * 0.14],
  ] as const) {
    let y = base - rand() * amp;
    for (let x = 0; x < W; x += px) {
      y += (rand() - 0.5) * px * 2.2;
      y = Math.max(base - amp, Math.min(base + amp * 0.3, y));
      const top = Math.round(y / px) * px;
      rects.push(`<rect x="${x}" y="${top}" width="${px}" height="${H - top}" fill="${color}"${layer === 0 ? ' opacity="0.9"' : ""}/>`);
    }
  }

  // A few floating "qi" pixels.
  for (let i = 0; i < 14; i++) {
    const x = Math.floor((rand() * W) / px) * px;
    const y = Math.floor((rand() * H * 0.5) / px) * px;
    rects.push(`<rect x="${x}" y="${y}" width="${px / 2}" height="${px / 2}" fill="${p.c}" opacity="${(0.25 + rand() * 0.5).toFixed(2)}"/>`);
  }

  // Centered mirrored 10×10 sprite (identicon-style "creature/item").
  const cells = 10;
  const cell = opts.variant === 0 ? 26 : 20;
  const sx = W / 2 - (cells * cell) / 2 + (opts.variant === 2 ? -150 : opts.variant === 3 ? 150 : 0);
  const sy = H * 0.42 - (cells * cell) / 2;
  const colors = [p.a, p.b, p.c];
  for (let r = 0; r < cells; r++) {
    for (let c = 0; c < cells / 2; c++) {
      // Denser towards the centre for a more "object-like" silhouette.
      const centre = 1 - Math.abs(r - cells / 2) / (cells / 2);
      if (rand() < 0.28 + centre * 0.42 - c * 0.02) {
        const fill = colors[Math.floor(rand() * (rand() < 0.7 ? 1.6 : 3))];
        for (const cc of [c, cells - 1 - c]) {
          rects.push(`<rect x="${sx + cc * cell}" y="${sy + r * cell}" width="${cell}" height="${cell}" fill="${fill}"/>`);
        }
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" shape-rendering="crispEdges">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.bg1}"/><stop offset="1" stop-color="${p.bg2}"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#g)"/>
${rects.join("\n")}
<rect x="12" y="12" width="${W - 24}" height="${H - 24}" fill="none" stroke="${p.a}" stroke-opacity="0.45" stroke-width="2"/>
<g transform="rotate(-18 ${W / 2} ${H / 2})" opacity="0.13"><text x="${W / 2}" y="${H / 2 + 60}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="190" font-weight="900" fill="#ffffff" letter-spacing="18">DEMO</text></g>
<rect x="28" y="28" width="128" height="40" rx="4" fill="#0b0908" fill-opacity="0.85" stroke="#a89a80" stroke-dasharray="6 4"/>
<text x="92" y="55" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="700" fill="#d9ccb2" letter-spacing="4">DEMO</text>
</svg>`;
}
