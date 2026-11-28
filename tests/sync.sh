#!/usr/bin/env bash
# Cloud-sync tests: runs sync/sync.js inside `firebase emulators:exec`, which
# starts the auth and Firestore emulators with this repo's firestore.rules and
# stops them afterwards. Needs Java 21+. Exits non-zero if any case fails.
# `SYNC_ONLY=<text> bash sync.sh` runs the shared setup and only the
# scenarios whose name contains <text>, and lists the ones it ran.
# Run by hand it takes the machine-wide test lock first, like run.sh; all.sh,
# which already holds it, sets TEST_LOCK_HELD=1.
set -u
cd "$(dirname "$0")"
. ./proc.sh

WORK=$(mktemp -d)
EMU_PID=''
cleanup() {
    trap '' INT TERM
    [ -z "$EMU_PID" ] || kill_tree "$EMU_PID"
    drop_test_lock
    rm -rf "$WORK"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

[ -d node_modules ] || npm ci --no-audit --no-fund || exit 1

if [ "${TEST_LOCK_HELD:-}" != 1 ]; then
    take_test_lock "$WORK" || { echo "FAIL  could not take the test lock"; exit 1; }
fi

cd ../firebase || exit 1  # firebase-tools reads firebase.json from here

name="sync/sync.js${SYNC_ONLY:+ (SYNC_ONLY=$SYNC_ONLY)}"

# The emulators' start-up chatter goes to a log, shown only if sync fails.
# Run in the background and waited for, so a TERM is acted on at once.
log=../tests/sync-emulators.log
npx -y firebase-tools@15.36.0 emulators:exec --project demo-kanban --only auth,firestore \
    "node ../tests/sync/sync.js" > "$log" 2>&1 &
EMU_PID=$!
if wait "$EMU_PID"; then
    EMU_PID=''
    echo "PASS  $name"
    [ -z "${SYNC_ONLY:-}" ] || grep '^scenario: ' "$log" | sed 's/^/      /'
else
    EMU_PID=''
    echo "FAIL  $name"; sed 's/^/      /' "$log"; exit 1
fi
