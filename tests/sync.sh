#!/usr/bin/env bash
# Cloud-sync tests: runs sync/sync.js inside `firebase emulators:exec`, which
# starts the auth and Firestore emulators with this repo's firestore.rules and
# stops them afterwards. Needs Java 21+. Exits non-zero if any case fails.
set -u
cd "$(dirname "$0")"

[ -d node_modules ] || npm ci --no-audit --no-fund || exit 1

cd ../firebase || exit 1  # firebase-tools reads firebase.json from here
npx -y firebase-tools@15.36.0 emulators:exec --project demo-kanban --only auth,firestore \
    "node ../tests/sync/sync.js" && echo "PASS  sync/sync.js"
