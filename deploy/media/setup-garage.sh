#!/usr/bin/env bash
# One-time (safe to re-run), as the deploy user in /opt/hidl, after setup-disk.sh:
#   * writes garage.toml (with fresh random internal secrets) if there isn't one
#   * starts Garage, gives it the disk, makes the private `hidl-media` bucket with a 37 GiB limit
#     (the rest of the 40 GB disk is for Garage's own bookkeeping)
#   * makes two keys: `hidl-app` (read/write, for the app) and `hidl-backup` (read only)
#   * adds the app's settings to .env WITHOUT printing any secret, leaving STORAGE_PROVIDER alone
#     (the switch is a separate, deliberate step; see docs/storage.md)
#   * sets CORS so only the website can upload/read from a browser
#
#   cd /opt/hidl && SUPABASE_URL=https://<ref>.supabase.co media/setup-garage.sh
set -euo pipefail
cd "$(dirname "$0")/.."
QUOTA="${QUOTA:-37GiB}"
CAPACITY_BYTES=$((37 * 1024 * 1024 * 1024))
SITE="${SITE:-https://hidl.fetehadin.com}"
MEDIA_URL="${MEDIA_URL:-https://media.fetehadin.com}"

mountpoint -q /srv/hidl-media || { echo "The photo disk isn't mounted. Run: sudo media/setup-disk.sh" >&2; exit 1; }
[ -f .env ] || { echo "No .env here; run this from /opt/hidl." >&2; exit 1; }
add_env() { grep -q "^$1=" .env || printf '%s=%s\n' "$1" "$2" >> .env; }

if [ ! -f garage.toml ]; then
  ( umask 077
    cat > garage.toml <<TOML
# Garage for hidl's photos (docs/storage.md). One node, one copy; backups go to Google Drive.
metadata_dir = "/var/lib/garage/meta"
data_dir = "/var/lib/garage/data"
db_engine = "sqlite"
metadata_auto_snapshot_interval = "6h"
replication_factor = 1
rpc_bind_addr = "[::]:3901"
rpc_secret = "$(openssl rand -hex 32)"

[s3_api]
s3_region = "garage"
api_bind_addr = "[::]:3900"

[admin]
api_bind_addr = "127.0.0.1:3903"
admin_token = "$(openssl rand -base64 32)"
TOML
  )
  echo "Wrote garage.toml."
fi

add_env COMPOSE_PROFILES media
docker compose up -d garage
G="docker compose exec -T garage /garage"
for _ in $(seq 1 20); do $G status >/dev/null 2>&1 && break; sleep 1; done

if $G status | grep -q "NO ROLE ASSIGNED"; then
  node_id=$($G node id -q | cut -d@ -f1)
  version=$($G layout show | sed -n 's/.*Current cluster layout version: \([0-9]*\).*/\1/p')
  $G layout assign -z hidl -c 38G "$node_id" >/dev/null
  $G layout apply --version $((version + 1)) >/dev/null
  echo "Gave Garage its disk."
fi

$G bucket info hidl-media >/dev/null 2>&1 || $G bucket create hidl-media >/dev/null
$G bucket set-quotas hidl-media --max-size "$QUOTA" >/dev/null
for key in hidl-app hidl-backup; do
  $G key info "$key" >/dev/null 2>&1 || $G key create "$key" >/dev/null
done
$G bucket allow --read --write --owner hidl-media --key hidl-app >/dev/null
$G bucket allow --read hidl-media --key hidl-backup >/dev/null

secret_of() { $G key info "$1" --show-secret | awk -v want="$2" '$1" "$2 == want {print $3}'; }
if ! grep -q '^S3_ACCESS_KEY_ID=' .env; then
  add_env S3_ACCESS_KEY_ID "$(secret_of hidl-app 'Key ID:')"
  add_env S3_SECRET_ACCESS_KEY "$(secret_of hidl-app 'Secret key:')"
  echo "Added hidl's key to .env (not shown)."
fi
add_env S3_PUBLIC_URL "$MEDIA_URL"
add_env S3_ENDPOINT http://garage:3900
add_env S3_REGION garage
add_env S3_BUCKET hidl-media
add_env MEDIA_CAPACITY_BYTES "$CAPACITY_BYTES"
[ -n "${SUPABASE_URL:-}" ] && add_env SUPABASE_URL "$SUPABASE_URL"

if [ ! -f media/backup.env ]; then
  ( umask 077
    { echo "# Read-only Garage key for the nightly backup (media/backup-media.sh). Never printed."
      echo "BACKUP_S3_ACCESS_KEY_ID=$(secret_of hidl-backup 'Key ID:')"
      echo "BACKUP_S3_SECRET_ACCESS_KEY=$(secret_of hidl-backup 'Secret key:')"
    } > media/backup.env )
  echo "Wrote media/backup.env (not shown)."
fi

media/run-tool.sh set-cors.mjs "$SITE"
$G bucket info hidl-media | grep -E "Size|Objects|maximum size"
echo "Done. STORAGE_PROVIDER is unchanged: $(grep '^STORAGE_PROVIDER=' .env || echo 'not set (= supabase)')."
