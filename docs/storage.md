# Photo and video storage

Where hidl keeps photo and video files, how it's kept safe and backed up, and what to do when
something goes wrong. Written to be read in a hurry.

## The short version

- Files live in **Garage**, a small S3-compatible storage server (it speaks the same language as
  Amazon S3), running in Docker **on the Contabo VPS**, in a private bucket called `hidl-media`.
- Garage has its **own 40 GB disk** (a disk image file, `/srv/hidl-media.img`, mounted at
  `/srv/hidl-media`). Photos can never fill the server's main disk or affect the other apps.
  The bucket itself stops at **37 GiB**; the rest is room for Garage's own bookkeeping.
- Each person has **2 GB** of photo space. From 90% they see how much they've used (upload sheet
  and Account); at 100% uploads stop with a clear message.
- Every night the bucket is copied, **encrypted**, to Google Drive. So is the database.
- One setting switches between Garage and the old Supabase Storage: `STORAGE_PROVIDER` in
  `/opt/hidl/.env` (`s3` or `supabase`). That's also the rollback.
- It costs nothing extra: it uses the VPS you already pay for and your Google Drive.

## How a photo travels

```
1. Browser: "I want to upload a 120 KB photo for 9 Nov"          → hidl server (prepareUpload)
2. Server: signed in? reserve_media() in Postgres: own folder? ≤ 5 MB? allowed type?
           under 2 GB? under 120 files this hour?  → records the file in media_objects
3. Server → browser: an upload link valid 5 minutes, locked to that path, that size, that type
4. Browser → https://media.fetehadin.com (Caddy → Garage): uploads the file directly.
           The app server never touches the file.
5. Browser → server (addPhoto): the server reads the stored file's size, type and first bytes.
           Anything different from what was reserved, or not really an image/video: deleted, refused.
6. Viewing: the server signs 15-minute view links, only for the user's own photos. Pages renew them
           every 12 minutes (MediaLinkRefresher). The phone/browser keeps each photo after the first
           view (public/sw.js), so most photos load instantly.
```

The code: `src/lib/storage/` (one module; nothing else knows which store is in use),
`src/actions/photos.ts`, `src/lib/data/photos.ts`, the `media_objects` migration.

### Who can see what

- The bucket is **private**. Without a valid signature Garage answers 403. Links expire; changing
  anything in a link breaks its signature.
- Only the server can sign links, and it only signs paths inside the signed-in user's folder
  (`<user id>/...`). User A can never get a link for user B's photo.
- `media_objects` has no grants for users: they can't read it, lie about sizes, or "forget" a file
  to free space. The server writes it with the service role, always together with the file.
- Refused requests are logged as `media-denied` (who, what, why; never links or keys):
  `docker compose logs web | grep media-denied`.
- Admins see counts and sizes, never photos.

### Why photos aren't cached by Cloudflare

`media.fetehadin.com` is "DNS only" (grey cloud) in Cloudflare. If Cloudflare cached private
links, a copied link could keep working after it expired. Instead, files are stored with
`Cache-Control: private, max-age=31536000, immutable` and the app's service worker keeps them on the
device by path. Trade-off: the first view of a photo comes from the server in Germany; after that
it's instant. Paths never change (a replaced photo gets a new path), so a cached copy is never stale.

## On the server

```
/opt/hidl/
  docker-compose.yml        has the `garage` service (profile "media")
  docker-compose.override.yml   server-only: joins web and garage to tajstore's network
  garage.toml               Garage's config (internal secrets; 600)
  .env                      STORAGE_PROVIDER, S3_*, MEDIA_CAPACITY_BYTES, SUPABASE_URL, REPORT_EMAIL, COMPOSE_PROFILES=media
  media/                    copy of deploy/media/ from the repo
    setup-disk.sh  setup-garage.sh  setup-backup.sh
    backup-media.sh  backup-db.sh  restore-test.sh  restore.sh  check-space.sh  run-tool.sh
    common.sh  crontab.txt
    tools/                  copy-media, set-cors, orphan-report, live-check, remove-avatars-bucket (Node, run in Docker)
    backup.env              read-only Garage key + SUPABASE_DB_URL (600)
    backup-passwords.txt    the backup encryption passwords (600) — ALSO keep a copy in your password manager
    logs/
/srv/hidl-media.img          the 40 GB disk (mounted at /srv/hidl-media)
```

`media.fetehadin.com` is a block in tajstore's Caddyfile (`/opt/tajstore/Caddyfile`), because
that Caddy owns ports 80/443:

```
media.fetehadin.com {
	header -Server
	request_body {
		max_size 6MB
	}
	reverse_proxy hidl-garage:3900
}
```

### Scheduled jobs (`media/crontab.txt`, in the deploy user's crontab)

