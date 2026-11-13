import "server-only";
import path from "path";
import { Resvg } from "@resvg/resvg-js";
import type { StyleId } from "./styles";

// Typographic poster engine. The NEAR AI image is the artwork; the layout and the type are set here,
// as real SVG text in open-licensed fonts (assets/fonts, SIL OFL), so the poster stays crisp at any size.
export const W = 1200, H = 1600;
const FONT_DIR = path.join(process.cwd(), "assets", "fonts");
const FONTS = ["Anton-Regular.ttf", "ArchivoBlack-Regular.ttf", "DMSerifDisplay-Regular.ttf", "SpaceGrotesk.ttf", "SpaceMono-Regular.ttf"].map((f) => path.join(FONT_DIR, f));

export interface PosterText { title: string; subtitle: string; details: string; no: string }

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

/** Greedy word wrap by an average glyph width (em) for the font. */
function wrap(text: string, size: number, maxW: number, em: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = []; let cur = "";
  for (const w of words) {
    const t = cur ? cur + " " + w : w;
    if (t.length * size * em > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { const keep = lines.slice(0, maxLines); keep[maxLines - 1] = keep[maxLines - 1].replace(/\s*\S*$/, "") + "…"; return keep; }
  return lines;
}
/** Largest size (down to min) at which the text fits in maxLines. */
function fit(text: string, maxW: number, em: number, maxLines: number, max: number, min: number) {
  for (let size = max; size >= min; size -= 4) {
    const words = text.split(/\s+/);
    if (words.some((w) => w.length * size * em > maxW)) continue;
    const l = wrap(text, size, maxW, em, 99);
    if (l.length <= maxLines) return { size, lines: l };
  }
  return { size: min, lines: wrap(text, min, maxW, em, maxLines) };
}
const tspans = (lines: string[], x: number, lh: number) => lines.map((l, i) => `<tspan x="${x}" dy="${i ? lh : 0}">${esc(l)}</tspan>`).join("");

export function composePoster(style: StyleId, img: { b64: string; mime: string }, t: PosterText): string {
  const href = `data:${img.mime};base64,${img.b64}`;
  const head = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
  if (style === "paper-fox") {
    const T = fit(t.title, 1040, 0.5, 2, 116, 64);
    const lh = T.size * 0.98;
    const ty = 1030 + T.size * 0.85;
    const subY = ty + lh * (T.lines.length - 1) + 58;
    const sub = wrap(t.subtitle, 36, 1040, 0.52, Math.max(1, Math.min(2, Math.floor((1470 - subY) / 46) + 1)));
    return `${head}
<defs><clipPath id="win"><rect x="80" y="80" width="1040" height="900" rx="36"/></clipPath>
<filter id="sh" x="-5%" y="-5%" width="110%" height="115%"><feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#5a3a1a" flood-opacity=".28"/></filter></defs>
<rect width="${W}" height="${H}" fill="#F4E9D8"/>
<circle cx="1080" cy="1260" r="170" fill="#EBD9BF"/><circle cx="60" cy="1000" r="90" fill="#EFDFC8"/>
<g filter="url(#sh)"><rect x="80" y="80" width="1040" height="900" rx="36" fill="#E0662C"/></g>
<image x="80" y="80" width="1040" height="900" preserveAspectRatio="xMidYMid slice" clip-path="url(#win)" href="${href}"/>
<text x="80" y="${ty}" font-family="DM Serif Display" font-size="${T.size}" fill="#2F2118">${tspans(T.lines, 80, lh)}</text>
<text x="82" y="${subY}" font-family="Space Grotesk" font-weight="500" font-size="36" fill="#8A4A24">${tspans(sub, 82, 46)}</text>
<line x1="80" y1="1500" x2="1120" y2="1500" stroke="#2F2118" stroke-width="3"/>
<text x="80" y="1546" font-family="Space Grotesk" font-weight="600" font-size="28" fill="#2F2118">${esc(t.details.toUpperCase())}</text>
<text x="1120" y="1546" text-anchor="end" font-family="Space Mono" font-size="22" fill="#2F2118">ATELIER ONE · ${esc(t.no)}</text>
</svg>`;
  }
  if (style === "grid-ink") {
    const T = fit(t.title.toUpperCase(), 1080, 0.43, 3, 220, 96);
    const lh = T.size * 0.92;
    const titleH = lh * T.lines.length;
    const imgY = Math.round(90 + titleH + 40);
    const sub = wrap(t.subtitle, 28, 300, 0.6, 6);
    return `${head}
<defs><filter id="bw"><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncR type="linear" slope="1.25" intercept="-0.08"/><feFuncG type="linear" slope="1.25" intercept="-0.08"/><feFuncB type="linear" slope="1.25" intercept="-0.08"/></feComponentTransfer></filter>
<clipPath id="ph"><rect x="420" y="${imgY}" width="720" height="${1480 - imgY}"/></clipPath></defs>
<rect width="${W}" height="${H}" fill="#EEEAE1"/>
${Array.from({ length: 13 }, (_, i) => `<line x1="${60 + i * 90}" y1="0" x2="${60 + i * 90}" y2="${H}" stroke="#111" stroke-opacity=".05"/>`).join("")}
<text x="56" y="${70 + T.size * 0.88}" font-family="Anton" font-size="${T.size}" fill="#111">${tspans(T.lines, 56, lh)}</text>
<rect x="60" y="${imgY}" width="330" height="${1480 - imgY}" fill="#E8432E"/>
<image x="420" y="${imgY}" width="720" height="${1480 - imgY}" preserveAspectRatio="xMidYMid slice" clip-path="url(#ph)" filter="url(#bw)" href="${href}"/>
<text x="84" y="${imgY + 56}" font-family="Space Mono" font-size="28" fill="#111">${tspans(sub, 84, 38)}</text>
<text x="84" y="1440" font-family="Space Mono" font-size="22" fill="#111">${esc(t.no)}</text>
<rect x="60" y="1508" width="1080" height="4" fill="#111"/>
<text x="60" y="1556" font-family="Space Grotesk" font-weight="700" font-size="30" fill="#111">${esc(t.details.toUpperCase())}</text>
<text x="1140" y="1556" text-anchor="end" font-family="Space Grotesk" font-weight="700" font-size="24" fill="#E8432E">ATELIER ONE</text>
</svg>`;
  }
  // sina-neon: Sina Jalilian's neon style
  const T = fit(t.title.toUpperCase(), 1020, 0.76, 2, 116, 56);
  const lh = T.size * 1.02;
  const ty = 1150 + T.size * 0.82;
  const sub = wrap(t.subtitle, 30, 1020, 0.6, 2);
  return `${head}
<defs>
<filter id="glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="14"/></filter>
<filter id="tglow" x="-10%" y="-40%" width="120%" height="180%"><feGaussianBlur stdDeviation="9"/></filter>
<pattern id="scan" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="2" fill="#000" fill-opacity=".28"/></pattern>
<clipPath id="fr"><rect x="90" y="90" width="1020" height="1000" rx="8"/></clipPath>
<linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset=".55" stop-color="#07080B" stop-opacity="0"/><stop offset="1" stop-color="#07080B" stop-opacity=".85"/></linearGradient>
</defs>
<rect width="${W}" height="${H}" fill="#07080B"/>
<rect x="90" y="90" width="1020" height="1000" rx="8" fill="none" stroke="#FF3B5C" stroke-width="16" filter="url(#glow)" opacity=".9"/>
<image x="90" y="90" width="1020" height="1000" preserveAspectRatio="xMidYMid slice" clip-path="url(#fr)" href="${href}"/>
<rect x="90" y="90" width="1020" height="1000" fill="url(#scan)" clip-path="url(#fr)"/>
<rect x="90" y="90" width="1020" height="1000" fill="url(#fade)" clip-path="url(#fr)"/>
<rect x="90" y="90" width="1020" height="1000" rx="8" fill="none" stroke="#FF3B5C" stroke-width="3"/>
<rect x="104" y="104" width="992" height="972" rx="4" fill="none" stroke="#3DF2E0" stroke-opacity=".55" stroke-width="1.5"/>
<text x="90" y="${ty}" font-family="Archivo Black" font-size="${T.size}" fill="#FF3B5C" filter="url(#tglow)" opacity=".85">${tspans(T.lines, 90, lh)}</text>
<text x="90" y="${ty}" font-family="Archivo Black" font-size="${T.size}" fill="#FFE9EC">${tspans(T.lines, 90, lh)}</text>
<text x="92" y="${ty + lh * (T.lines.length - 1) + 62}" font-family="Space Mono" font-size="30" fill="#3DF2E0">${tspans(sub, 92, 40)}</text>
<rect x="0" y="0" width="${W}" height="${H}" fill="url(#scan)" opacity=".35"/>
<text x="90" y="1530" font-family="Space Mono" font-size="24" fill="#FFE9EC" fill-opacity=".8">${esc(t.details.toUpperCase())}</text>
<text x="1110" y="1530" text-anchor="end" font-family="Space Grotesk" font-weight="700" font-size="26" fill="#FF3B5C">— Sina Jalilian</text>
<text x="1110" y="1562" text-anchor="end" font-family="Space Mono" font-size="18" fill="#3DF2E0" fill-opacity=".8">NEON MARK · ATELIER ONE · ${esc(t.no)}</text>
</svg>`;
}

export function renderPng(svg: string, width: number): Buffer {
  const r = new Resvg(svg, { fitTo: { mode: "width", value: width }, font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: "Space Grotesk" } });
  return Buffer.from(r.render().asPng());
}
