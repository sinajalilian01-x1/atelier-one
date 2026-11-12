// Deterministic generative painter used by Atelier One.
// Produces a bold, naive, outlined SVG painting. Every element carries an order index (--i)
// so the page can "paint" it stroke by stroke; the pinned SVG itself is static.

export type Motif = "hills" | "still-life" | "sea" | "garden" | "city" | "bench";
export const MOTIFS: Motif[] = ["hills", "still-life", "sea", "garden", "city", "bench"];

export interface Palette { name: string; sky: string; sun: string; ground: string; ground2: string; accent: string; paper: string; ink: string }
export const PALETTES: Palette[] = [
  { name: "Lime Sunday", sky: "#7FD3F7", sun: "#FF5A36", ground: "#C8F169", ground2: "#9BD64B", accent: "#FFD23F", paper: "#FFF8EC", ink: "#0E0E0E" },
  { name: "Coral Bench", sky: "#FFD3C2", sun: "#FF7A59", ground: "#2E86AB", ground2: "#1F6F8F", accent: "#FFE15A", paper: "#FFF4E6", ink: "#0E0E0E" },
  { name: "Mint Hills", sky: "#FFF4E6", sun: "#FFB443", ground: "#3CCB9A", ground2: "#2AA37E", accent: "#FF8A5C", paper: "#FFFBF4", ink: "#23423B" },
  { name: "Lemon Sea", sky: "#BFE9FB", sun: "#FFE15A", ground: "#2F80ED", ground2: "#1C5FC0", accent: "#FF5A36", paper: "#FFF8EC", ink: "#0E0E0E" },
  { name: "Peach Hour", sky: "#FFE3CF", sun: "#FF6F61", ground: "#9ADBC5", ground2: "#5FBFA0", accent: "#FFB892", paper: "#FFF1E0", ink: "#1F2A2E" },
  { name: "Tomato Garden", sky: "#FBF5EA", sun: "#E63B2E", ground: "#2BAE66", ground2: "#1E8A50", accent: "#F9D949", paper: "#FBF5EA", ink: "#111111" },
  { name: "Pool Noon", sky: "#9FE7F5", sun: "#FFC145", ground: "#4ECDC4", ground2: "#2BA9A0", accent: "#FF6B6B", paper: "#F7FFF7", ink: "#102A2A" },
  { name: "Sand Dune", sky: "#FCEFD4", sun: "#F25C2A", ground: "#E9B872", ground2: "#C98F3E", accent: "#2E86AB", paper: "#FFF8EC", ink: "#1B1B1B" },
];

