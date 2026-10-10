// Renders the PNG app icons from public/icons/icon.svg. Run: node scripts/icons.mjs (needs Playwright).
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const svg = readFileSync(new URL("../public/icons/icon.svg", import.meta.url), "utf8");
const maskable = svg.replace('rx="112"', 'rx="0"').replace("<path", '<g transform="translate(51 51) scale(.8)"><path').replace("</svg>", "</g></svg>").replace('<circle cx="256" cy="222" r="44" fill="#F2F4F1"/>\n</g>', '<circle cx="256" cy="222" r="44" fill="#F2F4F1"/></g>');
const out = new URL("../public/icons/", import.meta.url).pathname;
const jobs = [
  ["icon-192.png", 192, svg, true],
  ["icon-512.png", 512, svg, true],
  ["icon-maskable-512.png", 512, maskable, false],
  ["apple-touch-icon.png", 180, maskable, false],
];
const browser = await chromium.launch();
for (const [name, size, src, transparent] of jobs) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<html><body style="margin:0;background:transparent">${src.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: out + name, omitBackground: transparent });
  await page.close();
}
await browser.close();
