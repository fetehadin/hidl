#!/usr/bin/env bash
# Proves the backups can be restored. Run it any time (and it runs monthly):
#   1. picks a random photo, restores it from the Google Drive backup, decrypts it, and checks it
#      is byte-for-byte the live file (and that it really is an image or video);
#   2. checks the newest database dump is under 2 days old and readable.
# Restored copies go to a temporary folder that's deleted afterwards. Exit 0 = all good.
set -euo pipefail
. "$(dirname "$0")/common.sh"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
ok=true

file=$(rclone lsf -R --files-only garage:hidl-media | shuf -n 1 || true)
if [ -z "$file" ]; then
  log "photos: the bucket is empty, nothing to test"
else
  rclone copyto "${BACKUP_REMOTE}media/current/$file" "$tmp/restored"
  rclone copyto "garage:hidl-media/$file" "$tmp/live"
  if cmp -s "$tmp/restored" "$tmp/live"; then
    log "photos: PASS restored $file ($(stat -c %s "$tmp/restored") bytes, $(file -b --mime-type "$tmp/restored")), identical to the live file"
  else
    log "photos: FAIL $file from the backup differs from the live file"; ok=false
  fi
fi

latest=$(rclone lsf --files-only "${BACKUP_REMOTE}db" 2>/dev/null | sort | tail -1 || true)
if [ -z "$latest" ]; then
  log "database: FAIL no dump found"; ok=false
else
  day=${latest#hidl-}; day=${day%.dump}
  if [[ "$day" < "$(date -u -d '-2 days' +%F)" ]]; then log "database: FAIL newest dump is from $day"; ok=false; fi
  rclone copyto "${BACKUP_REMOTE}db/$latest" "$tmp/db.dump"
  tables=$(docker run --rm -v "$tmp:/d:ro" postgres:17-alpine pg_restore --list /d/db.dump | grep -c "TABLE DATA" || true)
  if [ "$tables" -gt 5 ]; then log "database: PASS $latest is readable ($tables tables)"; else log "database: FAIL $latest looks empty"; ok=false; fi
fi

$ok || { notify "hidl: restore test FAILED" "restore-test.sh found a problem at $(date -u). See $MEDIA_DIR/logs/backup.log."; exit 1; }
