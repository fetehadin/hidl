#!/usr/bin/env bash
# Moves hidl's data from one Supabase project to another without losing anything:
# every account (same user ids, so nothing is orphaned), letters (still sealed and still
# end-to-end encrypted: the wrapped keys move with them), countdowns, widget tokens,
# photos and videos, buddies and settings.
#
# Usage:  scripts/move-supabase/move.sh <settings file> [--dry-run]
#
# The settings file (keep it outside the repo, e.g. ~/.config/hidl/move.env) defines:
#   OLD_DB_URL        Postgres connection string of the project being left (Session pooler, port 5432)
#   OLD_SUPABASE_URL  https://<old-ref>.supabase.co
#   OLD_SECRET_KEY    its secret (service role) key, to read photo files
#   NEW_DB_URL        connection string of the new project
#   NEW_SUPABASE_URL  https://<new-ref>.supabase.co
#   NEW_SECRET_KEY    its secret key, to write photo files
#
# Order: the new project gets the schema from supabase/migrations first (`supabase db push`),
# then this script copies data only. Triggers are switched off during the copy
# (session_replication_role = replica) so rows keep their exact timestamps and states.
# Signed-in sessions don't carry over (each project signs its own tokens): people sign in
# once more, into the same account.
set -euo pipefail

settings="${1:?usage: move.sh <settings file> [--dry-run]}"
dry_run="${2:-}"
# shellcheck disable=SC1090
set -a; . "$settings"; set +a
: "${OLD_DB_URL:?}" "${NEW_DB_URL:?}" "${OLD_SUPABASE_URL:?}" "${OLD_SECRET_KEY:?}" "${NEW_SUPABASE_URL:?}" "${NEW_SECRET_KEY:?}"

here="$(cd "$(dirname "$0")" && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

count() { psql "$1" -At -c "select '$2', count(*) from $2" 2>/dev/null || echo "$2|missing"; }
TABLES="auth.users auth.identities public.letters public.letter_keys public.countdowns public.widget_tokens public.photos public.profiles public.user_settings storage.objects"

echo "== Before"
for t in $TABLES; do echo "old $(count "$OLD_DB_URL" "$t")   new $(count "$NEW_DB_URL" "$t")"; done

echo "== Dumping data from the old project"
# Data only: auth (accounts, identities) and public (the app's tables). Storage file rows are
# recreated by uploading the files themselves (copy-storage.mjs), not copied as rows.
pnpm exec supabase db dump --db-url "$OLD_DB_URL" --data-only --use-copy \
  --schema auth,public \
  -x auth.schema_migrations -x auth.audit_log_entries -x auth.flow_state \
  -x auth.sessions -x auth.refresh_tokens -x auth.mfa_amr_claims -x auth.one_time_tokens \
  -f "$work/data.sql"
echo "   $(wc -c < "$work/data.sql") bytes"

if [ "$dry_run" = "--dry-run" ]; then
  echo "== Dry run: dump OK, nothing written."
  node "$here/copy-storage.mjs" --dry-run
  exit 0
fi

echo "== Restoring into the new project (one transaction: all or nothing)"
psql "$NEW_DB_URL" --single-transaction --variable ON_ERROR_STOP=1 \
  --command 'set session_replication_role = replica' \
  --file "$work/data.sql"

echo "== Copying photo and video files"
node "$here/copy-storage.mjs"

echo "== After"
for t in $TABLES; do echo "old $(count "$OLD_DB_URL" "$t")   new $(count "$NEW_DB_URL" "$t")"; done
echo "Every 'new' count should equal 'old' (user_settings may be 0 on both). Done."
