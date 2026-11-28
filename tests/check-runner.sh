#!/usr/bin/env bash
# Runner self-test: runs run.sh as a whole process against the made-up cases in
# selftest-cases/ (through TEST_CASES_DIR) and checks exit codes, the printed
# summary and the files in the last-run folder. Runs in CI's runner-selftest
# job, and by hand: `bash check-runner.sh`.
#
# It never touches the real tests/.last-run/: TEST_OUT_DIR points the runner at
# a temp folder, and TEST_LOCK_FILE points the machine-wide lock into the same
# temp folder, so the self-test never contends with a real suite. The lock,
# interrupt and Chrome sections are at the end of this file. The cases in
# selftest-cases are plain node scripts and run without slot Chromes; the ones
# in selftest-chrome-cases need Chrome and puppeteer-core (the runner skips
# `npm install` for a custom cases folder, so install it first).

set -u
cd "$(dirname "$0")"

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
FAILED=0

ok()   { echo "  ok   - $1"; }
fail() { echo "  FAIL - $1"; FAILED=1; }

# The environment every runner in this file gets, set in one place.
# TEST_LOCK_FILE: a lock of its own in $WORK (see the top of the file).
LOCK="$WORK/test.lock"
selftest_env() {   # selftest_env <label>: fills ENV_ARGS
    ENV_ARGS=(TEST_CASES_DIR=selftest-cases TEST_OUT_DIR="$WORK/out-$1"
        TEST_JOBS=2 TEST_CASE_TIMEOUT=30 SELFTEST_MARKER="$WORK/marker-$1"
        TEST_LOCK_FILE="$LOCK" TEST_LOCK_POLL=0.2)
}

# runner <label> [VAR=value ...] bash run.sh [args]
# Runs the command with the self-test env; output goes to $WORK/<label>.out and
# the exit code is left in $CODE. A VAR=value given here replaces the default.
CODE=0
runner() {
    local label="$1"; shift
    selftest_env "$label"
    env "${ENV_ARGS[@]}" "$@" > "$WORK/$label.out" 2>&1
    CODE=$?
}
# runner_bg <label> ...: same, in the background; the runner's pid is in $BG_PID.
# `exec` makes the background process the runner itself, so $BG_PID is the pid
# the runner records in the lock as its own $$.
BG_PID=0
runner_bg() {
    local label="$1"
    selftest_env "$label"
    ( exec env "${ENV_ARGS[@]}" "${@:2}" > "$WORK/$label.out" 2>&1 ) &
    BG_PID=$!
}
lock_pid() { sed -n 's/^pid=//p' "$LOCK/info" 2>/dev/null; }
has() { grep -q -- "$2" "$WORK/$1.out"; }   # has <label> <fixed text>
# wait_for <label> <fixed text>: polls a background run's output for up to 15s.
wait_for() { local n; for n in $(seq 1 75); do has "$1" "$2" && return 0; sleep 0.2; done; return 1; }
# wait_file <path>: polls up to 15s for a non-empty file.
wait_file() { local n; for n in $(seq 1 75); do [ -s "$1" ] && return 0; sleep 0.2; done; return 1; }
write_lock() { mkdir -p "$LOCK"; printf 'repo=%s\npid=%s\nstarted=%s\n' "$1" "$2" "$3" > "$LOCK/info"; }   # write_lock <repo> <pid> <epoch>

echo "mixed run: pass, fail and a flaky case"
runner mixed bash run.sh
[ "$CODE" = 1 ] && ok "exit 1 because 02-fail fails" || fail "expected exit 1, got $CODE"
OUT_MIXED="$WORK/out-mixed"
grep -q "^FAILED" "$OUT_MIXED/summary.txt" && grep -q "02-fail" "$OUT_MIXED/summary.txt" && ok "summary lists the failed case" || fail "summary misses the failed case"
grep -q "^FLAKY" "$OUT_MIXED/summary.txt" && grep -q "03-flaky" "$OUT_MIXED/summary.txt" && ok "summary lists the flaky case as FLAKY" || fail "summary misses FLAKY 03-flaky"
has mixed "FLAKY" && ok "FLAKY is in the printed output too" || fail "FLAKY not printed"
[ -f "$OUT_MIXED/01-pass.log" ] && [ -f "$OUT_MIXED/02-fail.log" ] && [ -f "$OUT_MIXED/03-flaky.log" ] && ok "one output file per case" || fail "missing per-case files in last-run folder"
[ "$(ls "$OUT_MIXED" | grep -c '\.log$')" = 3 ] && ok "no extra per-case files" || fail "unexpected number of .log files"
grep -q "SELFTEST-FAIL-MARKER" "$OUT_MIXED/02-fail.log" && ok "failed case's output is in its file" || fail "02-fail.log lacks the case's output"
grep -q "SELFTEST-FLAKY-MARKER" "$OUT_MIXED/03-flaky.log" && ok "flaky case's first attempt is in its file" || fail "03-flaky.log lacks the first attempt"
grep -q "^PASSED" "$OUT_MIXED/summary.txt" && grep -q "01-pass" "$OUT_MIXED/summary.txt" && ok "summary lists the passed case" || fail "summary misses 01-pass"
grep -Eq "[0-9]+\.[0-9]s" "$OUT_MIXED/summary.txt" && ok "summary has timings" || fail "summary has no timings"

