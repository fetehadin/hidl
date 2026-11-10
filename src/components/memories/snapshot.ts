/**
 * Draws what the memories board shows right now into a picture to share: the sky and its clouds,
 * the photos on screen with their frames and captions, the island stickers, the page's title and a
 * small hidl mark. Drawn by hand on a canvas rather than screenshotted, so it is sharp at any size
 * and needs no extra library; it follows the board's CSS (globals.css → Memories board) and the
 * theme's colors. Browser only, and loaded only when someone taps Share.
 *
 * Photos come from the media store with CORS (allowed for this site's origin, see
 * deploy/media/tools/set-cors.mjs), which is what lets a canvas with them still be saved.
 */
import type { PhotoView } from "@/lib/data/photos";
import type { MemoryCluster } from "@/lib/memories";
import type { StickerText } from "./memory-board";

export type SnapshotInput = {
  board: HTMLElement;
  /** The camera and the board's size (CSS px) when Share was tapped. */
  view: { tx: number; ty: number; scale: number; width: number; height: number };
  clusters: MemoryCluster<PhotoView>[];
  stickers: StickerText[];
  title: string;
  summary: string;
};

/** Longest side of the picture, in pixels: sharp on a phone, small enough to send. */
const MAX_SIDE = 2400;
/** Photos drawn at most (zoomed far out, the rest are specks anyway). */
const MAX_PHOTOS = 160;
const FETCH_TIMEOUT_MS = 15_000;

type Ctx = CanvasRenderingContext2D;
type Fonts = { body: string; display: string; title: string; brand: string; hand: string };

export async function drawMemorySnapshot(input: SnapshotInput): Promise<Blob> {
  const { view, board } = input;
  const k = Math.min(2, MAX_SIDE / Math.max(view.width, view.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(view.width * k);
  canvas.height = Math.round(view.height * k);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.scale(k, k);

  const css = getComputedStyle(document.documentElement);
  const color = (name: string) => css.getPropertyValue(name).trim();
  const shadow = (alpha: number) => `rgb(${color("--shadow")} / ${alpha})`;
  const fonts = await readyFonts();

  // Which photos are on screen, nearest the middle first (so a cap drops the edges, not the center).
  const s = view.scale;
  const cards = input.clusters
    .flatMap((c) =>
      c.photos.map((p) => ({ ...p, cx: view.tx + (c.x + p.x) * s, cy: view.ty + (c.y + p.y) * s })),
    )
    .filter(({ cx, cy, width }) => {
      const reach = width * 1.7 * s; // a tall portrait with a caption, rotated
      return cx + reach > 0 && cx - reach < view.width && cy + reach > 0 && cy - reach < view.height;
    });
  const mid = (c: { cx: number; cy: number }) => Math.hypot(c.cx - view.width / 2, c.cy - view.height / 2);
  const shown = new Set(cards.sort((a, b) => mid(a) - mid(b)).slice(0, MAX_PHOTOS));
  const drawn = cards.filter((c) => shown.has(c));
  const [images, icon] = await Promise.all([loadAll(drawn.map((c) => c.photo.thumbUrl)), loadSameOrigin("/icon-192.png")]);

  // Sky: the same gradient as .memory-board.
  const sky = ctx.createLinearGradient(0, 0, 0, view.height);
  sky.addColorStop(0, color("--sky-top"));
  sky.addColorStop(0.55, color("--sky-mid"));
  sky.addColorStop(1, color("--mint"));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, view.width, view.height);
  drawClouds(ctx, board);

  // Photos in page order (later ones sit on top), as on the board.
  const order = new Map(input.clusters.flatMap((c) => c.photos).map((p, i) => [p, i]));
  drawn.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
  drawn.forEach((card, i) => {
    ctx.save();
    ctx.translate(card.cx, card.cy);
    ctx.rotate((card.rotate * Math.PI) / 180);
    ctx.scale(s, s);
    drawPhotoCard(ctx, card.width, images[i], card.photo, fonts, color, shadow, s * k);
    ctx.restore();
  });

  // Stickers go over every photo (z-index 6 on the board).
  input.clusters.forEach((c, i) => {
    const x = view.tx + (c.x + c.sticker.x) * s;
    const y = view.ty + (c.y + c.sticker.y) * s;
    if (x < -200 * s || x > view.width + 200 * s || y < -80 * s || y > view.height + 80 * s) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((c.sticker.rotate * Math.PI) / 180);
    ctx.scale(s, s);
    drawSticker(ctx, input.stickers[i], fonts, color, shadow, s * k);
    ctx.restore();
  });

  drawTitle(ctx, input.title, input.summary, fonts, color, shadow, k);
  drawMark(ctx, view, icon, fonts, color, shadow, k);

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))), "image/jpeg", 0.9),
  );
}

