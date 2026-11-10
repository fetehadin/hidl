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