| When (UTC) | What |
| --- | --- |
| every 15 min | `check-space.sh`: email if the main disk > 80%, the photo disk > 70%, it isn't mounted, or Garage doesn't answer (once a day per problem) |
| 01:40 daily | `backup-media.sh`: bucket → Google Drive, encrypted; changed/deleted files kept 28 days |
| 02:10 daily | `backup-db.sh`: database (public + auth schemas) → Google Drive, encrypted, 28 days |
| 09:00 on the 1st | `orphan-report.mjs --email`: files/records/photos that disagree. **Never deletes.** |
| 09:30 on the 1st | `restore-test.sh`: restores a random photo and the newest database dump and checks them |

Emails go to `REPORT_EMAIL` (in `.env`) through Resend, with the app's own key.

## Backups and restoring

**Check backups work** (any time, takes a minute):

```bash
cd /opt/hidl && media/restore-test.sh
```

It restores a random photo from Google Drive, decrypts it, compares it byte for byte with the live
file, and checks the newest database dump opens. `PASS` twice = good.

**Get back a deleted photo** (within 28 days). Deleted and replaced files sit in `old/<date>/`:

```bash
cd /opt/hidl
media/restore.sh find 2026-11-19-ab12           # any part of the file name
media/restore.sh file old/2026-11-20/<user id>/2026-11-19-ab12….webp
```

Restore both files (the photo and its `-thumb` file). The photo's row was deleted too, so it
won't show until it's added back, in the Supabase SQL editor:

```sql
insert into public.photos (user_id, date, media_type, image_path, thumb_path)
values ('<user id>', '2026-11-19', 'image', '<user id>/2026-11-19-ab12….webp', '<user id>/2026-11-19-ab12…-thumb.webp');
insert into public.media_objects (path, user_id, bytes, content_type, confirmed_at)
values ('<path>', '<user id>', <size in bytes>, 'image/webp', now());   -- one per file, so it counts in their space
```

`restore.sh` never overwrites a file that's already there.

**Restore everything** after losing the photo disk:

```bash
sudo media/setup-disk.sh && media/setup-garage.sh   # a fresh, empty store (keys in .env are kept)
media/restore.sh all                                # copies back every file from current/
media/run-tool.sh orphan-report.mjs                 # "Photos whose file is missing: 0" = done
```

**Restore the database**: download the dump (`rclone copyto hidl-backup:db/hidl-<date>.dump .`)
and use `pg_restore` into a fresh Supabase project (see `scripts/move-supabase/` for the target
setup). Practise this on a test project before you need it.

**Without `backup-passwords.txt` the backups can't be read.** Keep a copy outside the server.

### Google Drive

The backups use their own rclone remote, `hidl-gdrive:`, with your own Google client ID (rclone's
shared one is being retired in 2026). One-time setup:

1. [console.cloud.google.com](https://console.cloud.google.com) → new project "hidl backups" →
   APIs & Services → Library → enable **Google Drive API**.
2. OAuth consent screen → External → your email as a test user. Credentials → Create credentials →
   OAuth client ID → **Desktop app**. Keep the client ID and secret.
3. On your laptop: `rclone authorize "drive" "<client id>" "<client secret>"` → sign in → it prints
   a token.
4. On the server: `rclone config` → n → name `hidl-gdrive` → `drive` → paste client id and secret →
   scope `drive.file` → no advanced config → **no** auto config → paste the token.
5. `media/setup-backup.sh hidl-gdrive:hidl-backups` → then copy `media/backup-passwords.txt` into
   your password manager.

TajStore's backups use the older `gdrive:` remote with the shared client ID; they need the same fix
before it's retired.

## Switching, and rolling back

The app works with either store; Postgres keeps the same records for both.

**Switch to Garage:**

```bash
cd /opt/hidl
media/run-tool.sh copy-media.mjs to-s3 --dry-run   # what it would copy
media/run-tool.sh copy-media.mjs to-s3             # copy + SHA-256 check of every file
sed -i 's/^STORAGE_PROVIDER=.*/STORAGE_PROVIDER=s3/' .env || true
grep -q '^STORAGE_PROVIDER=' .env || echo 'STORAGE_PROVIDER=s3' >> .env
docker compose up -d web
```

`copy-media.mjs` is safe to run any number of times: it skips files already copied (same checksum)
and never overwrites a different file.

**Roll back to Supabase (about a minute):**

```bash
cd /opt/hidl
sed -i 's/^STORAGE_PROVIDER=.*/STORAGE_PROVIDER=supabase/' .env && docker compose up -d web
media/run-tool.sh copy-media.mjs to-supabase       # photos uploaded since the switch
```

Keep the old Supabase files until two weeks after the switch, then delete them in the Supabase
dashboard (Storage → photos).

## When something goes wrong

**Photos don't load (broken images).**
0. `cd /opt/hidl && media/run-tool.sh live-check.mjs` tests the whole path in a few seconds.
1. `curl -sI https://media.fetehadin.com/` → expect `403` (alive, private). No answer → step 2.
2. `cd /opt/hidl && docker compose ps garage` and `docker compose logs --tail 50 garage`.
   Not running: `docker compose up -d garage`.
3. `mountpoint /srv/hidl-media` → if "not a mountpoint": `sudo mount /srv/hidl-media`, then step 2.
4. Still broken: roll back (above) and look at it calmly.

**Uploads fail.**
- One person, "photo space is full": they're at 2 GB. Delete photos, or raise the limit (a
  migration changing `media_quota_bytes()` and `MEDIA_QUOTA_BYTES` in `src/lib/media.ts`).
