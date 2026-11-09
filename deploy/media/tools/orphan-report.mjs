// The monthly orphan report. Compares three lists and says where they disagree:
//   files in the bucket · media_objects records · paths the photos table points at
// It NEVER deletes anything. It prints a report (and emails it, when RESEND_API_KEY, EMAIL_FROM
// and REPORT_EMAIL are set) so a person decides what to remove.
//
//   deploy/media/run-tool.sh orphan-report.mjs [--email]
import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";

const DAY = 24 * 60 * 60 * 1000;
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION || "garage",
  forcePathStyle: true,
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY },
});
const Bucket = process.env.S3_BUCKET || "hidl-media";

async function all(table, columns) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + 999);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

const files = new Map();
let ContinuationToken;
do {
  const page = await s3.send(new ListObjectsV2Command({ Bucket, ContinuationToken }));
  for (const o of page.Contents ?? []) files.set(o.Key, { bytes: o.Size ?? 0, modified: o.LastModified });
  ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
} while (ContinuationToken);

const records = new Map((await all("media_objects", "path, bytes, created_at, confirmed_at")).map((r) => [r.path, r]));
const used = new Set((await all("photos", "image_path, thumb_path")).flatMap((r) => [r.image_path, r.thumb_path]));

// A day's grace: an upload in progress has a file and a record but no photo yet.
const old = (date) => date && Date.now() - new Date(date).getTime() > DAY;
const sections = {
  "Files no photo points at (safe to delete after a look)": [...files]
    .filter(([path, f]) => !used.has(path) && old(f.modified))
    .map(([path, f]) => `${path} (${f.bytes} bytes)`),
  "Files with no record (not counted in anyone's space)": [...files].filter(([path]) => !records.has(path)).map(([path]) => path),
  "Records with no file (counted in someone's space for nothing)": [...records]
    .filter(([path, r]) => !files.has(path) && old(r.created_at))
    .map(([path]) => path),
  "Photos whose file is missing (these show as broken)": [...used].filter((path) => !files.has(path)),
};

const total = Object.values(sections).reduce((n, list) => n + list.length, 0);
const lines = [
  `hidl photo store check, ${new Date().toISOString().slice(0, 10)}`,
  `${files.size} files, ${records.size} records, ${used.size} paths in use. Nothing was deleted.`,
  "",
];
for (const [title, list] of Object.entries(sections)) {
  lines.push(`${title}: ${list.length}`);
  for (const item of list.slice(0, 200)) lines.push(`  ${item}`);
  if (list.length > 200) lines.push(`  …and ${list.length - 200} more`);
}
const report = lines.join("\n");
console.log(report);

if (process.argv.includes("--email") && process.env.RESEND_API_KEY && process.env.REPORT_EMAIL) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: process.env.REPORT_EMAIL.split(","),
      subject: total ? `hidl photo store: ${total} thing(s) to look at` : "hidl photo store: all in order",
      text: report,
    }),
  });
  console.log(res.ok ? "Emailed the report." : `Couldn't email the report (${res.status}).`);
}