export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function rng(seed: number) {
  let a = seed || 1;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export interface ArtSpec { motif: Motif; palette: Palette; seed: number; title: string }

export function renderSvg(spec: ArtSpec): string {
  const r = rng(spec.seed);
  const p = spec.palette;
  const W = 600, H = 600;
  const els: string[] = [];
  let i = 0;
  const fill = (d: string, color: string, extra = "") => els.push(`<path class="f" style="--i:${i++}" d="${d}" fill="${color}" ${extra}/>`);
  const shape = (svg: string) => els.push(svg.replace("<", `<`).replace(/^<(\w+)/, `<$1 class="f" style="--i:${i++}"`));
  const line = (d: string, w = 6, color = p.ink) => els.push(`<path class="l" style="--i:${i++}" pathLength="1" d="${d}" stroke="${color}" stroke-width="${w}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`);
  const R = (a: number, b: number) => a + r() * (b - a);
  const horizon = Math.round(R(300, 380));

  // background
  shape(`<rect width="${W}" height="${H}" fill="${p.paper}"/>`);
  if (spec.motif !== "still-life") fill(`M0 0H${W}V${horizon}Q${R(380, 460)} ${horizon + R(20, 60)} ${R(220, 320)} ${horizon - R(0, 40)}T0 ${horizon + R(-10, 20)}Z`, p.sky);

  const sunX = R(140, 460), sunY = R(90, 190), sunR = R(46, 78);
  const sun = () => { shape(`<circle cx="${sunX.toFixed(0)}" cy="${sunY.toFixed(0)}" r="${sunR.toFixed(0)}" fill="${p.sun}"/>`); if (r() > 0.5) line(`M${sunX - sunR - 18} ${sunY}A${sunR + 18} ${sunR + 18} 0 0 1 ${sunX + sunR + 18} ${sunY}`, 4); };

  switch (spec.motif) {
    case "hills": {
      sun();
      fill(`M0 ${horizon}Q${R(100, 200)} ${horizon - R(40, 90)} ${R(260, 340)} ${horizon}T${W} ${horizon - R(0, 40)}V${H}H0Z`, p.ground);
      fill(`M0 ${horizon + 90}Q${R(160, 260)} ${horizon + R(20, 60)} ${R(360, 440)} ${horizon + 100}T${W} ${horizon + 80}V${H}H0Z`, p.ground2);
      line(`M0 ${horizon + 40}Q${R(200, 300)} ${horizon + R(-10, 30)} ${W} ${horizon + 60}`, 4);
      const n = 1 + Math.floor(r() * 3);
      for (let k = 0; k < n; k++) { const x = R(80, 480), y = horizon + R(110, 190), w = R(50, 80); line(`M${x} ${y}Q${x + w / 2} ${y - w * 1.6} ${x + w} ${y}`, 7); }
      break;
    }
    case "sea": {
      sun();
      fill(`M0 ${horizon}H${W}V${H}H0Z`, p.ground);
      for (let k = 0; k < 4; k++) { const y = horizon + 40 + k * 55; line(`M${R(-20, 40)} ${y}Q${R(80, 140)} ${y - 18} ${R(180, 240)} ${y}T${R(380, 420)} ${y}T${W + 20} ${y}`, 4, k % 2 ? p.paper : p.ink); }
      const bx = R(150, 380), by = horizon + R(30, 70);
      fill(`M${bx} ${by}H${bx + 120}L${bx + 95} ${by + 34}H${bx + 22}Z`, p.accent, `stroke="${p.ink}" stroke-width="5" stroke-linejoin="round"`);
      line(`M${bx + 60} ${by}V${by - 110}`, 6);
      fill(`M${bx + 64} ${by - 104}L${bx + 64} ${by - 14}L${bx + 130} ${by - 14}Z`, p.paper, `stroke="${p.ink}" stroke-width="5" stroke-linejoin="round"`);
      break;
    }
    case "garden": {
      fill(`M0 ${horizon}Q${W / 2} ${horizon - 40} ${W} ${horizon}V${H}H0Z`, p.ground);
      sun();
      const n = 4 + Math.floor(r() * 4);
      for (let k = 0; k < n; k++) {
        const x = 50 + (k + 0.5) * (500 / n) + R(-15, 15), top = R(170, 300), base = H - R(20, 80);
        line(`M${x} ${base}Q${x + R(-30, 30)} ${(base + top) / 2} ${x} ${top}`, 6);
        const c = [p.sun, p.accent, p.paper, p.sky][k % 4];
        shape(`<circle cx="${x.toFixed(0)}" cy="${top.toFixed(0)}" r="${R(22, 36).toFixed(0)}" fill="${c}" stroke="${p.ink}" stroke-width="5"/>`);
      }
      break;
    }
    case "city": {
      shape(`<circle cx="${sunX.toFixed(0)}" cy="${(sunY - 20).toFixed(0)}" r="${(sunR * 0.8).toFixed(0)}" fill="${p.accent}"/>`);
      let x = 20;
      while (x < W - 40) {
        const w = R(70, 120), h = R(140, 300), c = [p.sun, p.ground, p.ground2, p.paper][Math.floor(r() * 4)];
        shape(`<rect x="${x.toFixed(0)}" y="${(H - 60 - h).toFixed(0)}" width="${w.toFixed(0)}" height="${(h + 60).toFixed(0)}" fill="${c}" stroke="${p.ink}" stroke-width="5"/>`);
        for (let wy = H - 40 - h; wy < H - 90; wy += 46) shape(`<rect x="${(x + w / 2 - 12).toFixed(0)}" y="${wy.toFixed(0)}" width="24" height="24" rx="4" fill="${p.paper}" stroke="${p.ink}" stroke-width="3"/>`);
        x += w + R(4, 16);
      }
      line(`M0 ${H - 60}H${W}`, 6);
      break;
    }
    case "bench": {
      sun();
      fill(`M0 ${horizon}H${W}V${H}H0Z`, p.ground);
      const tx = R(60, 160);
      line(`M${tx} ${H - 80}V${horizon - 60}`, 10);
      shape(`<circle cx="${tx.toFixed(0)}" cy="${(horizon - 110).toFixed(0)}" r="${R(70, 95).toFixed(0)}" fill="${p.ground2}" stroke="${p.ink}" stroke-width="5"/>`);
      const bx = R(250, 330), by = horizon + R(70, 120);
      shape(`<rect x="${bx.toFixed(0)}" y="${(by - 60).toFixed(0)}" width="200" height="22" rx="6" fill="${p.sun}" stroke="${p.ink}" stroke-width="5"/>`);
      shape(`<rect x="${bx.toFixed(0)}" y="${(by - 26).toFixed(0)}" width="200" height="22" rx="6" fill="${p.sun}" stroke="${p.ink}" stroke-width="5"/>`);
      line(`M${bx + 20} ${by - 4}V${by + 50}M${bx + 180} ${by - 4}V${by + 50}`, 7);
      break;
    }
    case "still-life": {
      shape(`<rect x="0" y="0" width="${W}" height="${horizon}" fill="${p.sky}"/>`);
      shape(`<rect x="${R(330, 400).toFixed(0)}" y="60" width="150" height="180" rx="10" fill="${p.paper}" stroke="${p.ink}" stroke-width="5"/>`);
      fill(`M0 ${horizon}H${W}V${H}H0Z`, p.ground);
      line(`M0 ${horizon}H${W}`, 6);
      const vx = R(140, 220);
      fill(`M${vx - 40} ${horizon + 20}Q${vx - 70} ${horizon - 80} ${vx - 20} ${horizon - 120}H${vx + 20}Q${vx + 70} ${horizon - 80} ${vx + 40} ${horizon + 20}Z`, p.sun, `stroke="${p.ink}" stroke-width="5"`);
      for (let k = 0; k < 3; k++) line(`M${vx} ${horizon - 120}Q${vx + R(-60, 60)} ${horizon - 200} ${vx + R(-80, 80)} ${horizon - R(220, 260)}`, 5, p.ground2);
      for (let k = 0; k < 3; k++) shape(`<circle cx="${(330 + k * 60 + R(-10, 10)).toFixed(0)}" cy="${(horizon + 50 + R(-10, 10)).toFixed(0)}" r="${R(24, 34).toFixed(0)}" fill="${[p.accent, p.sun, p.ground2][k]}" stroke="${p.ink}" stroke-width="5"/>`);
      break;
    }
  }
  // the artist's signature brushstroke
  const sy = H - R(30, 50);
  line(`M${R(30, 60)} ${sy}H${R(200, 300)}`, 8, p.sun === p.paper ? p.accent : p.sun);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><title>${esc(spec.title)} · Atelier One</title>${els.join("")}</svg>`;
}

function esc(s: string) { return s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!); }

const ADJ = ["Lime", "Coral", "Sunday", "Lemon", "Quiet", "Loud", "Tiny", "Pear", "Tomato", "Mint", "Sunny", "Late", "Soft", "Brave", "Peach"];
const NOUN: Record<Motif, string[]> = {
  hills: ["Hills", "Walk", "Picnic", "Sunday", "Slope"],
  "still-life": ["Vase", "Table", "Fruit Bowl", "Kitchen", "Window"],
  sea: ["Harbour", "Sail", "Tide", "Swim", "Noon Sea"],
  garden: ["Garden", "Bloom", "Stems", "Seedlings", "Allotment"],
  city: ["Rooftops", "Block", "Corner", "Night Shift", "Avenue"],
  bench: ["Bench", "Park", "Shade", "Bench Talk", "Lunch Break"],
};
const MOOD: Record<Motif, string> = {
  hills: "two figures, one hill", "still-life": "a vase that wants attention", sea: "one small boat, big sun",
  garden: "stems in a row, heads up", city: "windows awake, sky calm", bench: "a bench for two, one tree",
};

export function localConcept(seedStr: string, floorNear: number) {
  const r = rng(hashSeed(seedStr));
  const motif = MOTIFS[Math.floor(r() * MOTIFS.length)];
  const palette = PALETTES[Math.floor(r() * PALETTES.length)];
  const title = `${ADJ[Math.floor(r() * ADJ.length)]} ${NOUN[motif][Math.floor(r() * 5)]}`;
  const mult = 1 + Math.round(r() * 8) * 0.05; // 1.00 .. 1.40
  const price = Math.max(floorNear, Math.ceil(floorNear * mult * 1000) / 1000);
  const thinking = `${palette.name} palette today: ${MOOD[motif]}. Floor is ${floorNear} — I'll list at ${price} NEAR.`;
  return { motif, palette, title, price, thinking };
}