- Everyone: the bucket hit 37 GiB (`docker compose exec garage /garage bucket info hidl-media`),
  or Garage is down (above), or CORS (browser console says "CORS"): `media/run-tool.sh set-cors.mjs https://hidl.fetehadin.com`.
- `docker compose logs web | grep -E "media-denied|prepareUpload|verifyUploads"`.

**The main disk fills up.** Photos can't do this (their disk is separate). Usually Docker:
`docker system df`, then `docker image prune -a` and `docker builder prune` (they only remove unused
things, but read what they list first).

**The photo disk fills up.** See "Growing the space".

## Growing the space

The disk image can grow while the server keeps running (needs free space on the main disk):

```bash
sudo fallocate -l 60G /srv/hidl-media.img          # new total size
sudo losetup -c "$(losetup -j /srv/hidl-media.img | cut -d: -f1)"
sudo resize2fs "$(losetup -j /srv/hidl-media.img | cut -d: -f1)"
cd /opt/hidl
docker compose exec garage /garage layout assign -z hidl -c 58G "$(docker compose exec -T garage /garage node id -q | cut -d@ -f1)"
docker compose exec garage /garage layout apply --version <current + 1>
docker compose exec garage /garage bucket set-quotas hidl-media --max-size 57GiB
# and MEDIA_CAPACITY_BYTES in .env (57 GiB = 61203283968), then: docker compose up -d web
```

When the VPS disk itself runs out, the next step is Contabo Object Storage (about $3 per 250 GB a
month): `STORAGE_PROVIDER=s3` already works with it; point `S3_PUBLIC_URL`/`S3_ENDPOINT` at it and
copy the files with `rclone`.

## Testing locally

`pnpm test:integration` runs `tests/integration/media-store.test.ts` against an S3 store when
`.env.test.local` (not committed) has its settings; without them that file is skipped and the rest
runs against Supabase Storage. A local Garage:

```bash
mkdir -p /tmp/garage/{meta,data} && cd /tmp/garage
printf 'metadata_dir="/var/lib/garage/meta"\ndata_dir="/var/lib/garage/data"\ndb_engine="sqlite"\nreplication_factor=1\nrpc_bind_addr="[::]:3901"\nrpc_secret="%s"\n[s3_api]\ns3_region="garage"\napi_bind_addr="[::]:3900"\n' "$(openssl rand -hex 32)" > garage.toml
docker run -d --name garage-dev -p 127.0.0.1:3910:3900 -v $PWD/garage.toml:/etc/garage.toml:ro \
  -v $PWD/meta:/var/lib/garage/meta -v $PWD/data:/var/lib/garage/data dxflrs/garage:v2.4.1
G="docker exec garage-dev /garage"
$G layout assign -z dev -c 1G "$($G node id -q | cut -d@ -f1)" && $G layout apply --version 1
$G bucket create hidl-media && $G key create hidl-dev && $G bucket allow --read --write --owner hidl-media --key hidl-dev
$G key info hidl-dev --show-secret       # the key id and secret for the settings below
```

`.env.test.local` (and `.env.local` too, to use it with `pnpm dev`):

```
STORAGE_PROVIDER=s3
S3_PUBLIC_URL=http://127.0.0.1:3910
S3_REGION=garage
S3_BUCKET=hidl-media
S3_ACCESS_KEY_ID=GK…
S3_SECRET_ACCESS_KEY=…
MEDIA_CAPACITY_BYTES=1073741824
```

Then allow the dev site in CORS: `cd deploy/media/tools && npm ci && set -a && . ../../../.env.local && set +a &&
S3_ENDPOINT=$S3_PUBLIC_URL node set-cors.mjs http://localhost:3000`.

The server scripts were tested the same way, against a scratch folder standing in for `/opt/hidl`
and a local folder standing in for Google Drive (`RCLONE_CONFIG` pointed at a scratch config).
