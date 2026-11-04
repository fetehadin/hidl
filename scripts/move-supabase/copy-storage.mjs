// Copies every file in the `photos` bucket from the old Supabase project to the new one,
// keeping the exact paths the `photos` rows point at. Safe to re-run: files already in the
// new project are skipped. Reads OLD_/NEW_SUPABASE_URL and OLD_/NEW_SECRET_KEY from the
// environment (move.sh loads them). `--dry-run` only lists and counts.
import { createClient } from "@supabase/supabase-js";

const BUCKET = "photos";
const dryRun = process.argv.includes("--dry-run");
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const from = createClient(process.env.OLD_SUPABASE_URL, process.env.OLD_SECRET_KEY, opts);
const to = createClient(process.env.NEW_SUPABASE_URL, process.env.NEW_SECRET_KEY, opts);

/** All file paths under `prefix`, following folders (paths are <user_id>/<file>). */
async function listAll(client, prefix = "") {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await client.storage.from(BUCKET).list(prefix, { limit: 1000, offset });
    if (error) throw error;
    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      // Folders have no id; files do.
      if (item.id === null) out.push(...(await listAll(client, path)));
      else out.push({ path, type: item.metadata?.mimetype, size: item.metadata?.size ?? 0 });
    }
    if (data.length < 1000) return out;
  }
}

const files = await listAll(from);
const bytes = files.reduce((n, f) => n + f.size, 0);
console.log(`   ${files.length} files, ${(bytes / 1e6).toFixed(1)} MB in the old project`);
if (dryRun) process.exit(0);

const existing = new Set((await listAll(to)).map((f) => f.path));
let copied = 0;
let skipped = 0;
const failed = [];

// A few at a time: fast, without tripping rate limits.
const queue = [...files];
async function worker() {
  for (let f = queue.shift(); f; f = queue.shift()) {
    if (existing.has(f.path)) {
      skipped++;
      continue;
    }
    const { data, error } = await from.storage.from(BUCKET).download(f.path);
    if (error) {
      failed.push(`${f.path}: ${error.message}`);
      continue;
    }
    const { error: upErr } = await to.storage.from(BUCKET).upload(f.path, data, { contentType: f.type, upsert: false });
    if (upErr) failed.push(`${f.path}: ${upErr.message}`);
    else copied++;
  }
}
await Promise.all(Array.from({ length: 6 }, worker));

console.log(`   copied ${copied}, already there ${skipped}, failed ${failed.length}`);
if (failed.length) {
  console.error(failed.join("\n"));
  process.exit(1);
}
