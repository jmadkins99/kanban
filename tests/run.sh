#!/usr/bin/env bash
# Runs every case in cases/ against a headless Chrome. Installs the one
# dependency (puppeteer-core) on first run. `bash run.sh clear` runs only the
# cases whose file name contains "clear". Exits non-zero if any case fails.
set -u
cd "$(dirname "$0")"

[ -d node_modules ] || npm ci --no-audit --no-fund || exit 1

fail=0
for f in cases/*.js; do
    case "$f" in *"${1:-}"*) ;; *) continue ;; esac
    if out=$(node "$f" 2>&1); then
        echo "PASS  $f"
    else
        echo "FAIL  $f"; echo "$out" | sed 's/^/      /'; fail=1
    fi
done
exit $fail
