/**
 * Browser-side resize so phone photos upload fast and stay well under limits.
 * Uses the EXIF orientation, re-encodes as WebP (JPEG where WebP encoding isn't supported).
 */
export type ProcessedImage = { full: Blob; thumb: Blob; ext: "webp" | "jpg"; type: string };

const FULL_EDGE = 1600;
const THUMB_EDGE = 480;

async function encode(bitmap: ImageBitmap, maxEdge: number, quality: number) {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);

  const toBlob = (type: string) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  const webp = await toBlob("image/webp");
  if (webp && webp.type === "image/webp") return webp;
  const jpeg = await toBlob("image/jpeg");
  if (!jpeg) throw new Error("Couldn't encode the image.");
  return jpeg;
}

export async function processImage(file: File): Promise<ProcessedImage> {
  if (!file.type.startsWith("image/")) throw new Error("That file isn't an image.");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("This browser can't read that image format. Try a JPEG or PNG.");
  }
  try {
    const full = await encode(bitmap, FULL_EDGE, 0.85);
    const thumb = await encode(bitmap, THUMB_EDGE, 0.75);
    const type = full.type;
    // Keep both files in the same format so their paths match.
    if (thumb.type !== type) throw new Error("Couldn't encode the image.");
    return { full, thumb, type, ext: type === "image/webp" ? "webp" : "jpg" };
  } finally {
    bitmap.close();
  }
}