echo "a second run replaces the last-run folder"
echo stale > "$OUT_MIXED/stale-file"
runner mixed bash run.sh 01
[ "$CODE" = 0 ] && ok "pattern run of the passing case exits 0" || fail "expected exit 0, got $CODE"
[ ! -e "$OUT_MIXED/stale-file" ] && [ ! -e "$OUT_MIXED/02-fail.log" ] && [ -f "$OUT_MIXED/01-pass.log" ] && ok "old files gone, new file present" || fail "last-run folder was not replaced"

echo "TEST_OUT_DIR is only deleted if it looks like a last-run folder"
PREC="$WORK/precious"; mkdir -p "$PREC"; echo keep > "$PREC/important.txt"
runner precious TEST_OUT_DIR="$PREC" bash run.sh 01
{ [ "$CODE" != 0 ] && [ -f "$PREC/important.txt" ]; } && ok "a non-empty folder without the marker is refused and left alone" || fail "unmarked TEST_OUT_DIR was deleted or accepted (exit $CODE)"
{ has precious "Refusing" && ! has precious "Running"; } && ok "refused before any case started" || fail "no refusal message, or the run started"
EMPTYDIR="$WORK/empty-out"; mkdir -p "$EMPTYDIR"
runner emptyout TEST_OUT_DIR="$EMPTYDIR" bash run.sh 01
{ [ "$CODE" = 0 ] && [ -f "$EMPTYDIR/summary.txt" ]; } && ok "an empty folder is accepted" || fail "empty TEST_OUT_DIR refused (exit $CODE)"

echo "flaky case alone: the run passes"
runner flaky bash run.sh 03
[ "$CODE" = 0 ] && ok "exit 0 when the only problem is a flake" || fail "expected exit 0, got $CODE"
has flaky "FLAKY" && ok "FLAKY printed" || fail "FLAKY not printed"
runner flaky2 GITHUB_ACTIONS=true bash run.sh 03
has flaky2 "::warning" && ok "CI annotation printed under GITHUB_ACTIONS" || fail "no ::warning annotation"

echo "TEST_CASES guard"
runner empty TEST_CASES= bash run.sh
[ "$CODE" != 0 ] && ok "empty TEST_CASES exits non-zero" || fail "empty TEST_CASES exited 0"
has empty "TEST_CASES" && ok "empty TEST_CASES prints a message" || fail "no message for empty TEST_CASES"
{ [ ! -e "$WORK/out-empty" ] && ! has empty "Running"; } && ok "no case started (empty)" || fail "a run started despite empty TEST_CASES"
runner unknown TEST_CASES="01-pass no-such-case" bash run.sh
[ "$CODE" != 0 ] && ok "unknown case exits non-zero" || fail "unknown case exited 0"
has unknown "no-such-case" && ok "message names the unknown case" || fail "message does not name the case"
{ [ ! -e "$WORK/out-unknown" ] && ! has unknown "Running"; } && ok "no case started (unknown)" || fail "a run started despite unknown case"
runner listed TEST_CASES="01-pass" bash run.sh
[ "$CODE" = 0 ] && ok "valid TEST_CASES still works" || fail "valid TEST_CASES exit $CODE"

echo "TEST_SHARD"
runner shard TEST_SHARD=1/2 bash run.sh
# Shard 1/2 of {01,02,03} is 01 and 03; 02-fail is on shard 2.
[ "$CODE" = 0 ] && ok "shard 1/2 runs 01 and 03 and exits 0" || fail "shard 1/2 exit $CODE"
runner badshard TEST_SHARD=3/2 bash run.sh
[ "$CODE" != 0 ] && ok "bad TEST_SHARD rejected" || fail "bad TEST_SHARD accepted"
for bad in 1 0/4 5/4 1/08 01/2 a/b 1/2/3 -1/2 1/0; do
    runner badshard2 TEST_SHARD="$bad" bash run.sh
    { [ "$CODE" != 0 ] && has badshard2 "TEST_SHARD must look like" && ! has badshard2 "Running"; } && ok "TEST_SHARD=$bad rejected before anything ran" || fail "TEST_SHARD=$bad accepted or ran (exit $CODE)"
done
runner shard2 TEST_SHARD=2/3 bash run.sh
{ [ "$CODE" = 1 ] && has shard2 "02-fail"; } && ok "shard 2/3 is 02-fail alone" || fail "shard 2/3 wrong (exit $CODE)"

echo "TEST_JOBS"
for bad in 0 -1 abc 1.5 08x; do
    runner badjobs TEST_JOBS="$bad" bash run.sh 01
    { [ "$CODE" != 0 ] && has badjobs "TEST_JOBS must be" && ! has badjobs "Running"; } && ok "TEST_JOBS='$bad' rejected" || fail "TEST_JOBS='$bad' accepted or ran (exit $CODE)"
done

