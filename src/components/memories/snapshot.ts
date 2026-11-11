/**
 * The memories share pictures, drawn by hand on a canvas rather than screenshotted, so they're
 * sharp at any size and need no extra library. They follow the board's CSS (globals.css →
 * Memories board) and the theme's colors. Browser only, loaded only when someone taps Share.
 * - `drawMemorySnapshot`: the board exactly as on screen (sky and clouds, the photos on screen
 *   with frames and captions, island stickers, the title card and a small hidl mark).
 * - `drawLanePicture`: a day, a week or a month as Memory Lane, every photo fitted to the screen.
 * - `drawCalendarPicture`: the calendar page's month, each day's wallpaper in its square.
 *
 * Photos come from the media store with CORS (allowed for this site's origin, see
 * deploy/media/tools/set-cors.mjs), which is what lets a canvas with them still be saved.
 */
import type { PhotoView } from "@/lib/data/photos";
import type { MemoryCluster } from "@/lib/memories";
import type { StickerText } from "./memory-board";
import { FRAME_RATIO, laneLayout } from "@/lib/lane-layout";

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

export async function drawMemorySnapshot(input: SnapshotInput): Promise<HTMLCanvasElement> {
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

  drawTitle(ctx, input.title, input.summary, fonts, color, shadow, k, view.width - 32);
  drawMark(ctx, view, icon, fonts, color, shadow, k);
  return canvas;
}

/** The picture as a file: JPEG to share or save (small), PNG to copy (what clipboards take). */
export function canvasBlob(canvas: HTMLCanvasElement, type: "image/jpeg" | "image/png" = "image/jpeg") {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))), type, 0.9),
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
  maxWidth: number,
) {
  const x = 16;
  const y = 16;
  ctx.font = `800 12.5px ${fonts.body}`;
  if ("letterSpacing" in ctx) ctx.letterSpacing = "1px";
  const eyebrowW = ctx.measureText("MEMORY LANE").width;
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  // A long title ("Wednesday, September 30, 2026" on a narrow phone) shrinks before it's cut.
  ctx.font = `500 24px ${fonts.title}`;
  const titleSize = Math.max(17, Math.min(24, (24 * (maxWidth - 32)) / ctx.measureText(title).width));
  ctx.font = `500 ${titleSize}px ${fonts.title}`;
  title = fit(ctx, title, maxWidth - 32);
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
  ctx.font = `500 ${titleSize}px ${fonts.title}`;
  ctx.fillStyle = color("--heading");
  ctx.fillText(title, x + 16, y + 12 + 15 + 15);
  ctx.font = `400 14px ${fonts.body}`;
  ctx.fillStyle = color("--muted");
  ctx.fillText(summary, x + 16, y + 12 + 15 + 30 + 10);
}

/** "made with Hidl", bottom right: Hidi in a circle and the wordmark on a small pill. */
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
  const wordW = ctx.measureText("Hidl").width;
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
  ctx.fillStyle = color("--teal");
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("Hidl", x + 10 + iconSize + (icon ? 8 : 6), y + height / 2 + 1);
}

/* ------------------------------------------------------------------------------------------ */
/* A day, a week or a month as Memory Lane: the board's sky, with every photo of the period     */
/* framed and laid out to fit the screen (src/lib/lane-layout.ts).                              */
/* ------------------------------------------------------------------------------------------ */

export type LaneInput = {
  /** "Tuesday, November 10, 2026", "Nov 9 – Nov 15, 2026", "November 2026". */
  title: string;
  /** "12 photos · 5 days". */
  summary: string;
  /** The photos to show, in order (oldest first). */
  photos: PhotoView[];
  /** A week or a month: the tag on each day's first photo ("Mon 9", "Nov 9"). None for a day. */
  dayTag?: (date: string) => string;
  /** The screen's size (CSS px): the picture takes its shape, so it fills the phone it's made on. */
  screen: { width: number; height: number };
};

/** The short side of the picture, in pixels: 1080 is what feeds and stories use. */
const LANE_SHORT_SIDE = 1080;

/** The board's clouds, placed as SKY_CLOUDS in memory-board.tsx places them (top, size, where along). */
const LANE_CLOUDS = [
  { variant: 1, top: 0.09, width: 0.52, at: 0.15, flip: false, opacity: 0.95 },
  { variant: 3, top: 0.36, width: 0.34, at: 0.7, flip: true, opacity: 0.8 },
  { variant: 2, top: 0.58, width: 0.6, at: 0.2, flip: false, opacity: 0.9 },
  { variant: 4, top: 0.8, width: 0.4, at: 0.75, flip: false, opacity: 0.85 },
] as const;

