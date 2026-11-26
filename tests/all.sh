#!/usr/bin/env bash
# The whole suite, as CI runs it: the lint, the E2E cases, then the cloud-sync
# tests on the Firebase emulators (needs Java 21+). Exits non-zero if any fails.
set -u
cd "$(dirname "$0")"

fail=0
bash lint.sh || fail=1
bash run.sh  || fail=1
bash sync.sh || fail=1
exit $fail
