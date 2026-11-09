// Copies every photo/video file between Supabase Storage (the `photos` bucket) and the
// self-hosted S3 store (Garage), keeping each file's path, and proves each copy with a SHA-256.
// Safe to run any number of times: a file already at the destination with the same checksum is
// skipped, and a different file at the same path is reported, never overwritten.
//
//   node scripts/media/copy-media.mjs [to-s3 | to-supabase] [--dry-run]
//
//   to-s3        the move (default): Supabase → Garage, and fills media_objects for every file
//   to-supabase  the rollback: copies back anything uploaded to Garage after the switch
//
// Needs SUPABASE_URL, SUPABASE_SECRET_KEY, S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID,
// S3_SECRET_ACCESS_KEY (and S3_REGION, default "garage"). See docs/storage.md for how to run it
// on the server. Prints paths and sizes, never keys or links.
import { createHash } from "node:crypto";
import { GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";

const direction = process.argv.find((a) => a === "to-s3" || a === "to-supabase") ?? "to-s3";
const dryRun = process.argv.includes("--dry-run");
const BUCKET = "photos";
const CACHE_CONTROL = "private, max-age=31536000, immutable";

const need = (name) => {
  const v = process.env[name];
  if (!v) throw new Error(`Set ${name}.`);
  return v;
};
const supabase = createClient(need("SUPABASE_URL"), need("SUPABASE_SECRET_KEY"), { auth: { persistSession: false } });
const s3 = new S3Client({
  endpoint: need("S3_ENDPOINT"),
  region: process.env.S3_REGION || "garage",
  forcePathStyle: true,
  credentials: { accessKeyId: need("S3_ACCESS_KEY_ID"), secretAccessKey: need("S3_SECRET_ACCESS_KEY") },
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});
const S3_BUCKET = need("S3_BUCKET");

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const mb = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`;

// --- the two stores, behind the same four calls ---------------------------------------------
const fromSupabase = {
  name: "Supabase",
  async list() {
    const out = [];
    async function walk(prefix) {
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase.storage.from(BUCKET).list(prefix, { limit: 1000, offset });
        if (error) throw error;
        for (const o of data) {
          const path = prefix ? `${prefix}/${o.name}` : o.name;
          if (o.id === null) await walk(path); // a folder
          else out.push({ path, bytes: o.metadata?.size ?? 0, contentType: o.metadata?.mimetype ?? "" });
        }
        if (data.length < 1000) break;
      }
    }
    await walk("");
    return out;
  },
  async get(path) {
    const { data, error } = await supabase.storage.from(BUCKET).download(path);
    if (error) {
      if (/not found/i.test(error.message ?? "")) return null;
      throw error;
    }
    return { body: Buffer.from(await data.arrayBuffer()), contentType: data.type };
  },
  async exists(path) {
    const { data, error } = await supabase.storage.from(BUCKET).list(path.split("/").slice(0, -1).join("/"), { search: path.split("/").pop() });
    if (error) throw error;
    return data.some((o) => o.name === path.split("/").pop());
  },
  async put(path, body, contentType) {
    const { error } = await supabase.storage.from(BUCKET).upload(path, body, { contentType, cacheControl: "31536000", upsert: false });
    if (error) throw error;
  },
};

const fromS3 = {
  name: "Garage",
  async list() {
    const out = [];
    let ContinuationToken;
    do {
      const page = await s3.send(new ListObjectsV2Command({ Bucket: S3_BUCKET, ContinuationToken }));
      for (const o of page.Contents ?? []) out.push({ path: o.Key, bytes: o.Size ?? 0, contentType: "" });
      ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (ContinuationToken);
    return out;
  },
  async get(path) {
    try {
      const res = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: path }));
      return { body: Buffer.from(await res.Body.transformToByteArray()), contentType: res.ContentType ?? "" };
    } catch (e) {
      if (e?.$metadata?.httpStatusCode === 404) return null;
      throw e;
    }
  },
  async exists(path) {
    try {
      await s3.send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: path }));
      return true;
    } catch (e) {
      if (e?.$metadata?.httpStatusCode === 404) return false;
      throw e;
    }
  },
  async put(path, body, contentType) {
    await s3.send(new PutObjectCommand({ Bucket: S3_BUCKET, Key: path, Body: body, ContentType: contentType, CacheControl: CACHE_CONTROL }));
  },
};

const [source, dest] = direction === "to-s3" ? [fromSupabase, fromS3] : [fromS3, fromSupabase];

// --- copy ------------------------------------------------------------------------------------
console.log(`${dryRun ? "DRY RUN: " : ""}copying ${source.name} → ${dest.name}`);
const files = await source.list();
console.log(`${files.length} file(s), ${mb(files.reduce((s, f) => s + f.bytes, 0))} in ${source.name}`);

const counts = { copied: 0, same: 0, conflict: 0, failed: 0 };
const ledger = [];
for (const f of files) {
  try {
    const src = await source.get(f.path);
    if (!src) throw new Error("vanished from the source");
    const sum = sha256(src.body);
    const contentType = f.contentType || src.contentType;
    const userId = f.path.split("/")[0];
    ledger.push({ path: f.path, user_id: userId, bytes: src.body.length, content_type: contentType });

    if (await dest.exists(f.path)) {
      const there = await dest.get(f.path);
      if (there && sha256(there.body) === sum) {
        counts.same++;
        continue;
      }
      counts.conflict++;
      console.log(`CONFLICT ${f.path}: a different file is already there; left both alone`);
      continue;
    }
    if (dryRun) {
      console.log(`would copy ${f.path} (${src.body.length} bytes)`);
      counts.copied++;
      continue;
    }
    await dest.put(f.path, src.body, contentType);
    const check = await dest.get(f.path);
    if (!check || sha256(check.body) !== sum) throw new Error("the copy doesn't match the original");
    counts.copied++;
  } catch (e) {
    counts.failed++;
    console.log(`FAILED ${f.path}: ${e?.message ?? e}`);
  }
}

// Every file in the new store has a record (quota, admin numbers, orphan report).
if (direction === "to-s3" && !dryRun && ledger.length) {
  const { data: users, error: uErr } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (uErr) throw uErr;
  const known = new Set(users.users.map((u) => u.id));
  const rows = ledger
    .filter((r) => known.has(r.user_id))
    .map((r) => ({ ...r, confirmed_at: new Date().toISOString() }));
  const { error } = await supabase.from("media_objects").upsert(rows, { onConflict: "path", ignoreDuplicates: true });
  if (error) {
    counts.failed++;
    console.log(`FAILED recording files in media_objects: ${error.message}`);
  } else {
    console.log(`media_objects: ${rows.length} file(s) recorded (existing records kept)`);
  }
}

// --- prove it --------------------------------------------------------------------------------
const after = dryRun ? [] : await dest.list();
const destPaths = new Set(after.map((f) => f.path));
const missing = dryRun ? [] : files.filter((f) => !destPaths.has(f.path));
console.log(
  `copied ${counts.copied}, already there ${counts.same}, conflicts ${counts.conflict}, failed ${counts.failed}` +
    (dryRun ? "" : `; ${dest.name} now has ${after.length} file(s), missing ${missing.length}`),
);
for (const m of missing) console.log(`MISSING in ${dest.name}: ${m.path}`);
process.exit(counts.failed || counts.conflict || missing.length ? 1 : 0);
