#!/usr/bin/env bash
# The whole suite, as CI runs it: the lint first, then the E2E cases and the
# cloud-sync tests on the Firebase emulators (needs Java 21+) at the same time.
# The last line is the verdict, `PASS  all` or `FAIL  <suites>`, with the
# failing cases after `run:` (`FAIL  run: a.js b.js`), so
# `bash all.sh 2>&1 | tail -1` answers in one run, and says what to re-run with
# `bash run.sh <name>`. Exits non-zero if any part fails.
#
# Slots: TEST_JOBS (default 4) is the whole run's budget. Sync counts as one,
# so the cases get TEST_JOBS - 1 (at least 1).
# Lock: this script takes the machine-wide test lock once, through a holder
# process (run.sh with TEST_HOLD_LOCK=1), and the case batch runs with
# TEST_LOCK_HELD=1 so it does not wait on the lock its own parent holds.
# Output: the cases print as they finish; sync's output goes to a file and is
# printed in one piece after the cases, so the two never interleave.
# TEST_LINT_CMD and TEST_SYNC_CMD replace the lint and sync commands
# (check-runner.sh only).
set -u
cd "$(dirname "$0")"

LINT_CMD="${TEST_LINT_CMD:-bash lint.sh}"
SYNC_CMD="${TEST_SYNC_CMD:-bash sync.sh}"
JOBS="${TEST_JOBS:-4}"
CASE_JOBS=$(( JOBS > 1 ? JOBS - 1 : 1 ))

WORK=$(mktemp -d)
HOLDER=''
SYNC_PID=''
cleanup() {
    [ -z "$SYNC_PID" ] || kill "$SYNC_PID" 2> /dev/null
    if [ -n "$HOLDER" ]; then kill "$HOLDER" 2> /dev/null; wait "$HOLDER" 2> /dev/null; fi
    rm -rf "$WORK"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

failed=''
$LINT_CMD || failed="$failed lint"

# Take the lock once for everything below.
TEST_HOLD_LOCK=1 TEST_HOLD_LOCK_READY="$WORK/ready" bash run.sh &
HOLDER=$!
while [ ! -s "$WORK/ready" ]; do
    kill -0 "$HOLDER" 2> /dev/null || { echo "FAIL  could not take the test lock"; exit 1; }
    sleep 0.2
done

$SYNC_CMD > "$WORK/sync.log" 2>&1 &
SYNC_PID=$!

TEST_LOCK_HELD=1 TEST_JOBS="$CASE_JOBS" bash run.sh | tee "$WORK/cases.log"
[ "${PIPESTATUS[0]}" = 0 ] || failed="$failed run:$(tail -1 "$WORK/cases.log" | sed 's/^FAIL  cases://')"

wait "$SYNC_PID" || failed="$failed sync"
SYNC_PID=''
echo
echo "── sync ──"
cat "$WORK/sync.log"

if [ -z "$failed" ]; then echo "PASS  all"; else echo "FAIL $failed"; exit 1; fi
