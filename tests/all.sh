#!/usr/bin/env bash
# The whole suite, as CI runs it: the lint, the E2E cases, then the cloud-sync
# tests on the Firebase emulators (needs Java 21+). The last line is the
# verdict, `PASS  all` or `FAIL  <suites>`, with the failing cases after
# `run:` (`FAIL  run: a.js b.js`), so `bash all.sh 2>&1 | tail -1` answers in
# one run, and says what to re-run with `bash run.sh <name>`. Exits non-zero
# if any fails.
set -u
cd "$(dirname "$0")"

failed=''
bash lint.sh || failed="$failed lint"
log=$(mktemp)
bash run.sh | tee "$log"
[ "${PIPESTATUS[0]}" = 0 ] || failed="$failed run:$(tail -1 "$log" | sed 's/^FAIL  cases://')"
rm -f "$log"
bash sync.sh || failed="$failed sync"

if [ -z "$failed" ]; then echo "PASS  all"; else echo "FAIL $failed"; exit 1; fi