/** The families the page uses (next/font gives them generated names), loaded before drawing. */
async function readyFonts(): Promise<Fonts> {
  const probe = (className: string) => {
    const el = document.createElement("span");
    el.className = className;
    el.style.display = "none";
    document.body.append(el);
    const family = getComputedStyle(el).fontFamily;
    el.remove();
    return family;
  };
  const fonts: Fonts = {
    body: getComputedStyle(document.body).fontFamily,
    display: probe("font-display"),
    title: probe("font-title"),
    brand: probe("font-brand"),
    hand: probe("font-hand"),
  };
  await Promise.all(
    [
      `800 11px ${fonts.body}`,
      `700 12px ${fonts.body}`,
      `600 18px ${fonts.display}`,
      `500 24px ${fonts.title}`,
      `600 26px ${fonts.brand}`,
      `400 17px ${fonts.hand}`,
    ].map((f) => document.fonts.load(f).catch(() => [])),
  );
  return fonts;
}

/** Fetches photos a few at a time; a photo that won't load is drawn as an empty frame. */
async function loadAll(urls: string[]): Promise<(ImageBitmap | null)[]> {
  const out: (ImageBitmap | null)[] = new Array(urls.length).fill(null);
  let next = 0;
  const worker = async () => {
    while (next < urls.length) {
      const i = next++;
      out[i] = await loadImage(urls[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, urls.length) }, worker));
  return out;
}

