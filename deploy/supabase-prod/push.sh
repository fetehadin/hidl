#!/usr/bin/env bash
# Pushes deploy/supabase-prod/config.toml (auth URLs, email templates, Google, SMTP) to the
# production Supabase project. Shows the diff and asks before changing anything.
# Secrets come from the environment, e.g. load ~/.config/hidl/prod.env first:
#   SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID, SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET, SMTP_PASS
set -euo pipefail
ref="${HIDL_SUPABASE_REF:-rwgvutoecjwypzoaexcy}"
repo="$(cd "$(dirname "$0")/../.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/supabase"
cp "$repo/deploy/supabase-prod/config.toml" "$work/supabase/config.toml"
cp -r "$repo/supabase/templates" "$work/supabase/templates"
# Free-tier projects only accept custom email templates with custom SMTP configured.
# NO_TEMPLATES=1 pushes everything else and leaves the project's current templates alone.
if [ "${NO_TEMPLATES:-}" = "1" ]; then
  python3 - "$work/supabase/config.toml" <<'PY'
import re, sys
p = sys.argv[1]
s = open(p).read()
s = re.sub(r"^\[auth\.email\.template\.[a-z_]+\][^\[]*", "", s, flags=re.M)
open(p, "w").write(s)
PY
fi
cd "$repo"
pnpm exec supabase config push --workdir "$work" --project-ref "$ref" "$@"