echo "the filter matches a file name with .js or a cases/ prefix, and no match is an error"
runner patjs bash run.sh 01-pass.js
{ [ "$CODE" = 0 ] && has patjs "Running 1 case" && has patjs "01-pass"; } && ok "01-pass.js matches 01-pass" || fail "pattern with .js did not match (exit $CODE)"
runner patdir bash run.sh selftest-cases/01-pass
{ [ "$CODE" = 0 ] && has patdir "Running 1 case"; } && ok "a folder-prefixed pattern matches" || fail "pattern with folder prefix did not match (exit $CODE)"
runner patnone bash run.sh no-such-case
{ [ "$CODE" != 0 ] && has patnone "No cases matched"; } && ok "a pattern that matches nothing is an error" || fail "zero matches exited $CODE"

echo "a failed npm ci stops run.sh and all.sh before anything runs"
# A bare copy of the scripts with no node_modules and an npm that fails.
T="$WORK/npmfail"; mkdir -p "$T/tests/cases" "$T/bin"
cp run.sh all.sh lint.sh sync.sh proc.sh package.json "$T/tests/"
echo "console.log('RAN');" > "$T/tests/cases/01-x.js"
printf '#!/usr/bin/env bash\necho "npm $*" >> "%s/npm.calls"\nexit 1\n' "$T" > "$T/bin/npm"; chmod +x "$T/bin/npm"
( cd "$T/tests" && PATH="$T/bin:$PATH" TEST_LOCK_FILE="$LOCK" TEST_OUT_DIR="$T/out" bash run.sh > "$WORK/npm-run.out" 2>&1 ); CODE=$?
{ [ "$CODE" != 0 ] && ! grep -q "Running" "$WORK/npm-run.out" && ! grep -q RAN "$WORK/npm-run.out"; } && ok "run.sh stops when npm ci fails" || fail "run.sh went on after npm ci failed (exit $CODE)"
( cd "$T/tests" && PATH="$T/bin:$PATH" TEST_LOCK_FILE="$LOCK" TEST_OUT_DIR="$T/out" bash all.sh > "$WORK/npm-all.out" 2>&1 ); CODE=$?
{ [ "$CODE" != 0 ] && ! grep -q "Running" "$WORK/npm-all.out" && [ "$(tail -n 1 "$WORK/npm-all.out")" = "FAIL  npm ci" ]; } && ok "all.sh stops when npm ci fails" || fail "all.sh went on after npm ci failed (exit $CODE): $(cat "$WORK/npm-all.out")"

echo "sync.sh takes the machine-wide lock unless all.sh holds it"
mkdir -p "$T/firebase"
printf '#!/usr/bin/env bash\nmkdir -p node_modules\nexit 0\n' > "$T/bin/npm"
# The stand-in npx (what runs the emulators) records what the lock looked like.
printf '#!/usr/bin/env bash\ncat "%s/info" > "%s/lock-seen" 2>/dev/null || echo none > "%s/lock-seen"\nexit 0\n' "$LOCK" "$T" "$T" > "$T/bin/npx"; chmod +x "$T/bin/npx"
( cd "$T/tests" && PATH="$T/bin:$PATH" TEST_LOCK_FILE="$LOCK" bash sync.sh > "$WORK/sync-alone.out" 2>&1 ); CODE=$?
{ [ "$CODE" = 0 ] && grep -q "^repo=" "$T/lock-seen" && grep -q "^pid=[0-9]" "$T/lock-seen"; } && ok "standalone sync.sh held the lock while the emulators ran" || fail "standalone sync.sh ran without the lock (exit $CODE): $(cat "$T/lock-seen" 2>/dev/null)"
[ ! -e "$LOCK" ] && ok "and released it" || fail "sync.sh left the lock"
( cd "$T/tests" && PATH="$T/bin:$PATH" TEST_LOCK_FILE="$LOCK" SYNC_ONLY=x bash sync.sh > "$WORK/sync-only.out" 2>&1 ); CODE=$?
{ [ "$CODE" = 0 ] && grep -q "^repo=" "$T/lock-seen"; } && ok "SYNC_ONLY runs take the lock too" || fail "SYNC_ONLY run ran without the lock"
sleep 60 & HOLDER=$!
write_lock kanban "$HOLDER" "$(date +%s)"
( cd "$T/tests" && PATH="$T/bin:$PATH" TEST_LOCK_FILE="$LOCK" TEST_LOCK_POLL=0.2 bash sync.sh > "$WORK/sync-wait.out" 2>&1 ) &
SW_PID=$!
sleep 2
{ ! grep -q PASS "$WORK/sync-wait.out" && grep -q "Waiting for it to finish" "$WORK/sync-wait.out"; } && ok "sync.sh waits while another run holds the lock" || fail "sync.sh did not wait for the held lock"
rm -rf "$LOCK"; kill "$HOLDER" 2>/dev/null
wait "$SW_PID"; grep -q "PASS  sync" "$WORK/sync-wait.out" && ok "and runs once the lock is free" || fail "sync.sh did not run after the lock was freed"
( cd "$T/tests" && PATH="$T/bin:$PATH" TEST_LOCK_FILE="$LOCK" TEST_LOCK_HELD=1 bash sync.sh > "$WORK/sync-held.out" 2>&1 ); CODE=$?
{ [ "$CODE" = 0 ] && grep -q "^none" "$T/lock-seen"; } && ok "with TEST_LOCK_HELD=1 it leaves the lock to its parent" || fail "TEST_LOCK_HELD=1 sync.sh took a lock"
# all.sh runs the real sync.sh: it must not wait on the lock all.sh itself holds.
( cd "$T/tests" && PATH="$T/bin:$PATH" TEST_LOCK_FILE="$LOCK" TEST_LOCK_POLL=0.2 TEST_CASES_DIR=cases TEST_OUT_DIR="$T/out2" TEST_LINT_CMD=true timeout 60 bash all.sh > "$WORK/all-real-sync.out" 2>&1 ); CODE=$?
{ [ "$CODE" = 0 ] && [ "$(tail -n 1 "$WORK/all-real-sync.out")" = "PASS  all" ] && grep -q "PASS  sync/sync.js" "$WORK/all-real-sync.out"; } && ok "all.sh runs sync.sh without deadlocking on its own lock" || fail "all.sh with the real sync.sh: exit $CODE: $(cat "$WORK/all-real-sync.out")"