export async function drawLanePicture(input: LaneInput): Promise<HTMLCanvasElement> {
  // The screen's shape, within reason: not wider than 4:5 portrait or 16:9 landscape-ish extremes.
  let w = Math.max(320, input.screen.width);
  let h = Math.max(320, input.screen.height);
  if (h >= w) h = Math.min(Math.max(h, w * 1.25), w * 2.2);
  else w = Math.min(Math.max(w, h * 1.25), h * 1.9);
  const k = LANE_SHORT_SIDE / Math.min(w, h);

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * k);
  canvas.height = Math.round(h * k);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.scale(k, k);

  const css = getComputedStyle(document.documentElement);
  const color = (name: string) => css.getPropertyValue(name).trim();
  const shadow = (alpha: number) => `rgb(${color("--shadow")} / ${alpha})`;
  const fonts = await readyFonts();

  // Under the title card, above the hidl mark.
  const area = { x: 10, y: 16 + 81 + 14, w: w - 20, h: h - (16 + 81 + 14) - (16 + 48 + 8) };
  const slots = laneLayout(input.photos.length, area);
  // Big frames get the full photo (sharper); small ones the thumbnail. Never a video's full file.
  const urls = input.photos.map((p, i) => (slots[i].width * k > 520 && !p.isVideo ? p.fullUrl : p.thumbUrl));
  const [images, clouds, icon] = await Promise.all([
    loadAll(urls),
    Promise.all(LANE_CLOUDS.map((c) => loadSameOrigin(`/clouds/cumulus-${c.variant}.webp`))),
    loadSameOrigin("/icon-192.png"),
  ]);

  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, color("--sky-top"));
  sky.addColorStop(0.55, color("--sky-mid"));
  sky.addColorStop(1, color("--mint"));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  LANE_CLOUDS.forEach((c, i) => {
    const img = clouds[i];
    if (!img) return;
    const cw = Math.min(w * c.width, 540);
    const ch = (cw * img.naturalHeight) / img.naturalWidth;
    const x = c.at * (w + cw) - cw;
    ctx.save();
    ctx.globalAlpha = c.opacity;
    ctx.translate(c.flip ? x + cw : x, h * c.top);
    if (c.flip) ctx.scale(-1, 1);
    ctx.drawImage(img, 0, 0, cw, ch);
    ctx.restore();
  });

  input.photos.forEach((photo, i) => {
    const slot = slots[i];
    ctx.save();
    ctx.translate(slot.x, slot.y);
    ctx.rotate((slot.rotate * Math.PI) / 180);
    drawFrame(ctx, slot.width, images[i], photo, fonts, color, shadow, k);
    const first = input.dayTag && (i === 0 || input.photos[i - 1].date !== photo.date);
    if (first) drawDayTag(ctx, slot.width, input.dayTag!(photo.date), fonts, color, shadow, k);
    ctx.restore();
  });

  drawTitle(ctx, input.title, input.summary, fonts, color, shadow, k, w - 32);
  drawMark(ctx, { tx: 0, ty: 0, scale: 1, width: w, height: h }, icon, fonts, color, shadow, k);
  return canvas;
}

/** Draws `image` filling the box, cropped from its middle (CSS object-fit: cover). */
function drawCover(ctx: Ctx, image: ImageBitmap, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / image.width, h / image.height);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(image, (image.width - sw) / 2, (image.height - sh) / 2, sw, sh, x, y, w, h);
}

