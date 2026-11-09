#!/usr/bin/env bash
# Nightly: mirrors the photo bucket to Google Drive, encrypted (rclone crypt). A file that's
# changed or deleted is first moved to old/<date>/, and those folders are kept KEEP_DAYS (28) days,
# so anything deleted by mistake can be got back for four weeks. Emails if it fails.
set -euo pipefail
. "$(dirname "$0")/common.sh"
trap 'notify "hidl: photo backup FAILED" "backup-media.sh failed at $(date -u). See $MEDIA_DIR/logs/backup.log."' ERR

today=$(date -u +%F)
log "photo backup starting"
rclone sync garage:hidl-media "${BACKUP_REMOTE}media/current" --backup-dir "${BACKUP_REMOTE}media/old/$today" \
  --transfers 4 -q
# Old versions: folders are named by date; drop the ones past the keep window.
cutoff=$(date -u -d "-$KEEP_DAYS days" +%F)
for dir in $(rclone lsf --dirs-only "${BACKUP_REMOTE}media/old" 2>/dev/null); do
  d=${dir%/}
  [[ "$d" < "$cutoff" ]] && rclone purge "${BACKUP_REMOTE}media/old/$d" && log "dropped old/$d"
done
log "photo backup done: $(rclone size --json garage:hidl-media | python3 -c 'import json,sys; s=json.load(sys.stdin); print(s["count"], "files,", round(s["bytes"]/1048576, 1), "MB")')"
