#!/usr/bin/env bash
# Every 15 minutes: emails once a day if the server's main disk is over 80% full or the photo
# disk is over 70% full, or if the photo store has stopped answering.
set -uo pipefail
. "$(dirname "$0")/common.sh"
state="$MEDIA_DIR/state"; mkdir -p "$state"
once_a_day() { # key subject body
  local stamp="$state/$1-$(date -u +%F)"
  [ -e "$stamp" ] && return 0
  touch "$stamp"; find "$state" -type f -mtime +3 -delete
  notify "$2" "$3"; log "alerted: $2"
}
use() { df --output=pcent "$1" | tail -1 | tr -dc 0-9; }

root=$(use /)
[ "$root" -ge 80 ] && once_a_day root "hidl server: main disk ${root}% full" \
  "The server's main disk is ${root}% full. Docker images are usually the easy win: docker image prune -a (after checking). See docs/storage.md."
if mountpoint -q /srv/hidl-media; then
  media=$(use /srv/hidl-media)
  [ "$media" -ge 70 ] && once_a_day media "hidl: photo disk ${media}% full" \
    "The photo disk is ${media}% full (uploads stop at the 37 GiB limit). Look at the admin panel and docs/storage.md → Growing the space."
else
  once_a_day mount "hidl: photo disk NOT mounted" "/srv/hidl-media isn't mounted, so Garage can't start. See docs/storage.md → Troubleshooting."
fi
curl -fsS -o /dev/null --max-time 10 "${GARAGE_LOCAL_URL:-http://127.0.0.1:3900}/" 2>/dev/null || [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "${GARAGE_LOCAL_URL:-http://127.0.0.1:3900}/")" = 403 ] ||
  once_a_day garage "hidl: photo store not answering" "Garage didn't answer on 127.0.0.1:3900. Try: cd /opt/hidl && docker compose up -d garage; docker compose logs garage"
exit 0
