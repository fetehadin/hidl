import { type ImageExt, MAX_UPLOAD_BYTES, type MediaExt, type MediaType, VIDEO_MIME_TO_EXT, formatMB } from "./media";

/**
 * Browser-side preparation before upload.
 * - Images are resized so phone photos upload fast and stay well under limits: EXIF orientation
 *   applied, re-encoded as WebP (JPEG where WebP encoding isn't supported).
 * - Videos are uploaded as they are (no re-encoding in the browser), so they must already be
 *   5 MB or less; a still frame is grabbed for the thumbnail.
 */
export type ProcessedMedia = {
  mediaType: MediaType;
  full: Blob;
  fullType: string;
  fullExt: MediaExt;
  /** Always an image: the small version of a photo, or a still frame of a video. */
  thumb: Blob;
  thumbType: string;
  thumbExt: ImageExt;
};

const FULL_EDGE = 1600;
const THUMB_EDGE = 480;

let webpSupport: boolean | undefined;
/**
 * Whether this browser can *encode* WebP. Safari can't: asked for WebP, canvas.toBlob quietly
 * returns a PNG instead, which is slow to make and huge. Checked once, so Safari goes
 * straight to JPEG rather than encoding a PNG and throwing it away (twice per photo).
 */
function canEncodeWebp() {
  if (webpSupport === undefined) {
    const c = document.createElement("canvas");
    c.width = c.height = 1;
    webpSupport = c.toDataURL("image/webp").startsWith("data:image/webp");
  }
  return webpSupport;
}

function scaled(source: CanvasImageSource, width: number, height: number, maxEdge: number) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't encode the image."))), type, quality),
  );
}

const imageType = () => (canEncodeWebp() ? "image/webp" : "image/jpeg");
const extOf = (type: string): ImageExt => (type === "image/webp" ? "webp" : "jpg");

/** A small JPEG/WebP of any drawable (a photo's full-size canvas, a video frame). */
async function encodeThumb(source: CanvasImageSource, width: number, height: number) {
  return toBlob(scaled(source, width, height, THUMB_EDGE), imageType(), 0.75);
}

async function processImage(file: File): Promise<ProcessedMedia> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("This browser can't read that image format. Try a JPEG or PNG.");
  }
  try {
    const type = imageType();
    // Scale the (often 12 MP) original down once; the thumbnail comes from that copy, which is
    // far cheaper than shrinking the original a second time. Both encode in parallel.
    const fullCanvas = scaled(bitmap, bitmap.width, bitmap.height, FULL_EDGE);
    bitmap.close();
    const [full, thumb] = await Promise.all([
      toBlob(fullCanvas, type, 0.85),
      toBlob(scaled(fullCanvas, fullCanvas.width, fullCanvas.height, THUMB_EDGE), type, 0.75),
    ]);
    return { mediaType: "image", full, fullType: full.type, fullExt: extOf(full.type), thumb, thumbType: thumb.type, thumbExt: extOf(thumb.type) };
  } finally {
    bitmap.close();
  }
}

/** Some browsers leave File.type empty for videos; fall back to the file name. */
function videoMime(file: File) {
  if (file.type) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase();
  return { mp4: "video/mp4", m4v: "video/mp4", webm: "video/webm", mov: "video/quicktime" }[ext ?? ""] ?? "";
}

/** Loads the video and grabs a frame a little way in (the very first is often black). */
function grabFrame(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    let done = false;
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
      fn();
    };
    const fail = () => finish(() => reject(new Error("This browser can't play that video. Try an MP4.")));
    const timer = setTimeout(fail, 15_000);

    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.onerror = fail;
    video.onloadedmetadata = () => {
      if (!video.videoWidth || !video.videoHeight) return fail();
      video.currentTime = Math.min(0.5, (video.duration || 0) / 2);
    };
    video.onseeked = () => {
      encodeThumb(video, video.videoWidth, video.videoHeight).then(
        (blob) => finish(() => resolve(blob)),
        () => fail(),
      );
    };
    video.src = url;
  });
}

async function processVideo(file: File): Promise<ProcessedMedia> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`Videos can be up to ${formatMB(MAX_UPLOAD_BYTES)}. This one is ${formatMB(file.size)}.`);
  }
  const type = videoMime(file);
  const fullExt = VIDEO_MIME_TO_EXT[type];
  if (!fullExt) throw new Error("Use an MP4, WebM or MOV video.");
  const thumb = await grabFrame(file);
  return { mediaType: "video", full: file, fullType: type, fullExt, thumb, thumbType: thumb.type, thumbExt: extOf(thumb.type) };
}

export async function processMedia(file: File): Promise<ProcessedMedia> {
  if (file.type.startsWith("video/") || (!file.type && /\.(mp4|m4v|webm|mov)$/i.test(file.name))) {
    return processVideo(file);
  }
  if (file.type.startsWith("image/")) return processImage(file);
  throw new Error("That file isn't a photo or a video.");
}

/**
 * A profile picture: the middle square of the photo (EXIF orientation applied), PICTURE_EDGE
 * pixels a side, WebP (JPEG on Safari). Small enough to stay far under the avatars bucket's cap.
 */
export async function processProfilePicture(file: File, edge = 320): Promise<{ blob: Blob; ext: ImageExt }> {
  if (!file.type.startsWith("image/")) throw new Error("Pick a photo (JPEG, PNG, WebP or HEIC).");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("This browser can't read that image format. Try a JPEG or PNG.");
  }
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = Math.min(edge, side);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available.");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, canvas.width, canvas.height);
    const blob = await toBlob(canvas, imageType(), 0.85);
    return { blob, ext: extOf(blob.type) };
  } finally {
    bitmap.close();
  }
}