async function loadImage(url: string): Promise<ImageBitmap | null> {
  if (!url) return null;
  try {
    // credentials: "omit" matches the service worker's photo cache, so these usually come from there.
    const res = await fetch(url, { mode: "cors", credentials: "omit", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    return await createImageBitmap(await res.blob());
  } catch {
    return null;
  }
}

async function loadSameOrigin(src: string): Promise<HTMLImageElement | null> {
  const img = new Image();
  img.src = src;
  try {
    await img.decode();
    return img;
  } catch {
    return null;
  }
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Canvas shadows ignore the transform, so their size is given in canvas pixels (`px` per CSS px). */
function setShadow(ctx: Ctx, color: string, blur: number, offsetY: number, px: number) {
  ctx.shadowColor = color;
  ctx.shadowBlur = blur * px;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = offsetY * px;
}

function clearShadow(ctx: Ctx) {
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
}

/** Cuts text to fit, with an ellipsis. */
function fit(ctx: Ctx, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const m = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(`${text.slice(0, m)}…`).width <= max) lo = m;
    else hi = m - 1;
  }
  return `${text.slice(0, lo).trimEnd()}…`;
}

/** The clouds where they are on screen right now (they drift; the picture catches them mid-way). */
function drawClouds(ctx: Ctx, board: HTMLElement) {
  const box = board.getBoundingClientRect();
  for (const img of board.querySelectorAll<HTMLImageElement>("img.memory-sky-cloud")) {
    if (!img.complete || !img.naturalWidth) continue;
    const r = img.getBoundingClientRect();
    ctx.save();
    ctx.globalAlpha = Number(getComputedStyle(img).opacity) || 1;
    if (img.style.scale.startsWith("-1")) {
      ctx.translate(r.right - box.left, r.top - box.top);
      ctx.scale(-1, 1);
    } else {
      ctx.translate(r.left - box.left, r.top - box.top);
    }
    ctx.drawImage(img, 0, 0, r.width, r.height);
    ctx.restore();
  }
}

/** One photo card (.memory-photo), centered on the origin, in the board's own units. */
function drawPhotoCard(
  ctx: Ctx,
  width: number,
  image: ImageBitmap | null,
  photo: PhotoView,
  fonts: Fonts,
  color: (name: string) => string,
  shadow: (alpha: number) => string,
  px: number,
) {
  const inner = width - 16;
  const imageH = Math.max(60, image ? (inner * image.height) / image.width : (inner * 5) / 4);
  const captionH = photo.caption ? 6 + 21 : 0;
  const height = 8 + imageH + captionH + 10;
  ctx.translate(-width / 2, -height / 2);

  setShadow(ctx, shadow(0.4), 26, 14, px);
  ctx.fillStyle = color("--card");
  roundRect(ctx, 0, 0, width, height, 17.6);
  ctx.fill();
  clearShadow(ctx);

  ctx.save();
  roundRect(ctx, 8, 8, inner, imageH, 11.2);
  ctx.clip();
  ctx.fillStyle = color("--paper-deep");
  ctx.fillRect(8, 8, inner, imageH);
  if (image) ctx.drawImage(image, 8, 8, inner, imageH);
  ctx.restore();

  if (photo.isVideo) {
    // The play mark (VideoBadge): a dark dot with a white triangle.
    ctx.fillStyle = color("--scrim");
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.arc(28, 28, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = color("--snow");
    ctx.beginPath();
    ctx.moveTo(25, 22.5);
    ctx.lineTo(33, 28);
    ctx.lineTo(25, 33.5);
    ctx.closePath();
    ctx.fill();
  }

  if (photo.caption) {
    ctx.font = `400 17px ${fonts.hand}`;
    ctx.fillStyle = color("--ink-soft");
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(fit(ctx, photo.caption, inner - 4), 10, 8 + imageH + 6 + 10.5);
  }
}

/** An island's label (.memory-sticker), centered on the origin. */
function drawSticker(
  ctx: Ctx,
  text: StickerText,
  fonts: Fonts,
  color: (name: string) => string,
  shadow: (alpha: number) => string,
  px: number,
) {
  const small = text.small.toUpperCase();
  const set = (font: string, spacing = "0px") => {
    ctx.font = font;
    if ("letterSpacing" in ctx) ctx.letterSpacing = spacing;
  };
  set(`800 11px ${fonts.body}`, "0.55px");
  const smallW = ctx.measureText(small).width;
  set(`600 18px ${fonts.display}`);
  const bigW = ctx.measureText(text.big).width;
  set(`700 12px ${fonts.body}`);
  const countW = text.count ? ctx.measureText(text.count).width : 0;

  const width = Math.max(smallW, bigW, countW) + 32;
  const height = 10 + 16.5 + 22.5 + (text.count ? 16 : 0) + 10;
  ctx.translate(-width / 2, -height / 2);

  setShadow(ctx, shadow(0.35), 20, 10, px);
  ctx.fillStyle = color("--card");
  roundRect(ctx, 0, 0, width, height, 22.4);
  ctx.fill();
  clearShadow(ctx);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  set(`800 11px ${fonts.body}`, "0.55px");
  ctx.fillStyle = color("--accent");
  ctx.fillText(small, width / 2, 10 + 8.25);
  set(`600 18px ${fonts.display}`);
  ctx.fillStyle = color("--ink");
  ctx.fillText(text.big, width / 2, 10 + 16.5 + 11.25);
  if (text.count) {
    set(`700 12px ${fonts.body}`);
    ctx.fillStyle = color("--muted");
    ctx.fillText(text.count, width / 2, 10 + 16.5 + 22.5 + 8);
  }
  set(`400 16px ${fonts.body}`);
}

/** The page's title card, top left, as on screen (eyebrow, title, counts). */
function drawTitle(
  ctx: Ctx,
  title: string,
  summary: string,
  fonts: Fonts,
  color: (name: string) => string,
  shadow: (alpha: number) => string,
  px: number,
) {
  const x = 16;
  const y = 16;
  ctx.font = `800 12.5px ${fonts.body}`;
  if ("letterSpacing" in ctx) ctx.letterSpacing = "1px";
  const eyebrowW = ctx.measureText("MEMORY LANE").width;
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  ctx.font = `500 24px ${fonts.title}`;
  const titleW = ctx.measureText(title).width;
  ctx.font = `400 14px ${fonts.body}`;
  const summaryW = ctx.measureText(summary).width;
  const width = Math.max(eyebrowW, titleW, summaryW) + 32;
  const height = 12 + 15 + 30 + 20 + 12;

  setShadow(ctx, shadow(0.18), 18, 6, px);
  ctx.fillStyle = color("--card");
  roundRect(ctx, x, y, width, height, 22);
  ctx.fill();
  clearShadow(ctx);

  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = `800 12.5px ${fonts.body}`;
  if ("letterSpacing" in ctx) ctx.letterSpacing = "1px";
  ctx.fillStyle = color("--accent");
  ctx.fillText("MEMORY LANE", x + 16, y + 12 + 7.5);
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  ctx.font = `500 24px ${fonts.title}`;
  ctx.fillStyle = color("--heading");
  ctx.fillText(title, x + 16, y + 12 + 15 + 15);
  ctx.font = `400 14px ${fonts.body}`;
  ctx.fillStyle = color("--muted");
  ctx.fillText(summary, x + 16, y + 12 + 15 + 30 + 10);
}

/** "made with hidl", bottom right: Hidi in a circle and the wordmark on a small pill. */
function drawMark(
  ctx: Ctx,
  view: SnapshotInput["view"],
  icon: HTMLImageElement | null,
  fonts: Fonts,
  color: (name: string) => string,
  shadow: (alpha: number) => string,
  px: number,
) {
  ctx.font = `600 26px ${fonts.brand}`;
  const wordW = ctx.measureText("hidl").width;
  const iconSize = icon ? 34 : 0;
  const width = 10 + iconSize + (icon ? 8 : 6) + wordW + 16;
  const height = 48;
  const x = view.width - 16 - width;
  const y = view.height - 16 - height;

  setShadow(ctx, shadow(0.2), 18, 6, px);
  ctx.fillStyle = color("--card");
  roundRect(ctx, x, y, width, height, height / 2);
  ctx.fill();
  clearShadow(ctx);

  if (icon) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + 7 + iconSize / 2, y + height / 2, iconSize / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(icon, x + 7, y + (height - iconSize) / 2, iconSize, iconSize);
    ctx.restore();
  }
  ctx.font = `600 26px ${fonts.brand}`;
  ctx.fillStyle = color("--heading");
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("hidl", x + 10 + iconSize + (icon ? 8 : 6), y + height / 2 + 1);
}

/* ------------------------------------------------------------------------------------------ */
/* Classic cards: one day, a week or a month, laid out like a printed photo card.              */
/* ------------------------------------------------------------------------------------------ */

export type PeriodCardInput = {
  period: "day" | "week" | "month";
  /** "my day" / "my week" / "my month". */
  eyebrow: string;
  title: string;
  /** "12 photos · 5 days". */
  summary: string;
  /** Every day of the period, with its photos (cover first) and the number to print on it. */
  days: { date: string; number: number; photos: PhotoView[] }[];
  /** Empty cells before the month's first day (Monday-first). */
  leadingBlanks: number;
};

/** A 4:5 portrait, the shape most feeds show whole. */
const CARD_W = 1080;
const CARD_H = 1350;
const PAD = 72;
const WEEKDAY_SHORT = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

export async function drawPeriodCard(input: PeriodCardInput): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");

  const css = getComputedStyle(document.documentElement);
  const color = (name: string) => css.getPropertyValue(name).trim();
  const shadow = (alpha: number) => `rgb(${color("--shadow")} / ${alpha})`;
  const fonts = await readyFonts();

  // Which picture each slot shows: a day card shows its photos; week and month show each day's cover.
  const shown =
    input.period === "day"
      ? (input.days[0]?.photos ?? []).slice(0, 6)
      : input.days.map((d) => d.photos[0] ?? null);
  // Sharp enough for the slot: a big single photo uses the full image (not for videos: that's the video file).
  const big = input.period === "day" && shown.length <= 2;
  const urls = shown.map((p) => (p ? (big && !p.isVideo ? p.fullUrl : p.thumbUrl) : ""));
  const [images, icon] = await Promise.all([loadAll(urls), loadSameOrigin("/icon-192.png")]);

  // Paper, warming to mint at the bottom.
  const bg = ctx.createLinearGradient(0, 0, 0, CARD_H);
  bg.addColorStop(0, color("--paper"));
  bg.addColorStop(1, color("--mint"));
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // Heading.
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = `800 28px ${fonts.body}`;
  if ("letterSpacing" in ctx) ctx.letterSpacing = "3px";
  ctx.fillStyle = color("--accent");
  ctx.fillText(input.eyebrow.toUpperCase(), PAD, 112);
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  ctx.font = `500 ${input.title.length > 26 ? 52 : 64}px ${fonts.title}`;
  ctx.fillStyle = color("--heading");
  ctx.fillText(fit(ctx, input.title, CARD_W - PAD * 2), PAD, 186);
  ctx.font = `400 30px ${fonts.body}`;
  ctx.fillStyle = color("--muted");
  ctx.fillText(input.summary, PAD, 236);

  const body = { x: PAD, y: 280, w: CARD_W - PAD * 2, h: CARD_H - 280 - 150 };
  const env = { ctx, fonts, color, shadow };
  if (input.period === "day") drawDayCollage(env, body, shown as PhotoView[], images, input.days[0]?.photos.length ?? 0);
  else if (input.period === "week") drawWeek(env, body, input.days, images);
  else drawMonth(env, body, input, images);

  // Footer: the hidl mark, a little larger than on the screen picture.
  // drawMark keeps 16px from the corner; at 1.5× and 48px in, that's the card's own margin.
  ctx.save();
  ctx.scale(1.5, 1.5);
  const markArea = { tx: 0, ty: 0, scale: 1, width: (CARD_W - 48) / 1.5, height: (CARD_H - 30) / 1.5 };
  drawMark(ctx, markArea, icon, fonts, color, shadow, 1.5);
  ctx.restore();

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))), "image/jpeg", 0.92),
  );
}

