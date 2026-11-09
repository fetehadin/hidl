# Shared by the backup and check scripts (sourced, not run). Defines the `garage:` rclone remote
# from the read-only backup key, without writing any key into rclone's config file.
MEDIA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HIDL_DIR="$(dirname "$MEDIA_DIR")"
set -a
# shellcheck disable=SC1091
. "$MEDIA_DIR/backup.env"
set +a
export RCLONE_CONFIG_GARAGE_TYPE=s3 RCLONE_CONFIG_GARAGE_PROVIDER=Other RCLONE_CONFIG_GARAGE_REGION=garage \
  RCLONE_CONFIG_GARAGE_ENDPOINT="${GARAGE_LOCAL_URL:-http://127.0.0.1:3900}" RCLONE_CONFIG_GARAGE_FORCE_PATH_STYLE=true \
  RCLONE_CONFIG_GARAGE_ACCESS_KEY_ID="$BACKUP_S3_ACCESS_KEY_ID" RCLONE_CONFIG_GARAGE_SECRET_ACCESS_KEY="$BACKUP_S3_SECRET_ACCESS_KEY"
# Where backups go: an encrypted rclone remote (media/setup-backup.sh makes it).
BACKUP_REMOTE="${BACKUP_REMOTE:-hidl-backup:}"
KEEP_DAYS="${KEEP_DAYS:-28}"
log() { echo "$(date -u +%FT%TZ) $*"; }

# Emails the admin (REPORT_EMAIL) through Resend, using the app's own key. Subject, then body.
notify() {
  local key from to
  key=$(sed -n 's/^RESEND_API_KEY=//p' "$HIDL_DIR/.env" | tr -d '"')
  from=$(sed -n 's/^EMAIL_FROM=//p' "$HIDL_DIR/.env" | tr -d '"')
  to=$(sed -n 's/^REPORT_EMAIL=//p' "$HIDL_DIR/.env" | tr -d '"')
  [ -n "$key" ] && [ -n "$to" ] || { log "no RESEND_API_KEY/REPORT_EMAIL, can't email: $1"; return 0; }
  python3 -c 'import json,sys; print(json.dumps({"from": sys.argv[1], "to": sys.argv[2].split(","), "subject": sys.argv[3], "text": sys.argv[4]}))' \
    "$from" "$to" "$1" "$2" |
    curl -fsS -o /dev/null -X POST https://api.resend.com/emails -H "Authorization: Bearer $key" -H "Content-Type: application/json" -d @- ||
    log "couldn't email: $1"
}

# A writable `garage-rw:` remote, with the app's own key from .env, for restores only.
use_app_key() {
  local id secret
  id=$(sed -n 's/^S3_ACCESS_KEY_ID=//p' "$HIDL_DIR/.env" | tr -d '"')
  secret=$(sed -n 's/^S3_SECRET_ACCESS_KEY=//p' "$HIDL_DIR/.env" | tr -d '"')
  export RCLONE_CONFIG_GARAGERW_TYPE=s3 RCLONE_CONFIG_GARAGERW_PROVIDER=Other RCLONE_CONFIG_GARAGERW_REGION=garage \
    RCLONE_CONFIG_GARAGERW_ENDPOINT="${GARAGE_LOCAL_URL:-http://127.0.0.1:3900}" RCLONE_CONFIG_GARAGERW_FORCE_PATH_STYLE=true \
    RCLONE_CONFIG_GARAGERW_ACCESS_KEY_ID="$id" RCLONE_CONFIG_GARAGERW_SECRET_ACCESS_KEY="$secret"
}
