// Re-seals every server-sealed letter under a new LETTER_SECRET_KEY.
//
// When the key may have leaked, or just from time to time:
//   1. In /opt/hidl/.env, move the current key to LETTER_SECRET_KEY_PREVIOUS and put a new one
//      (`openssl rand -base64 32`) in LETTER_SECRET_KEY, then `docker compose up -d`. Letters
//      open with either key meanwhile (src/lib/letter-crypto.ts).
//   2. Run this inside the app container, where both keys and the Supabase secret key are set:
//        ssh deploy@<server> 'cd /opt/hidl && docker compose exec -T web node --input-type=module -' \
//          < scripts/rotate-letter-key.mjs
//   3. When it reports nothing left under the previous key, delete LETTER_SECRET_KEY_PREVIOUS from
//      .env and `docker compose up -d` again. The old key now opens nothing.
//
// It never prints letter text. Each body is swapped only if it's unchanged since it was read
// (rotate_letter_body), so it's safe to run while people use the app, and safe to run twice.
// No dependencies, so it runs as is in the standalone image. The format must match letter-crypto.ts.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const FORMAT = /^srv1\.([A-Za-z0-9+/]{16})\.([A-Za-z0-9+/]+={0,2})$/;

function key(name) {
  const buf = Buffer.from(process.env[name]?.trim() ?? "", "base64");
  if (buf.length !== 32) throw new Error(`${name} must be 32 bytes in base64`);
  return buf;
}

function open(body, k, userId) {
  const [, iv, data] = FORMAT.exec(body);
  const bytes = Buffer.from(data, "base64");
  const d = createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64"));
  d.setAAD(Buffer.from(userId));
  d.setAuthTag(bytes.subarray(bytes.length - 16));
  return Buffer.concat([d.update(bytes.subarray(0, bytes.length - 16)), d.final()]).toString("utf8");
}

function seal(text, k, userId) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", k, iv);
  c.setAAD(Buffer.from(userId));
  const out = Buffer.concat([c.update(text, "utf8"), c.final(), c.getAuthTag()]);
  return `srv1.${iv.toString("base64")}.${out.toString("base64")}`;
}

const current = key("LETTER_SECRET_KEY");
const previous = key("LETTER_SECRET_KEY_PREVIOUS");
if (current.equals(previous)) throw new Error("LETTER_SECRET_KEY and LETTER_SECRET_KEY_PREVIOUS are the same");

const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY must be set");
const headers = { apikey: secret, Authorization: `Bearer ${secret}`, "Content-Type": "application/json" };

const res = await fetch(`${url}/rest/v1/letters?select=id,user_id,body&encrypted=is.false&body=like.srv1.*`, { headers });
if (!res.ok) throw new Error(`Listing letters failed: ${res.status} ${await res.text()}`);
const letters = await res.json();

const tally = { current: 0, rotated: 0, changed: 0, unreadable: 0 };
for (const l of letters) {
  try {
    open(l.body, current, l.user_id);
    tally.current++;
    continue;
  } catch {}
  let text;
  try {
    text = open(l.body, previous, l.user_id);
  } catch {
    tally.unreadable++;
    console.error(`Letter ${l.id} opens with neither key`);
    continue;
  }
  const r = await fetch(`${url}/rest/v1/rpc/rotate_letter_body`, {
    method: "POST",
    headers,
    body: JSON.stringify({ letter_id: l.id, old_body: l.body, new_body: seal(text, current, l.user_id) }),
  });
  if (!r.ok) throw new Error(`Re-sealing ${l.id} failed: ${r.status} ${await r.text()}`);
  if (await r.json()) tally.rotated++;
  else tally.changed++;
}

console.log(
  `${letters.length} server-sealed letters: ${tally.rotated} re-sealed now, ${tally.current} already on the new key, ` +
    `${tally.changed} changed meanwhile (run again), ${tally.unreadable} opening with neither key.`,
);
if (tally.changed || tally.unreadable) process.exitCode = 1;
else console.log("Nothing is left under the previous key: LETTER_SECRET_KEY_PREVIOUS can be removed.");
