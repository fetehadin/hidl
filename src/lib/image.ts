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

async function encode(source: CanvasImageSource, width: number, height: number, maxEdge: number, quality: number) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, w, h);

  const toBlob = (type: string) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  const webp = await toBlob("image/webp");
  if (webp && webp.type === "image/webp") return webp;
  const jpeg = await toBlob("image/jpeg");
  if (!jpeg) throw new Error("Couldn't encode the image.");
  return jpeg;
}

const extOf = (type: string): ImageExt => (type === "image/webp" ? "webp" : "jpg");

async function processImage(file: File): Promise<ProcessedMedia> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("This browser can't read that image format. Try a JPEG or PNG.");
  }
  try {
    const full = await encode(bitmap, bitmap.width, bitmap.height, FULL_EDGE, 0.85);
    const thumb = await encode(bitmap, bitmap.width, bitmap.height, THUMB_EDGE, 0.75);
    return {
      mediaType: "image",
      full,
      fullType: full.type,
      fullExt: extOf(full.type),
      thumb,
      thumbType: thumb.type,
      thumbExt: extOf(thumb.type),
    };
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
      encode(video, video.videoWidth, video.videoHeight, THUMB_EDGE, 0.75).then(
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
