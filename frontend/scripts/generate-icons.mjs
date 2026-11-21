// Renders the cinnabar 仙 seal (same font/colors as the site logo) to PNGs and builds favicon.ico.
// Usage: npm run icons   (= node frontend/scripts/generate-icons.mjs frontend frontend/src/app, from the repository root)
// Writes frontend/src/app/favicon.ico (16/32/48), frontend/src/app/icon.png (512) and frontend/src/app/apple-icon.png (180).
// Small sizes (16/32) use a simplified seal (no inner ring, bigger glyph) so they stay legible in a browser tab.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const [, , projectRoot, outDir] = process.argv;
mkdirSync(outDir, { recursive: true });
// Embedded as a data URL: pages created with setContent() cannot load file:// fonts.
const fontUrl =
  "data:font/woff2;base64," + readFileSync(path.join(projectRoot, "src/fonts/ma-shan-zheng-decor.woff2")).toString("base64");

const CINNABAR = "#a8281f";
const IVORY = "#f3ead8";

function html(size, detailed) {
  const radius = Math.round(size * (detailed ? 0.12 : 0.16));
  const ring = detailed ? `box-shadow: inset 0 0 0 ${size * 0.045}px ${CINNABAR}, inset 0 0 0 ${size * 0.075}px ${IVORY};` : "";
  const glyph = detailed ? 0.68 : 0.86;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @font-face { font-family: Seal; src: url("${fontUrl}") format("woff2"); }
    html, body { margin: 0; background: transparent; }
    #seal { width: ${size}px; height: ${size}px; border-radius: ${radius}px; background: ${CINNABAR}; ${ring}
      display: grid; place-items: center; font-family: Seal; color: ${IVORY};
      font-size: ${Math.round(size * glyph)}px; line-height: 1; }
    #seal span { transform: translateY(${detailed ? "2%" : "3%"}); }
  </style></head><body><div id="seal"><span>仙</span></div></body></html>`;
}

const targets = [
  { name: "ico-16.png", size: 16, detailed: false },
  { name: "ico-32.png", size: 32, detailed: false },
  { name: "ico-48.png", size: 48, detailed: true },
  { name: "icon.png", size: 512, detailed: true },
  { name: "apple-icon.png", size: 180, detailed: true },
];

const browser = await chromium.launch();
const buffers = {};
for (const t of targets) {
  // Render at 8x then let the browser downscale smoothly for small sizes (crisper than rendering at 16px).
  const scale = t.size <= 48 ? 8 : 1;
  const page = await browser.newPage({ viewport: { width: t.size * scale, height: t.size * scale }, deviceScaleFactor: 1 });
  await page.setContent(html(t.size * scale, t.detailed));
  await page.evaluate(async () => { await document.fonts.load("10px Seal", "仙"); await document.fonts.ready; if (!document.fonts.check("10px Seal", "仙")) throw new Error("Seal font not loaded"); });
  let png = await page.locator("#seal").screenshot({ omitBackground: true });
  if (scale > 1) {
    const b64 = png.toString("base64");
    const small = await browser.newPage({ viewport: { width: t.size, height: t.size } });
    await small.setContent(`<html><body style="margin:0;background:transparent"><img id="i" src="data:image/png;base64,${b64}" style="width:${t.size}px;height:${t.size}px;display:block"></body></html>`);
    png = await small.locator("#i").screenshot({ omitBackground: true });
    await small.close();
  }
  buffers[t.name] = png;
  if (!t.name.startsWith("ico-")) writeFileSync(path.join(outDir, t.name), png); // ico-* only go into favicon.ico
  await page.close();
  console.log("rendered", t.name, png.length, "bytes");
}
await browser.close();

// favicon.ico containing PNG-encoded 16, 32 and 48 px images.
const icoImgs = [16, 32, 48].map((s) => ({ s, data: buffers[`ico-${s}.png`] }));
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(icoImgs.length, 4);
let offset = 6 + 16 * icoImgs.length;
const entries = icoImgs.map(({ s, data }) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(s, 0); // width
  e.writeUInt8(s, 1); // height
  e.writeUInt8(0, 2); // palette
  e.writeUInt8(0, 3); // reserved
  e.writeUInt16LE(1, 4); // color planes
  e.writeUInt16LE(32, 6); // bits per pixel
  e.writeUInt32LE(data.length, 8);
  e.writeUInt32LE(offset, 12);
  offset += data.length;
  return e;
});
const ico = Buffer.concat([header, ...entries, ...icoImgs.map((i) => i.data)]);
writeFileSync(path.join(outDir, "favicon.ico"), ico);
console.log("built favicon.ico", ico.length, "bytes");
