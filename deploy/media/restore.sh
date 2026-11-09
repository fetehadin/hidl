#!/usr/bin/env bash
# Puts files back into the photo bucket from the Google Drive backup. Never overwrites a file
# that's already there.
#
#   media/restore.sh find <part of a name>        where is it in the backup (current and old/<date>)?
#   media/restore.sh file <backup path>           e.g. old/2026-11-20/<user id>/2026-11-19-ab12….webp
#   media/restore.sh all                          everything in current/ that's missing (after losing the disk)
set -euo pipefail
. "$(dirname "$0")/common.sh"
use_app_key
case "${1:-}" in
  find)
    rclone lsf -R --files-only "${BACKUP_REMOTE}media" | grep -F -- "${2:?what to look for}" ;;
  file)
    src="${2:?which file}"
    dest="${src#current/}"; dest="${dest#old/*/}"
    rclone copyto --ignore-existing "${BACKUP_REMOTE}media/$src" "garagerw:hidl-media/$dest" -v ;;
  all)
    rclone copy --ignore-existing "${BACKUP_REMOTE}media/current" garagerw:hidl-media --transfers 4 -v ;;
  *)
    sed -n '2,8p' "$0"; exit 2 ;;
esac