# ── machine-wide lock ────────────────────────────────────────────────────────
# The holders below are made up: a lock naming a live process (a sleep) or one
# that has already exited. $LOCK is in $WORK (see selftest_env).

echo "no lock is left behind after runs that passed or failed"
[ ! -e "$LOCK" ] && ok "no lock after the earlier runs, including failing ones" || fail "lock left behind"

echo "the default lock path does not depend on TMPDIR"
# The real default lock (the user's temp folder) may be held by a live suite
# this self-test must never touch or delete, so the default is derived inside
# $WORK: on Git Bash/Windows from a made-up LOCALAPPDATA (the cygpath
# derivation is what is under test), elsewhere through TEST_LOCK_TMP, which
# stands in for /tmp.
mkdir -p "$WORK/fakelocal/Temp" "$WORK/tmpA"
if command -v cygpath > /dev/null 2>&1; then
    LOCK_ENV=(LOCALAPPDATA="$(cygpath -w "$WORK/fakelocal")")
else
    LOCK_ENV=(TEST_LOCK_TMP="$WORK/fakelocal/Temp")
fi
WANT_LOCK="$WORK/fakelocal/Temp/machine-test-run.lock"
SLOWD="$WORK/slow-cases"; mkdir -p "$SLOWD"
echo "setTimeout(() => {}, 15000);" > "$SLOWD/01-slow.js"
( exec env -u TEST_LOCK_FILE "${LOCK_ENV[@]}" TMPDIR="$WORK/tmpA" TEST_CASES_DIR="$SLOWD" TEST_OUT_DIR="$WORK/out-default-lock" TEST_JOBS=1 \
    bash run.sh > "$WORK/default-lock.out" 2>&1 ) &
DL_PID=$!
for n in $(seq 1 50); do [ -s "$WANT_LOCK/info" ] && break; sleep 0.2; done
{ [ -d "$WANT_LOCK" ] && grep -q "^pid=$DL_PID$" "$WANT_LOCK/info"; } && ok "lock is in the user's temp folder, not in the session's TMPDIR" || fail "lock not at $WANT_LOCK"
ls "$WORK/tmpA" | grep -q "machine-test-run" && fail "lock was created under TMPDIR" || ok "nothing created under TMPDIR"
kill -TERM "$DL_PID" 2>/dev/null; wait "$DL_PID" 2>/dev/null
[ ! -e "$WANT_LOCK" ] && ok "default lock released" || fail "default lock left behind"

echo "a run holds the lock while it runs; SIGTERM stops its cases, publishes what it has and releases the lock"
SLOW="$WORK/slow-cases2"; mkdir -p "$SLOW"
cat > "$SLOW/01-fast.js" <<'EOF'
console.log('SELFTEST-FAST-DONE');
EOF
cat > "$SLOW/02-slow.js" <<'EOF'
// Beats once every 100 ms into HEARTBEAT, so the self-test can tell that the
// case started and that it stopped.
const fs = require('fs');
console.log('SELFTEST-SLOW-STARTED');
setInterval(() => fs.appendFileSync(process.env.HEARTBEAT, '.'), 100);
EOF
HB="$WORK/heartbeat"
runner_bg holding TEST_CASES_DIR="$SLOW" HEARTBEAT="$HB" TEST_JOBS=1 bash run.sh
wait_file "$HB" && ok "the slow case started" || fail "the slow case never started"
if grep -q "^repo=$(basename "$(cd .. && pwd)")$" "$LOCK/info" && grep -q "^pid=$BG_PID$" "$LOCK/info" && grep -Eq "^started=[0-9]{9,}$" "$LOCK/info"; then
    ok "lock names the repo, the runner's own pid and the start time"
else
    fail "lock contents wrong (runner pid $BG_PID): $(cat "$LOCK/info" 2>/dev/null)"
