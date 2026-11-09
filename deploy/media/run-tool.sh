#!/usr/bin/env bash
# Runs one of the tools in ./tools (copy-media, set-cors, orphan-report, remove-avatars-bucket) in a
# throwaway Node container on hidl's Docker network, with the server's .env. Nothing is installed
# on the server itself; the first run fetches the pinned packages into ./tools/node_modules.
#
#   /opt/hidl/media/run-tool.sh <tool.mjs> [arguments]
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="${ENV_FILE:-$HERE/../.env}"
tool="${1:?which tool? e.g. copy-media.mjs}"
shift
[ -f "$HERE/tools/$tool" ] || { echo "No tool called $tool in $HERE/tools" >&2; exit 2; }

docker run --rm --network hidl_default --env-file "$ENV_FILE" \
  -e S3_ENDPOINT=http://garage:3900 \
  -v "$HERE/tools:/tools" -w /tools node:22-alpine \
  sh -c '[ -d node_modules ] || npm ci --omit=dev --no-audit --no-fund --ignore-scripts --loglevel=error >/dev/null; exec node "$@"' \
  tool "$tool" "$@"
