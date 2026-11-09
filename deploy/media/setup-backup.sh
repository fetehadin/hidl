#!/usr/bin/env bash
# One-time: makes `hidl-backup:`, the encrypted rclone remote the nightly backups write to, on top
# of a Google Drive remote. Its two passwords are random and saved ONLY in
# media/backup-passwords.txt (readable by you alone). Copy that file into your password manager:
# without it, nobody (including you) can read the backups.
#
#   media/setup-backup.sh [drive-remote:folder]      default: hidl-gdrive:hidl-backups
set -euo pipefail
TARGET="${1:-hidl-gdrive:hidl-backups}"
cd "$(dirname "$0")"
if rclone listremotes | grep -qx 'hidl-backup:'; then echo "hidl-backup: already exists; nothing changed."; exit 0; fi
rclone lsd "${TARGET%%:*}:" >/dev/null 2>&1 || { echo "Can't reach ${TARGET%%:*}: (see docs/storage.md → Google Drive)." >&2; exit 1; }

umask 077
p1=$(openssl rand -base64 30)
p2=$(openssl rand -base64 30)
printf 'hidl backup passwords, made %s\nrclone remote: hidl-backup (type crypt, over %s, standard name encryption)\npassword  = %s\npassword2 = %s\n' \
  "$(date -u +%F)" "$TARGET" "$p1" "$p2" > backup-passwords.txt
# Written straight into rclone's config (obscured, as rclone stores them), never on a command line.
{
  printf '\n[hidl-backup]\ntype = crypt\nremote = %s\nfilename_encryption = standard\ndirectory_name_encryption = true\n' "$TARGET"
  printf 'password = %s\n' "$(printf '%s' "$p1" | rclone obscure -)"
  printf 'password2 = %s\n' "$(printf '%s' "$p2" | rclone obscure -)"
} >> "$(rclone config file | tail -1)"
mkdir -p logs
echo "Made hidl-backup: over $TARGET. Passwords: $(pwd)/backup-passwords.txt (copy it somewhere safe)."