fi
kill -TERM "$BG_PID" 2>/dev/null
wait "$BG_PID" 2>/dev/null
[ ! -e "$LOCK" ] && ok "lock removed after SIGTERM" || fail "lock left after SIGTERM"
SIZE1=$(wc -c < "$HB"); sleep 1; SIZE2=$(wc -c < "$HB")
[ "$SIZE1" = "$SIZE2" ] && ok "the in-flight case stopped beating: it was stopped with the run" || fail "the case kept running after SIGTERM ($SIZE1 -> $SIZE2)"
OI="$WORK/out-holding"
grep -q "INTERRUPTED" "$OI/summary.txt" 2>/dev/null && ok "summary is marked INTERRUPTED" || fail "no INTERRUPTED summary in the last-run folder"
{ grep -q "^RESULT: PASS" "$OI/01-fast.log" && grep -q "SELFTEST-FAST-DONE" "$OI/01-fast.log"; } 2>/dev/null && ok "the case that had finished is published with its output" || fail "01-fast.log missing or wrong after SIGTERM"
{ grep -q "^RESULT: INTERRUPTED" "$OI/02-slow.log" && grep -q "SELFTEST-SLOW-STARTED" "$OI/02-slow.log"; } 2>/dev/null && ok "the case that was running is published as interrupted, with its output so far" || fail "02-slow.log missing or wrong after SIGTERM"

echo "a held lock: the second run prints the holder once, waits, then runs"
sleep 60 & HOLDER=$!
write_lock kanban "$HOLDER" "$(( $(date +%s) - 90 ))"
runner_bg waiter bash run.sh 01
wait_for waiter "Waiting for it to finish" && ok "run announced that it is waiting" || fail "no waiting message"
has waiter "kanban (pid $HOLDER)" && ok "message names the holder's repo and pid" || fail "holder not named"
sleep 1
[ ! -e "$WORK/out-waiter" ] && ok "no case started (no output folder yet) while the lock is held" || fail "run started while the lock was held"
rm -rf "$LOCK"      # the holder lets go
wait "$BG_PID"; CODE=$?
{ [ "$CODE" = 0 ] && [ -f "$WORK/out-waiter/summary.txt" ]; } && ok "run went ahead once the lock was free" || fail "waiter did not run after release (exit $CODE)"
[ "$(grep -c "Waiting for it to finish" "$WORK/waiter.out")" = 1 ] && ok "holder was printed once" || fail "holder printed more than once"
[ ! -e "$LOCK" ] && ok "waiter released the lock when done" || fail "waiter left the lock"
kill "$HOLDER" 2>/dev/null

echo "a refused run does not wait for a held lock"
sleep 60 & HOLDER=$!
write_lock kanban "$HOLDER" "$(date +%s)"
runner refused TEST_CASES= bash run.sh
{ [ "$CODE" != 0 ] && ! has refused "Waiting"; } && ok "guard refuses at once, without waiting" || fail "refused run waited or exited 0"
[ "$(lock_pid)" = "$HOLDER" ] && ok "the holder's lock is untouched" || fail "refused run changed the lock"
kill "$HOLDER" 2>/dev/null; rm -rf "$LOCK"

echo "a stale lock is taken over"
sleep 0.1 & DEAD=$!; wait "$DEAD" 2>/dev/null
write_lock kanban "$DEAD" "$(( $(date +%s) - 3600 ))"
runner stale bash run.sh 01
{ [ "$CODE" = 0 ] && has stale "stale test lock" && ! has stale "Waiting"; } && ok "stale lock taken over without waiting" || fail "stale lock not taken over (exit $CODE)"
[ ! -e "$LOCK" ] && ok "no lock left after the takeover run" || fail "lock left after the takeover run"
mkdir -p "$LOCK"; printf 'garbage\n' > "$LOCK/info"
runner garbage bash run.sh 01
{ [ "$CODE" = 0 ] && [ ! -e "$LOCK" ]; } && ok "a lock with no readable pid counts as stale" || fail "garbage lock blocked the run (exit $CODE)"

echo "several runs racing for one stale lock never overlap"
SERIAL="$WORK/serial-cases"; mkdir -p "$SERIAL"
cat > "$SERIAL/01-serial.js" <<'EOF'
// Logs when it starts and ends. Two suites running at once would interleave.
const fs = require('fs');
fs.appendFileSync(process.env.SERIAL_LOG, 'start\n');
setTimeout(() => { fs.appendFileSync(process.env.SERIAL_LOG, 'end\n'); }, 600);
EOF
RACE_OK=1
for round in 1 2 3; do
    SLOG="$WORK/serial-log-$round"; : > "$SLOG"
    sleep 0.1 & DEAD=$!; wait "$DEAD" 2>/dev/null
    write_lock kanban "$DEAD" "$(( $(date +%s) - 3600 ))"
    PIDS=()
    for k in 1 2 3 4; do
        runner_bg "race-$round-$k" TEST_CASES_DIR="$SERIAL" SERIAL_LOG="$SLOG" TEST_JOBS=1 bash run.sh
        PIDS+=("$BG_PID")
    done
    for p in "${PIDS[@]}"; do wait "$p" 2>/dev/null; done
    [ "$(cat "$SLOG" | tr '\n' ' ')" = "start end start end start end start end " ] || RACE_OK=0
done
[ "$RACE_OK" = 1 ] && ok "four runs per round, three rounds: each case ended before the next began" || fail "runs overlapped or one did not run: $(tr '\n' ' ' < "$SLOG")"
LEFT=$(ls -d "$LOCK" "$LOCK".* 2>/dev/null)
[ -z "$LEFT" ] && ok "no lock or retired copy left behind" || fail "left behind: $LEFT"
for round in 1 2 3; do
    [ "$(cat "$WORK"/race-$round-*.out | grep -c 'stale test lock')" = 1 ] || RACE_ONE=0