/** A framed photo centered on the origin: a square picture and a strip below for its caption. */
function drawFrame(
  ctx: Ctx,
  width: number,
  image: ImageBitmap | null,
  photo: PhotoView,
  fonts: Fonts,
  color: (name: string) => string,
  shadow: (alpha: number) => string,
  px: number,
) {
  const height = width * FRAME_RATIO;
  const border = Math.max(3, width * 0.05);
  const side = width - border * 2;
  ctx.translate(-width / 2, -height / 2);

  setShadow(ctx, shadow(0.4), Math.min(26, width * 0.15), Math.min(14, width * 0.08), px);
  ctx.fillStyle = color("--card");
  roundRect(ctx, 0, 0, width, height, width * 0.1);
  ctx.fill();
  clearShadow(ctx);

  ctx.save();
  roundRect(ctx, border, border, side, side, width * 0.065);
  ctx.clip();
  ctx.fillStyle = color("--paper-deep");
  ctx.fillRect(border, border, side, side);
  if (image) drawCover(ctx, image, border, border, side, side);
  ctx.restore();

  if (photo.isVideo) {
    const r = Math.max(6, width * 0.07);
    const cx = border + r * 1.6;
    const cy = border + r * 1.6;
    ctx.fillStyle = color("--scrim");
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = color("--snow");
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.3, cy - r * 0.45);
    ctx.lineTo(cx + r * 0.45, cy);
    ctx.lineTo(cx - r * 0.3, cy + r * 0.45);
    ctx.closePath();
    ctx.fill();
  }

  // Captions only where they can be read (a frame at least ~70px wide on the screen).
  if (photo.caption && width >= 70) {
    const strip = height - border - side;
    ctx.font = `400 ${Math.min(22, strip * 0.55)}px ${fonts.hand}`;
    ctx.fillStyle = color("--ink-soft");
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(fit(ctx, photo.caption, side - 2), border + 1, border + side + strip / 2);
  }
}

/** The small date tag on a day's first photo, over its top edge (like an island's sticker). */
function drawDayTag(
  ctx: Ctx,
  width: number,
  text: string,
  fonts: Fonts,
  color: (name: string) => string,
  shadow: (alpha: number) => string,
  px: number,
) {
  const size = Math.max(8, Math.min(14, width * 0.1));
  ctx.font = `800 ${size}px ${fonts.body}`;
  if ("letterSpacing" in ctx) ctx.letterSpacing = `${size * 0.04}px`;
  const tw = ctx.measureText(text).width + size * 1.4;
  const th = size * 1.9;
  const x = width / 2 - tw / 2;
  const y = -th * 0.45;
  ctx.save();
  ctx.translate(x + tw / 2, y + th / 2);
  ctx.rotate((-3 * Math.PI) / 180);
  setShadow(ctx, shadow(0.3), 10, 4, px);
  ctx.fillStyle = color("--card");
  roundRect(ctx, -tw / 2, -th / 2, tw, th, th / 2);
  ctx.fill();
  clearShadow(ctx);
  ctx.fillStyle = color("--accent");
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 0, 1);
  ctx.restore();
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
}

/* ------------------------------------------------------------------------------------------ */
/* The calendar page as a picture: the month's grid with each day's wallpaper, as on screen.  */
/* ------------------------------------------------------------------------------------------ */

export type CalendarPictureInput = {
  /** "November 2026" (or the Ethiopian month). */
  label: string;
  /** "8 photos · 6 days". */
  summary: string;
  /** Every real day of the month, its number in the chosen calendar, and its photos (wallpaper first). */
  days: { date: string; number: number; photos: PhotoView[] }[];
  /** Empty cells before the first day (Monday first). */
  leadingBlanks: number;
  today: string;
  screen: { width: number; height: number };
};

const WEEKDAY_LETTERS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

