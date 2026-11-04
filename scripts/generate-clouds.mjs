// Renders the cloud pictures the memories board floats each day on (public/clouds/).
// Each cloud is a heap of spheres (a wide flat base, puffs on top, smaller puffs on those),
// blended into one smooth height field, lit from the upper left with self-shadowing and a
// greyer underside, then given fuzzy, ragged edges. Deterministic per seed.
//
//   node scripts/generate-clouds.mjs            (needs Chromium: CHROMIUM=/path/to/chromium)
//
// It runs the drawing in a headless browser for its canvas and WebP encoder.
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");
const OUT = new URL("../public/clouds/", import.meta.url).pathname;
const seeds = [11, 23, 37, 58];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/usr/bin/chromium", args: ["--no-sandbox"] });
const page = await browser.newPage();
const gen = (seed) => {
  const W = 960, H = 720;
  let a = seed;
  const rnd = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const P = 256, perm = new Uint8Array(P * 2), val = new Float32Array(P);
  for (let i = 0; i < P; i++) { perm[i] = i; val[i] = rnd(); }
  for (let i = P - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < P; i++) perm[i + P] = perm[i];
  const sm = (t) => t * t * (3 - 2 * t);
  const noise = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y); const xf = x - xi, yf = y - yi; const X = xi & 255, Y = yi & 255;
    const v = (i, j) => val[perm[perm[X + i] + Y + j] & 255]; const u = sm(xf), w = sm(yf);
    return (v(0,0) * (1-u) + v(1,0) * u) * (1-w) + (v(0,1) * (1-u) + v(1,1) * u) * w; };
  const fbm = (x, y, o) => { let s = 0, amp = 0.5, f = 1, n = 0; for (let i = 0; i < o; i++) { s += amp * noise(x * f + i * 17.3, y * f - i * 9.1); n += amp; amp *= 0.5; f *= 2.03; } return s / n; };

  // A cumulus as a heap of spheres: a wide flat-bottomed base, medium puffs on its upper
  // surface, small ones on those (the "cauliflower" look), each with a depth (z) offset.
  const base = H * 0.74, cx = W / 2;
  const puffs = [];
  const nBase = 5 + ((rnd() * 2) | 0), span = W * 0.26;
  for (let i = 0; i < nBase; i++) {
    const t = nBase === 1 ? 0 : i / (nBase - 1) - 0.5;
    const r = H * (0.13 + 0.09 * (1 - Math.abs(t) * 2)) * (0.85 + rnd() * 0.3);
    puffs.push({ x: cx + t * span * 2 + (rnd() - 0.5) * 30, y: base - r * 0.55, z: (rnd() - 0.5) * 60, r, lvl: 0 });
  }
  const addOn = (count, rmin, rmax, parents, lvl, upBias) => {
    for (let i = 0; i < count; i++) {
      const p = parents[(rnd() * parents.length) | 0];
      const ang = -Math.PI / 2 + (rnd() - 0.5) * Math.PI * upBias;
      const r = H * (rmin + rnd() * (rmax - rmin));
      const d = p.r * (0.55 + rnd() * 0.3);
      puffs.push({ x: p.x + Math.cos(ang) * d, y: p.y + Math.sin(ang) * d, z: p.z + (rnd() - 0.3) * p.r * 0.6, r, lvl });
    }
  };
  addOn(9, 0.08, 0.13, puffs.filter((p) => p.lvl === 0), 1, 1.1);
  // a tower or two, like the photo
  const towers = 1 + ((rnd() * 2) | 0);
  for (let k = 0; k < towers; k++) addOn(2, 0.08, 0.11, puffs.filter((p) => p.lvl === 1), 2, 0.5);
  addOn(26, 0.035, 0.065, puffs.filter((p) => p.lvl >= 1), 3, 1.3);
  addOn(14, 0.03, 0.05, puffs.filter((p) => p.lvl === 0), 3, 1.6);

  const L = [-0.38, -0.8, 0.46]; { const m = Math.hypot(...L); L[0] /= m; L[1] /= m; L[2] /= m; }
  const Lxy = Math.hypot(L[0], L[1]), dirX = L[0] / Lxy, dirY = L[1] / Lxy, rise = L[2] / Lxy;
  // Height field: a smooth max of sphere tops (no seams), plus billowy noise; coverage
  // from a soft metaball sum (wispy edges).
  const Hf = new Float32Array(W * H).fill(-1), A = new Float32Array(W * H);
  const K = 0.11;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let sum = 0, cov = 0, any = false;
    for (const p of puffs) {
      const dx = x - p.x, dy = y - p.y, d2 = dx * dx + dy * dy, r2 = p.r * p.r;
      const q = d2 / r2;
      if (q < 1.25) { const f = Math.max(0, 1 - q / 1.25); cov += f * f; }
      if (d2 < r2) { any = true; sum += Math.exp(K * (p.z + Math.sqrt(r2 - d2))); }
    }
    const i = y * W + x;
    const n1 = fbm(x / 34, y / 34, 4), n2 = fbm(x / 11, y / 11, 3);
    let alpha = Math.min(1, Math.max(0, (cov * (0.75 + 0.5 * n1) + (n2 - 0.5) * 0.3 - 0.16) / 0.3));
    const below = y - (base + (n1 - 0.5) * 30);
    if (below > 0) alpha *= Math.max(0, 1 - below / 30);
    const ex = Math.min(x, W - x) / 50, ey = Math.min(y, H - y) / 50; alpha *= Math.min(1, ex, ey);
    A[i] = alpha;
    if (any) Hf[i] = Math.log(sum) / K + (fbm(x / 55, y / 55, 3) - 0.5) * 26 + (n1 - 0.5) * 6;
  }
  // fill height outside the spheres (wispy fringe) with a gentle falloff from neighbours
  for (let i = 0; i < W * H; i++) if (Hf[i] < 0) Hf[i] = 0;
  const hAt = (x, y) => Hf[Math.min(H - 1, Math.max(0, y | 0)) * W + Math.min(W - 1, Math.max(0, x | 0))];
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const ctx = c.getContext("2d"); const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, alpha = A[i];
    if (alpha <= 0.003) continue;
    const h0 = Hf[i];
    const gx = (hAt(x + 3, y) - hAt(x - 3, y)) / 6, gy = (hAt(x, y + 3) - hAt(x, y - 3)) / 6;
    let nx = -gx, ny = -gy, nz = 1; const nm = Math.hypot(nx, ny, nz); nx /= nm; ny /= nm; nz /= nm;
    const lam = Math.max(0, (nx * L[0] + ny * L[1] + nz * L[2] + 0.3) / 1.3);
    let occ = 0;
    for (let s = 1; s <= 16; s++) { const t = s * 7; const hs = hAt(x + dirX * t, y + dirY * t); occ += Math.max(0, hs - (h0 + t * rise)); }
    const T = Math.exp(-occ * 0.011);
    const height = Math.min(1, Math.max(0, (base - y) / (H * 0.5)));
    let k = lam * (0.45 + 0.55 * T);
    k = 0.22 + 0.78 * k;
    k *= 0.58 + 0.42 * Math.pow(height, 0.7);
    k = Math.min(1, k * 1.15 + (1 - alpha) * 0.2);
    const sh = [112, 122, 142], hi = [255, 254, 252];
    img.data[i * 4] = sh[0] + (hi[0] - sh[0]) * k;
    img.data[i * 4 + 1] = sh[1] + (hi[1] - sh[1]) * k;
    img.data[i * 4 + 2] = sh[2] + (hi[2] - sh[2]) * k;
    img.data[i * 4 + 3] = alpha * 255;
  }
  ctx.putImageData(img, 0, 0);
  // a touch of softness, like real vapour
  const c2 = document.createElement("canvas"); c2.width = W; c2.height = H; const x2 = c2.getContext("2d");
  x2.filter = "blur(1.6px)"; x2.drawImage(c, 0, 0);
  return c2.toDataURL("image/webp", 0.8);
};
for (const [i, seed] of seeds.entries()) {
  const url = await page.evaluate(gen, seed);
  writeFileSync(`${OUT}cumulus-${i + 1}.webp`, Buffer.from(url.split(",")[1], "base64"));
}
await browser.close();