done
[ "${RACE_ONE:-1}" = 1 ] && ok "exactly one run took over each stale lock" || fail "several runs took over the same stale lock"

# ── one Chrome per slot ──────────────────────────────────────────────────────
# Real Chrome cases (selftest-chrome-cases/), so this part needs puppeteer-core
# (npm install in tests/) and a Chrome; CI's runner-selftest job has both. One slot
# (TEST_JOBS=1) puts every case on the same Chrome, in order:
#   01 and 02: same origin, same Chrome, must not see each other's storage
#   03: crashes the slot's Chrome on its first attempt, passes on the retry,
#       which must run on a live Chrome that is not the crashed one
#   04: runs next on the slot, and needs the replacement Chrome
echo "cases on one slot's Chrome: separate storage, and a killed Chrome is replaced"
runner chrome TEST_CASES_DIR=selftest-chrome-cases TEST_SLOT_CHROME=1 TEST_JOBS=1 bash run.sh
[ "$CODE" = 0 ] && ok "run with a crashed Chrome exits 0" || fail "chrome run exit $CODE"
WS_FILE="$WORK/marker-chrome-ws"
WS_A=$(sed -n 's/^01-storage-a //p' "$WS_FILE"); WS_B=$(sed -n 's/^02-storage-b //p' "$WS_FILE"); WS_CRASH=$(sed -n 's/^03-crash //p' "$WS_FILE")
WS_CRASH_RETRY=$(sed -n 's/^03-crash-retry //p' "$WS_FILE"); WS_AFTER=$(sed -n 's/^04-after-crash //p' "$WS_FILE")
{ [ -n "$WS_A" ] && [ "$WS_A" = "$WS_B" ]; } && ok "01 and 02 ran on the same slot Chrome" || fail "01 and 02 did not share a Chrome ($WS_A / $WS_B)"
grep -q "storage was empty" "$WORK/out-chrome/01-storage-a.log" && grep -q "storage was empty" "$WORK/out-chrome/02-storage-b.log" \
    && ok "each case found the storage empty (the other's was in another context)" || fail "storage leaked between cases on one Chrome"
grep -q "^RESULT: PASS" "$WORK/out-chrome/02-storage-b.log" && ok "02 passed" || fail "02 did not pass"
grep -q "SELFTEST-CRASH-FAILED" "$WORK/out-chrome/03-crash.log" && fail "Browser.crash did not take the Chrome down, so the crash check proved nothing"
grep -q "SELFTEST-CRASH-CONFIRMED" "$WORK/out-chrome/03-crash.log" && ok "03's Chrome really crashed" || fail "03 never confirmed the crash"
grep -q "^FLAKY" "$WORK/out-chrome/summary.txt" && grep -q "03-crash" "$WORK/out-chrome/summary.txt" && ok "the case on the crashed Chrome failed once and was retried (FLAKY)" || fail "03-crash was not retried to a pass"
grep -q "the retry ran on a live Chrome" "$WORK/out-chrome/03-crash.log" && ok "the retry connected to a Chrome and opened a page" || fail "03's retry did not run on a live Chrome"
{ [ -n "$WS_CRASH" ] && [ -n "$WS_CRASH_RETRY" ] && [ "$WS_CRASH_RETRY" != "$WS_CRASH" ]; } && ok "the retry got a fresh Chrome, not the crashed one" || fail "retry Chrome not fresh ($WS_CRASH / $WS_CRASH_RETRY)"
{ [ -n "$WS_AFTER" ] && [ "$WS_AFTER" != "$WS_A" ]; } && ok "the slot got a fresh Chrome after the crash" || fail "04 did not run on a replacement Chrome ($WS_A / $WS_AFTER)"
grep -q "^RESULT: PASS" "$WORK/out-chrome/04-after-crash.log" && ok "the next case on the slot passed" || fail "04 did not pass after the crash"