type Env = { ctx: Ctx; fonts: Fonts; color: (name: string) => string; shadow: (alpha: number) => string };
type Box = { x: number; y: number; w: number; h: number };

/** Draws `image` filling the box, cropped from its middle (CSS object-fit: cover). */
function drawCover(ctx: Ctx, image: ImageBitmap, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / image.width, h / image.height);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(image, (image.width - sw) / 2, (image.height - sh) / 2, sw, sh, x, y, w, h);
}

/** A white print with a photo (or an empty space) inside; `label` under the photo, if any. */
function drawPrint(
  { ctx, fonts, color, shadow }: Env,
  box: Box,
  image: ImageBitmap | null,
  opts: { border: number; label?: string; labelSize?: number; hand?: boolean; video?: boolean; empty?: boolean },
) {
  const labelH = opts.label ? (opts.labelSize ?? 26) * 1.9 : 0;
  ctx.save();
  setShadow(ctx, shadow(0.28), 30, 14, 1);
  ctx.fillStyle = color("--card");
  roundRect(ctx, box.x, box.y, box.w, box.h, 22);
  ctx.fill();
  clearShadow(ctx);

  const px = box.x + opts.border;
  const py = box.y + opts.border;
  const pw = box.w - opts.border * 2;
  const ph = box.h - opts.border - (opts.label ? labelH : opts.border);
  ctx.save();
  roundRect(ctx, px, py, pw, ph, 14);
  ctx.clip();
  ctx.fillStyle = color("--paper-deep");
  ctx.fillRect(px, py, pw, ph);
  if (image) drawCover(ctx, image, px, py, pw, ph);
  ctx.restore();

  if (opts.video && image) {
    ctx.fillStyle = color("--scrim");
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.arc(px + 30, py + 30, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = color("--snow");
    ctx.beginPath();
    ctx.moveTo(px + 25, py + 21);
    ctx.lineTo(px + 38, py + 30);
    ctx.lineTo(px + 25, py + 39);
    ctx.closePath();
    ctx.fill();
  }

  if (opts.label) {
    ctx.font = opts.hand ? `400 ${opts.labelSize ?? 26}px ${fonts.hand}` : `700 ${opts.labelSize ?? 26}px ${fonts.body}`;
    ctx.fillStyle = color(opts.empty ? "--muted" : opts.hand ? "--ink-soft" : "--ink");
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(fit(ctx, opts.label, box.w - 16), box.x + box.w / 2, box.y + box.h - labelH / 2 - 2);
  }
  ctx.restore();
}

/** One day: up to six photos as prints, laid out for how many there are. */
function drawDayCollage(env: Env, body: Box, photos: PhotoView[], images: (ImageBitmap | null)[], total: number) {
  const { ctx, fonts, color } = env;
  const n = photos.length;
  // Only a lone photo gets its caption printed under it; more would crowd the card.
  if (n === 0) return;
  const gap = 32;
  // Rows of columns: 1 → [1], 2 → [2], 3 → [1, 2], 4 → [2, 2], 5 → [2, 3], 6 → [3, 3].
  const rows = [[1], [2], [1, 2], [2, 2], [2, 3], [3, 3]][n - 1];
  const single = n === 1 && photos[0].caption;
  const rowH = (body.h - gap * (rows.length - 1)) / rows.length;
  let i = 0;
  rows.forEach((cols, r) => {
    const w = (body.w - gap * (cols - 1)) / cols;
    for (let c = 0; c < cols; c++, i++) {
      const box = { x: body.x + c * (w + gap), y: body.y + r * (rowH + gap), w, h: rowH };
      drawPrint(env, box, images[i], {
        border: n === 1 ? 26 : 18,
        label: single ? (photos[0].caption ?? undefined) : undefined,
        labelSize: 40,
        hand: true,
        video: photos[i].isVideo,
      });
    }
  });
  if (total > n) {
    // "+3 more" on the last print.
    ctx.save();
    ctx.font = `800 30px ${fonts.body}`;
    const text = `+${total - n} more`;
    const w = ctx.measureText(text).width + 36;
    const x = body.x + body.w - w - 30;
    const y = body.y + body.h - 50 - 30;
    ctx.fillStyle = color("--teal");
    roundRect(ctx, x, y, w, 50, 25);
    ctx.fill();
    ctx.fillStyle = color("--accent-ink");
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x + w / 2, y + 26);
    ctx.restore();
  }
}

