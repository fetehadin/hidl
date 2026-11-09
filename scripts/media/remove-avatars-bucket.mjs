// One-off, after ..._remove_profile_pictures.sql is live: deletes every file in the old public
// `avatars` bucket, then the bucket. Storage refuses deletes straight from its tables, so this
// goes through the Storage API with the secret key.
//
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SECRET_KEY=... node scripts/media/remove-avatars-bucket.mjs [--yes]
//
// Without --yes it only lists what it would delete.
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error("Set SUPABASE_URL and SUPABASE_SECRET_KEY.");
const apply = process.argv.includes("--yes");
const storage = createClient(url, key, { auth: { persistSession: false } }).storage;
const BUCKET = "avatars";

const { data: buckets, error: bErr } = await storage.listBuckets();
if (bErr) throw bErr;
if (!buckets.some((b) => b.id === BUCKET)) {
  console.log("No avatars bucket: nothing to do.");
  process.exit(0);
}

const paths = [];
const { data: folders, error } = await storage.from(BUCKET).list("", { limit: 1000 });
if (error) throw error;
for (const folder of folders) {
  const { data: files, error: fErr } = await storage.from(BUCKET).list(folder.name, { limit: 1000 });
  if (fErr) throw fErr;
  for (const f of files) paths.push(`${folder.name}/${f.name}`);
}
console.log(`${paths.length} file(s) in ${BUCKET}${apply ? "" : " (dry run, pass --yes to delete)"}`);
if (!apply) process.exit(0);

if (paths.length) {
  const { error: rmErr } = await storage.from(BUCKET).remove(paths);
  if (rmErr) throw rmErr;
}
const { error: delErr } = await storage.deleteBucket(BUCKET);
if (delErr) throw delErr;
console.log("Deleted the files and the bucket.");