# ── serial cases ─────────────────────────────────────────────────────────────
# selftest-serial-cases/: 01-serial carries `// @serial:` and sorts first; the
# two parallel cases take 0.8 s each. Each logs start and end to SERIAL_LOG.
echo "a serial case runs alone, after the parallel batch"
SLOG="$WORK/serial-order"; : > "$SLOG"
runner serial TEST_CASES_DIR=selftest-serial-cases SERIAL_LOG="$SLOG" TEST_JOBS=2 bash run.sh
[ "$CODE" = 0 ] && ok "run with a serial case exits 0" || fail "serial run exit $CODE"
[ "$(sed -n '1,2p' "$SLOG" | sort | tr '
' ' ')" = "start 02-par-a start 03-par-b " ] && ok "the parallel cases started together" || fail "parallel cases did not start first: $(tr '
' ' ' < "$SLOG")"
[ "$(tail -n 2 "$SLOG" | tr '
' ' ')" = "start 01-serial end 01-serial " ] && ok "the serial case started and ended last, after both parallel cases had ended" || fail "serial case did not run last: $(tr '
' ' ' < "$SLOG")"
[ "$(grep -c '^end' "$SLOG")" = 3 ] && [ "$(sed -n '3,4p' "$SLOG" | grep -c '^end')" = 2 ] && ok "both parallel cases ended before the serial case began" || fail "parallel cases overlapped the serial one: $(tr '
' ' ' < "$SLOG")"
has serial "01-serial (serial)" && ok "the printed result marks the serial case" || fail "serial case not marked in the output"

# ── a failed app open leaves no Chrome ───────────────────────────────────────
echo "when openApp throws, no Chrome from the case is left running"
runner open TEST_CASES_DIR=selftest-open-cases TEST_SLOT_CHROME=1 TEST_JOBS=1 bash run.sh
[ "$CODE" = 0 ] && ok "open-throws case passed" || fail "open-throws case failed (exit $CODE): $(cat "$WORK/out-open/01-open-throws.log" 2>/dev/null)"
grep -q "slot Chrome: nothing left behind" "$WORK/out-open/01-open-throws.log" && ok "on a slot Chrome: no context or page left behind" || fail "slot Chrome check did not run"
grep -q "own Chrome: exited" "$WORK/out-open/01-open-throws.log" && ok "on its own Chrome: the Chrome exited" || fail "own Chrome check did not run"

# ── all.sh: lint, then sync alongside the cases, one lock ────────────────────
# Lint and sync are stubs (TEST_LINT_CMD, TEST_SYNC_CMD); the cases are the
# made-up ones. The sync stub logs when it starts and ends.
echo "all.sh runs sync alongside the cases and fails if any part fails"
ALOG="$WORK/all-sync.log"
runner all-ok TEST_CASES="01-pass 03-flaky" TEST_LINT_CMD=true TEST_SYNC_CMD="echo sync-ran" bash all.sh
[ "$CODE" = 0 ] && [ "$(tail -n 1 "$WORK/all-ok.out")" = "PASS  all" ] && ok "everything passing: exit 0, last line PASS  all" || fail "all-passing run: exit $CODE, last line: $(tail -n 1 "$WORK/all-ok.out")"
has all-ok "sync-ran" && ok "sync's output is printed" || fail "sync's output missing"
[ ! -d "$LOCK" ] && ok "the lock is released at the end" || fail "the lock is still held after all.sh"

# Sync really runs alongside a case. Each side waits (up to 10 s) for a file the
# other writes, so the two exit 0 only if they were running at the same time:
# a sync that ran before or after the cases would time out and fail the run.
OVD="$WORK/overlap-cases"; mkdir -p "$OVD"
cat > "$OVD/01-overlap.js" <<'EOF'
const fs = require('fs');
fs.writeFileSync(process.env.OVERLAP_CASE_FILE, 'x');
const began = Date.now();
(function poll() {
    if (fs.existsSync(process.env.OVERLAP_SYNC_FILE)) process.exit(0);
    if (Date.now() - began > 10000) { console.error('sync never started'); process.exit(1); }
    setTimeout(poll, 50);
})();
EOF
cat > "$WORK/overlap-sync.sh" <<'EOF'
: > "$OVERLAP_SYNC_FILE"
for i in $(seq 1 200); do [ -e "$OVERLAP_CASE_FILE" ] && exit 0; sleep 0.05; done
echo "no case ran while sync did"; exit 1
EOF
runner all-overlap TEST_CASES_DIR="$OVD" TEST_LINT_CMD=true TEST_SYNC_CMD="bash $WORK/overlap-sync.sh" \
    OVERLAP_CASE_FILE="$WORK/overlap-case-started" OVERLAP_SYNC_FILE="$WORK/overlap-sync-started" bash all.sh
[ "$CODE" = 0 ] && [ "$(tail -n 1 "$WORK/all-overlap.out")" = "PASS  all" ] && ok "sync and a case ran at the same time, under the one lock (no deadlock)" || fail "overlap run: exit $CODE: $(cat "$WORK/all-overlap.out")"

runner all-sync-fail TEST_CASES="01-pass" TEST_LINT_CMD=true TEST_SYNC_CMD=false bash all.sh
[ "$CODE" = 1 ] && [ "$(tail -n 1 "$WORK/all-sync-fail.out")" = "FAIL  sync" ] && ok "sync failing: exit 1, last line FAIL  sync" || fail "sync-fails run: exit $CODE, last line: $(tail -n 1 "$WORK/all-sync-fail.out")"

runner all-case-fail TEST_CASES="01-pass 02-fail" TEST_LINT_CMD=true TEST_SYNC_CMD=true bash all.sh
[ "$CODE" = 1 ] && [ "$(tail -n 1 "$WORK/all-case-fail.out")" = "FAIL  run: 02-fail.js" ] && ok "a case failing: exit 1, last line names it" || fail "case-fails run: exit $CODE, last line: $(tail -n 1 "$WORK/all-case-fail.out")"

runner all-lint-fail TEST_CASES="01-pass" TEST_LINT_CMD=false TEST_SYNC_CMD=true bash all.sh
[ "$CODE" = 1 ] && [ "$(tail -n 1 "$WORK/all-lint-fail.out")" = "FAIL  lint" ] && ok "lint failing: exit 1, last line FAIL  lint" || fail "lint-fails run: exit $CODE, last line: $(tail -n 1 "$WORK/all-lint-fail.out")"

echo "all.sh: serial cases wait for sync; one slot runs sync and the cases one after the other"
# selftest-serial-cases: 02 and 03 are parallel (0.8 s), 01 is serial. The sync
# stub takes 2 s, longer than the parallel batch, so a serial case that did not
# wait for sync would start inside it.
printf 'echo "start sync" >> "$SERIAL_LOG"\nsleep 2\necho "end sync" >> "$SERIAL_LOG"\n' > "$WORK/logging-sync.sh"
line() { grep -n -x -- "$2" "$1" | head -n 1 | cut -d: -f1; }   # line <file> <exact text>
SLOG="$WORK/all-serial-log"; : > "$SLOG"
runner all-serial TEST_CASES_DIR=selftest-serial-cases SERIAL_LOG="$SLOG" TEST_JOBS=3 TEST_LINT_CMD=true TEST_SYNC_CMD="bash $WORK/logging-sync.sh" bash all.sh
L_SYNC_START=$(line "$SLOG" "start sync"); L_SYNC_END=$(line "$SLOG" "end sync")
L_SERIAL_START=$(line "$SLOG" "start 01-serial"); L_PAR_END=$(line "$SLOG" "end 03-par-b")
{ [ "$CODE" = 0 ] && [ "$(tail -n 1 "$WORK/all-serial.out")" = "PASS  all" ]; } && ok "serial run through all.sh passes" || fail "all-serial run: exit $CODE"
{ [ -n "$L_SYNC_START" ] && [ -n "$L_PAR_END" ] && [ "$L_SYNC_START" -lt "$L_PAR_END" ] && [ "$L_PAR_END" -lt "$L_SYNC_END" ]; } && ok "the parallel cases ran alongside sync" || fail "parallel cases did not overlap sync: $(tr '\n' ',' < "$SLOG")"
{ [ -n "$L_SERIAL_START" ] && [ "$L_SERIAL_START" -gt "$L_SYNC_END" ]; } && ok "the serial case started only after sync ended" || fail "serial case ran while sync did: $(tr '\n' ',' < "$SLOG")"
[ "$(grep -c "^PASSED\|^  PASSED\|/ 3 passed" "$WORK/out-all-serial/summary.txt")" -ge 1 ] && ok "one combined summary covers all three cases" || fail "no combined summary"

SLOG="$WORK/all-one-slot-log"; : > "$SLOG"
runner all-one-slot TEST_CASES_DIR=selftest-serial-cases SERIAL_LOG="$SLOG" TEST_JOBS=1 TEST_LINT_CMD=true TEST_SYNC_CMD="bash $WORK/logging-sync.sh" bash all.sh
L_SYNC_START=$(line "$SLOG" "start sync"); L_SYNC_END=$(line "$SLOG" "end sync")
{ [ "$CODE" = 0 ] && [ -n "$L_SYNC_START" ] && [ "$L_SYNC_END" = "$((L_SYNC_START + 1))" ]; } && ok "TEST_JOBS=1: nothing ran inside sync" || fail "TEST_JOBS=1 overlapped sync (exit $CODE): $(tr '\n' ',' < "$SLOG")"

echo "all.sh: a TERM stops it at once, with sync's whole process tree and the lock"
SLOWC="$WORK/term-cases"; mkdir -p "$SLOWC"
echo "setInterval(() => {}, 1000);" > "$SLOWC/01-hang.js"
printf 'sleep 300 &\necho $! > "$TERM_CHILD_FILE"\nwait\n' > "$WORK/hang-sync.sh"
rm -f "$WORK/term-child"
runner_bg term-all TEST_CASES_DIR="$SLOWC" TEST_JOBS=3 TEST_CASE_TIMEOUT=300 TEST_LINT_CMD=true TEST_SYNC_CMD="bash $WORK/hang-sync.sh" TERM_CHILD_FILE="$WORK/term-child" bash all.sh
wait_file "$WORK/term-child" && ok "sync's grandchild process started" || fail "sync stub never started"
sleep 1
T0=$SECONDS
kill -TERM "$BG_PID" 2>/dev/null
wait "$BG_PID" 2>/dev/null
T_TERM=$((SECONDS - T0))
[ "$T_TERM" -le 8 ] && ok "all.sh ended ${T_TERM}s after the TERM" || fail "all.sh took ${T_TERM}s to stop"
CHILD=$(cat "$WORK/term-child" 2>/dev/null)
if [ -n "$CHILD" ] && kill -0 "$CHILD" 2>/dev/null; then fail "sync's grandchild (pid $CHILD) is still running"; kill -9 "$CHILD" 2>/dev/null; else ok "sync's whole process tree is gone"; fi
[ ! -e "$LOCK" ] && ok "the lock is released" || fail "the lock is still held after the TERM"

echo
if [ "$FAILED" = 0 ]; then
    echo "runner self-test: all checks passed"
else
    echo "runner self-test: FAILED. Runner outputs follow."
    for f in "$WORK"/*.out; do echo "--- $f"; cat "$f"; done
fi
exit "$FAILED"