/** A week: seven prints, Monday first, four on top and three below with a little Hidi. */
function drawWeek(env: Env, body: Box, days: PeriodCardInput["days"], images: (ImageBitmap | null)[]) {
  const { ctx, fonts, color } = env;
  const gap = 24;
  const cols = 4;
  const w = (body.w - gap * (cols - 1)) / cols;
  const h = Math.min((body.h - gap) / 2, w * 1.55);
  const top = body.y + (body.h - (h * 2 + gap)) / 2;
  days.forEach((d, i) => {
    const box = { x: body.x + (i % cols) * (w + gap), y: top + Math.floor(i / cols) * (h + gap), w, h };
    drawPrint(env, box, images[i], {
      border: 12,
      label: `${WEEKDAY_SHORT[i]} ${d.number}`,
      labelSize: 24,
      video: d.photos[0]?.isVideo,
      empty: d.photos.length === 0,
    });
    if (d.photos.length > 1) {
      ctx.save();
      ctx.font = `800 22px ${fonts.body}`;
      const text = `${d.photos.length}`;
      const bw = Math.max(40, ctx.measureText(text).width + 22);
      ctx.fillStyle = color("--card");
      roundRect(ctx, box.x + box.w - bw - 20, box.y + 20, bw, 40, 20);
      ctx.fill();
      ctx.fillStyle = color("--ocean");
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, box.x + box.w - bw / 2 - 20, box.y + 41);
      ctx.restore();
    }
  });
  // The eighth cell: how many days had a photo.
  const withPhotos = days.filter((d) => d.photos.length > 0).length;
  const x = body.x + 3 * (w + gap) + w / 2;
  const y = top + h + gap + h / 2;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `600 96px ${fonts.brand}`;
  ctx.fillStyle = color("--teal");
  ctx.fillText(`${withPhotos}/7`, x, y - 20);
  ctx.font = `700 24px ${fonts.body}`;
  ctx.fillStyle = color("--muted");
  ctx.fillText("days captured", x, y + 52);
  ctx.restore();
}

