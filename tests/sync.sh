#!/usr/bin/env bash
# Cloud-sync tests: runs sync/sync.js inside `firebase emulators:exec`, which
# starts the auth and Firestore emulators with this repo's firestore.rules and
# stops them afterwards. Needs Java 21+. Exits non-zero if any case fails.
# `SYNC_ONLY=<text> bash sync.sh` runs the shared setup and only the
# scenarios whose name contains <text>, and lists the ones it ran.
set -u
cd "$(dirname "$0")"

[ -d node_modules ] || npm ci --no-audit --no-fund || exit 1

cd ../firebase || exit 1  # firebase-tools reads firebase.json from here

name="sync/sync.js${SYNC_ONLY:+ (SYNC_ONLY=$SYNC_ONLY)}"

# The emulators' start-up chatter goes to a log, shown only if sync fails.
log=../tests/sync-emulators.log
if npx -y firebase-tools@15.36.0 emulators:exec --project demo-kanban --only auth,firestore \
    "node ../tests/sync/sync.js" > "$log" 2>&1; then
    echo "PASS  $name"
    [ -z "${SYNC_ONLY:-}" ] || grep '^scenario: ' "$log" | sed 's/^/      /'
else
    echo "FAIL  $name"; sed 's/^/      /' "$log"; exit 1
fi
