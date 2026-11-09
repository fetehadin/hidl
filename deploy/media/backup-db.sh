#!/usr/bin/env bash
# Nightly: a dump of hidl's Supabase database (the public and auth schemas: every table hidl uses,
# and the accounts) to Google Drive, encrypted, kept KEEP_DAYS (28) days. Supabase's free plan has
# no downloadable backups, so this is the only copy outside Supabase. Emails if it fails.
#
# Needs SUPABASE_DB_URL in media/backup.env: Supabase → Connect → "Session pooler" URI, with the
# database password filled in (docs/storage.md).
set -euo pipefail
. "$(dirname "$0")/common.sh"
trap 'notify "hidl: database backup FAILED" "backup-db.sh failed at $(date -u). See $MEDIA_DIR/logs/backup.log."' ERR
[ -n "${SUPABASE_DB_URL:-}" ] || { log "SUPABASE_DB_URL missing in media/backup.env"; exit 1; }

name="hidl-$(date -u +%F).dump"
log "database backup starting"
docker run --rm --network host -e PGURL="$SUPABASE_DB_URL" postgres:17-alpine \
  sh -c 'pg_dump "$PGURL" --format=custom --no-owner --no-privileges --schema=public --schema=auth' |
  rclone rcat "${BACKUP_REMOTE}db/$name"
size=$(rclone size --json "${BACKUP_REMOTE}db/$name" | python3 -c 'import json,sys; print(json.load(sys.stdin)["bytes"])')
[ "$size" -gt 1000 ] || { log "dump is only $size bytes"; false; }
rclone delete --min-age "${KEEP_DAYS}d" "${BACKUP_REMOTE}db"
log "database backup done: $name, $size bytes"