export async function drawCalendarPicture(input: CalendarPictureInput): Promise<HTMLCanvasElement> {
  let w = Math.max(320, input.screen.width);
  let h = Math.max(320, input.screen.height);
  if (h >= w) h = Math.min(Math.max(h, w * 1.25), w * 2.2);
  else w = Math.min(Math.max(w, h * 1.25), h * 1.9);
  const k = LANE_SHORT_SIDE / Math.min(w, h);

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * k);
  canvas.height = Math.round(h * k);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.scale(k, k);

  const css = getComputedStyle(document.documentElement);
  const color = (name: string) => css.getPropertyValue(name).trim();
  const shadow = (alpha: number) => `rgb(${color("--shadow")} / ${alpha})`;
  const fonts = await readyFonts();

  // The grid: 7 columns across, cells at most 1.8× taller than wide (as on the page), fitted
  // between the heading and the hidl mark.
  const pad = Math.max(10, w * 0.03);
  const gap = Math.max(3, w * 0.008);
  const top = 16 + 40 + 22 + 18;
  const headerH = 22;
  const bottom = h - (16 + 48 + 12);
  const rows = Math.ceil((input.leadingBlanks + input.days.length) / 7);
  const cellW = (w - pad * 2 - gap * 6) / 7;
  const cellH = Math.min(cellW * 1.8, (bottom - top - headerH - gap * (rows - 1)) / rows);
  const gridH = headerH + rows * cellH + (rows - 1) * gap;
  const gridTop = top + Math.max(0, (bottom - top - gridH) / 2);
  const radius = Math.min(10, cellW * 0.14);

  const covers = input.days.map((d) => d.photos[0] ?? null);
  const urls = covers.map((p) => (p ? (cellW * k > 420 && !p.isVideo ? p.fullUrl : p.thumbUrl) : ""));
  const [images, icon] = await Promise.all([loadAll(urls), loadSameOrigin("/icon-192.png")]);

  ctx.fillStyle = color("--paper");
  ctx.fillRect(0, 0, w, h);

  // Heading, like the page's: the month in the title font, the counts below.
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = `500 34px ${fonts.title}`;
  const labelSize = Math.max(22, Math.min(34, (34 * (w - pad * 2)) / ctx.measureText(input.label).width));
  ctx.font = `500 ${labelSize}px ${fonts.title}`;
  ctx.fillStyle = color("--heading");
  ctx.fillText(fit(ctx, input.label, w - pad * 2), pad, 16 + 34);
  ctx.font = `400 15px ${fonts.body}`;
  ctx.fillStyle = color("--muted");
  ctx.fillText(input.summary, pad, 16 + 34 + 26);

  // Weekdays.
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${Math.min(12, cellW * 0.22)}px ${fonts.body}`;
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0.8px";
  ctx.fillStyle = color("--muted");
  WEEKDAY_LETTERS.forEach((d, i) => {
    const label = cellW < 44 ? d.charAt(0) : d;
    ctx.fillText(label, pad + i * (cellW + gap) + cellW / 2, gridTop + headerH / 2 - 2);
  });
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";

  const numberSize = Math.max(10, Math.min(16, cellW * 0.24));
  input.days.forEach((d, i) => {
    const cell = input.leadingBlanks + i;
    const x = pad + (cell % 7) * (cellW + gap);
    const y = gridTop + headerH + Math.floor(cell / 7) * (cellH + gap);
    const image = images[i];
    const isToday = d.date === input.today;
    // Days still to come are just a number, as on the page.
    const future = d.date > input.today;
    ctx.save();
    if (!future) {
      roundRect(ctx, x, y, cellW, cellH, radius);
      ctx.fillStyle = color("--paper-deep");
      ctx.fill();
    }
    if (image) {
      ctx.save();
      roundRect(ctx, x, y, cellW, cellH, radius);
      ctx.clip();
      drawCover(ctx, image, x, y, cellW, cellH);
      // A soft shade under the date so it reads on bright photos.
      const shade = ctx.createLinearGradient(0, y, 0, y + numberSize * 2.4);
      shade.addColorStop(0, "rgb(0 0 0 / 0.38)");
      shade.addColorStop(1, "rgb(0 0 0 / 0)");
      ctx.fillStyle = shade;
      ctx.fillRect(x, y, cellW, numberSize * 2.4);
      ctx.restore();
    }
    if (isToday) {
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = color("--accent");
      roundRect(ctx, x + 1.25, y + 1.25, cellW - 2.5, cellH - 2.5, radius);
      ctx.stroke();
    }
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.font = `800 ${numberSize}px ${fonts.body}`;
    if (image) {
      ctx.fillStyle = color("--snow");
      setShadow(ctx, "rgb(0 0 0 / 0.6)", 3, 1, k);
    } else {
      ctx.fillStyle = color(isToday ? "--accent" : "--muted");
      if (future) ctx.globalAlpha = 0.5;
    }
    ctx.fillText(String(d.number), x + numberSize * 0.45, y + numberSize * 0.4);
    ctx.globalAlpha = 1;
    clearShadow(ctx);

    if (image && d.photos.length > 1) {
      const text = `+${d.photos.length - 1}`;
      const size = Math.max(8, numberSize * 0.72);
      ctx.font = `700 ${size}px ${fonts.body}`;
      const bw = ctx.measureText(text).width + size;
      const bh = size * 1.6;
      ctx.globalAlpha = 0.72;
      ctx.fillStyle = color("--scrim");
      roundRect(ctx, x + cellW - bw - 4, y + cellH - bh - 4, bw, bh, bh / 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = color("--snow");
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, x + cellW - bw / 2 - 4, y + cellH - bh / 2 - 4);
    }
    ctx.restore();
  });

  drawMark(ctx, { tx: 0, ty: 0, scale: 1, width: w, height: h }, icon, fonts, color, shadow, k);
  return canvas;
}
