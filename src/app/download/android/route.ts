import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

export const dynamic = "force-dynamic";

/**
 * The Android app (mobile/) as an installable .apk. The file isn't in the repo or the image: it
 * lives on the server in /opt/hidl/downloads, mounted into the container (deploy/docker-compose.yml),
 * so a new build is published by copying one file, with no redeploy. Next only serves public/
 * files that existed at build time, hence a route handler instead.
 */
const APK = path.join(process.env.HIDL_DOWNLOADS_DIR || path.join(process.cwd(), "downloads"), "hidl.apk");

async function apkSize() {
  try {
    return (await stat(APK)).size;
  } catch {
    return null;
  }
}

function headers(size: number) {
  return {
    "Content-Type": "application/vnd.android.package-archive",
    "Content-Disposition": 'attachment; filename="hidl.apk"',
    "Content-Length": String(size),
    // Always the newest build: let browsers keep it, but check back first.
    "Cache-Control": "public, no-cache",
  };
}

const notYet = () => new Response("The Android app isn't available yet.", { status: 404, headers: { "Cache-Control": "no-store" } });

export async function HEAD() {
  const size = await apkSize();
  return size === null ? notYet() : new Response(null, { headers: headers(size) });
}

export async function GET() {
  const size = await apkSize();
  if (size === null) return notYet();
  const body = Readable.toWeb(createReadStream(APK)) as ReadableStream<Uint8Array>;
  return new Response(body, { headers: headers(size) });
}
