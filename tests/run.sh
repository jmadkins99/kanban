#!/usr/bin/env bash
# Runs every case in cases/ against a headless Chrome. Installs the one
# dependency (puppeteer-core) on first run. `bash run.sh clear` runs only the
# cases whose file name contains "clear". Exits non-zero if any case fails,
# and then its last line names them: `FAIL  cases: a.js b.js`.
set -u
cd "$(dirname "$0")"

[ -d node_modules ] || npm ci --no-audit --no-fund || exit 1

failed=''
for f in cases/*.js; do
    case "$f" in *"${1:-}"*) ;; *) continue ;; esac
    if out=$(node "$f" 2>&1); then
        echo "PASS  $f"
    else
        echo "FAIL  $f"; echo "$out" | sed 's/^/      /'; failed="$failed ${f#cases/}"
    fi
done
[ -z "$failed" ] || { echo "FAIL  cases:$failed"; exit 1; }
