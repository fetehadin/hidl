// Checks the photo store end to end through its public address, the way a browser uses it: a signed
// view works and an unsigned one doesn't, only the website passes CORS, an upload link refuses a
// different size and accepts the right file. Uploads one tiny test file and deletes it. Run after
// any change to Caddy, Garage, DNS or CORS:
//
//   /opt/hidl/media/run-tool.sh live-check.mjs
import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand, DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
const cfg = { region: "garage", forcePathStyle: true, requestChecksumCalculation: "WHEN_REQUIRED",
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY } };
const pub = new S3Client({ ...cfg, endpoint: process.env.S3_PUBLIC_URL });
const int = new S3Client({ ...cfg, endpoint: "http://garage:3900" });
const B = "hidl-media", site = "https://hidl.fetehadin.com";
const key = (await int.send(new ListObjectsV2Command({ Bucket: B, MaxKeys: 1 }))).Contents[0].Key;
const view = await getSignedUrl(pub, new GetObjectCommand({ Bucket: B, Key: key }), { expiresIn: 60 });
let r = await fetch(view, { headers: { Origin: site } });
console.log(`view a photo through ${new URL(view).host}: ${r.status}, ${r.headers.get("content-type")}, ${(await r.arrayBuffer()).byteLength} bytes, CORS ${r.headers.get("access-control-allow-origin")}`);
r = await fetch(new URL(view).origin + new URL(view).pathname); console.log(`same photo without a signature: ${r.status} (must be 403)`);
const test = "00000000-0000-4000-8000-000000000000/2026-11-09-livecheck0000000.webp";
const body = new Uint8Array([...new TextEncoder().encode("RIFF"), 0, 0, 0, 0, ...new TextEncoder().encode("WEBPVP8 ")]);
const put = await getSignedUrl(pub, new PutObjectCommand({ Bucket: B, Key: test, ContentType: "image/webp", ContentLength: body.length, CacheControl: "private, max-age=31536000, immutable" }),
  { expiresIn: 300, signableHeaders: new Set(["content-type", "content-length", "cache-control"]), unhoistableHeaders: new Set(["cache-control"]) });
r = await fetch(put, { method: "OPTIONS", headers: { Origin: site, "Access-Control-Request-Method": "PUT", "Access-Control-Request-Headers": "content-type,cache-control" } });
console.log(`browser upload check (CORS) from ${site}: ${r.status}, allowed ${r.headers.get("access-control-allow-origin")}`);
r = await fetch(put, { method: "OPTIONS", headers: { Origin: "https://evil.example", "Access-Control-Request-Method": "PUT" } });
console.log(`same from another website: ${r.status} (must not be 200)`);
r = await fetch(put, { method: "PUT", body: new Uint8Array(body.length + 1), headers: { "content-type": "image/webp", "cache-control": "private, max-age=31536000, immutable" } });
console.log(`upload a different size: ${r.status} (must be 403)`);
r = await fetch(put, { method: "PUT", body, headers: { "content-type": "image/webp", "cache-control": "private, max-age=31536000, immutable", Origin: site } });
console.log(`upload through Caddy: ${r.status} (must be 200)`);
await int.send(new DeleteObjectCommand({ Bucket: B, Key: test }));
console.log("test file removed");