/** A month: a photo calendar, each day's cover in its square, Monday first. */
function drawMonth(env: Env, body: Box, input: PeriodCardInput, images: (ImageBitmap | null)[]) {
  const { ctx, fonts, color, shadow } = env;
  const gap = 10;
  const headerH = 44;
  const cells = input.leadingBlanks + input.days.length;
  const rows = Math.ceil(cells / 7);
  const size = Math.min((body.w - gap * 6) / 7, (body.h - headerH - gap * (rows - 1)) / rows);
  const gridW = size * 7 + gap * 6;
  const left = body.x + (body.w - gridW) / 2;
  const top = body.y + (body.h - (headerH + rows * size + (rows - 1) * gap)) / 2;

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `800 22px ${fonts.body}`;
  if ("letterSpacing" in ctx) ctx.letterSpacing = "2px";
  ctx.fillStyle = color("--muted");
  WEEKDAY_SHORT.forEach((d, i) => ctx.fillText(d, left + i * (size + gap) + size / 2, top + headerH / 2 - 4));
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";

  input.days.forEach((d, i) => {
    const cell = input.leadingBlanks + i;
    const x = left + (cell % 7) * (size + gap);
    const y = top + headerH + Math.floor(cell / 7) * (size + gap);
    const image = images[i];
    ctx.save();
    if (image) setShadow(ctx, shadow(0.25), 14, 6, 1);
    roundRect(ctx, x, y, size, size, 16);
    ctx.fillStyle = color(image ? "--card" : "--paper-deep");
    ctx.fill();
    clearShadow(ctx);
    if (image) {
      ctx.save();
      roundRect(ctx, x + 4, y + 4, size - 8, size - 8, 12);
      ctx.clip();
      drawCover(ctx, image, x + 4, y + 4, size - 8, size - 8);
      ctx.restore();
      // The day number on a small white tab, readable on any photo.
      ctx.font = `800 22px ${fonts.body}`;
      const text = String(d.number);
      const tw = Math.max(34, ctx.measureText(text).width + 16);
      ctx.fillStyle = color("--card");
      roundRect(ctx, x + 8, y + 8, tw, 32, 16);
      ctx.fill();
      ctx.fillStyle = color("--ink");
      ctx.fillText(text, x + 8 + tw / 2, y + 25);
    } else {
      ctx.font = `700 26px ${fonts.body}`;
      ctx.fillStyle = color("--muted");
      ctx.fillText(String(d.number), x + size / 2, y + size / 2 + 1);
    }
    ctx.restore();
  });
  ctx.restore();
}
