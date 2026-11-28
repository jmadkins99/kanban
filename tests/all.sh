#!/usr/bin/env bash
# The whole suite, as CI runs it: the lint first, then the E2E cases and the
# cloud-sync tests on the Firebase emulators (needs Java 21+) at the same time.
# The last line is the verdict, `PASS  all` or `FAIL  <suites>`, with the
# failing cases after `run:` (`FAIL  run: a.js b.js`), so
# `bash all.sh 2>&1 | tail -1` answers in one run, and says what to re-run with
# `bash run.sh <name>`. Exits non-zero if any part fails.
#
# Slots: TEST_JOBS (default 4) is the whole run's budget. Sync counts as one,
# so the cases get TEST_JOBS - 1 while it runs. With TEST_JOBS=1 there is no
# room for both: sync runs first, then the cases, one after the other.
# Serial cases (`// @serial:`) run alone: run.sh holds them back (through
# TEST_SERIAL_GATE) until sync has finished.
# Lock: this script takes the machine-wide test lock once, through a holder
# process (run.sh with TEST_HOLD_LOCK=1), and the case batch and sync run with
# TEST_LOCK_HELD=1 so they do not wait on the lock their own parent holds.
# Output: sync's output goes to a file and is printed in one piece after the
# cases, so the two never interleave.
# Stopping (Ctrl+C, TERM): the cases are stopped (run.sh publishes what it has),
# sync's whole process tree (emulators included) is killed, then the lock is
# released.
# TEST_LINT_CMD and TEST_SYNC_CMD replace the lint and sync commands
# (check-runner.sh only).
set -u
cd "$(dirname "$0")"
. ./proc.sh

LINT_CMD="${TEST_LINT_CMD:-bash lint.sh}"
SYNC_CMD="${TEST_SYNC_CMD:-bash sync.sh}"
JOBS="${TEST_JOBS:-4}"
if ! [[ "$JOBS" =~ ^[1-9][0-9]*$ ]]; then
    echo "TEST_JOBS must be a whole number of 1 or more, got: $JOBS"
    exit 1
fi
CASE_JOBS=$(( JOBS > 1 ? JOBS - 1 : 1 ))

WORK=$(mktemp -d)
LINT_PID=''
SYNC_PID=''
CASES_PID=''
cleanup() {
    trap '' INT TERM
    [ -z "$LINT_PID" ] || kill_tree "$LINT_PID"
    if [ -n "$CASES_PID" ]; then kill -TERM "$CASES_PID" 2> /dev/null; wait "$CASES_PID" 2> /dev/null; fi
    [ -z "$SYNC_PID" ] || kill_tree "$SYNC_PID"
    drop_test_lock
    rm -rf "$WORK"
}
trap cleanup EXIT
# `wait` below is what a signal interrupts, so these run at once, not after the
# foreground command they would otherwise be queued behind.
trap 'exit 130' INT
trap 'exit 143' TERM

# Install the dependencies once, and stop if that fails: nothing below can run
# without them. (Not for check-runner.sh, which points the runner at made-up
# cases and stubs.)
if [ ! -d node_modules ] && [ -z "${TEST_CASES_DIR:-}" ]; then
    echo "Installing test dependencies..."
    npm ci --silent --no-audit --no-fund || { echo "FAIL  npm ci"; exit 1; }
fi

failed=''
$LINT_CMD &
LINT_PID=$!
wait "$LINT_PID" || failed="$failed lint"
LINT_PID=''

# Take the lock once for everything below.
take_test_lock "$WORK" || { echo "FAIL  could not take the test lock"; exit 1; }

# Sync runs in a subshell of its own: its exit code goes to a file and the gate
# file appears when it is done, which is what run.sh's serial cases wait for.
start_sync() {
    ( TEST_LOCK_HELD=1 $SYNC_CMD > "$WORK/sync.log" 2>&1; echo $? > "$WORK/sync.code"; : > "$WORK/gate" ) &
    SYNC_PID=$!
}

CASE_ENV=(TEST_LOCK_HELD=1 TEST_JOBS="$CASE_JOBS")
if [ "$JOBS" -gt 1 ]; then
    start_sync
    CASE_ENV+=(TEST_SERIAL_GATE="$WORK/gate")
else
    # One slot: sync alone first, then the cases.
    start_sync
    wait "$SYNC_PID"
fi

env "${CASE_ENV[@]}" bash run.sh > "$WORK/cases.log" 2>&1 &
CASES_PID=$!
wait "$CASES_PID"; cases_code=$?
CASES_PID=''
cat "$WORK/cases.log"
[ "$cases_code" = 0 ] || failed="$failed run:$(tail -n 1 "$WORK/cases.log" | sed 's/^FAIL  cases://')"

wait "$SYNC_PID"
SYNC_PID=''
[ "$(cat "$WORK/sync.code" 2> /dev/null)" = 0 ] || failed="$failed sync"
echo
echo "── sync ──"
cat "$WORK/sync.log"

if [ -z "$failed" ]; then echo "PASS  all"; else echo "FAIL $failed"; exit 1; fi
