#!/usr/bin/env bash
# `bash sync/skew.sh <commit>`: whether a phone on this checkout and a tab
# still open on <commit> (an older version) sync without trading the board
# (see skew.js). Makes a worktree of <commit> outside the repo, runs skew.js
# on the Firebase emulators with it, removes the worktree, and prints only
# the verdict: `GREEN  skew <commit>`, or `RED  skew <commit>` and what went
# wrong. Exits non-zero on RED. Needs Java 21+.
set -u
[ $# = 1 ] || { echo "usage: bash sync/skew.sh <commit>"; exit 2; }
cd "$(dirname "$0")/.."

[ -d node_modules ] || npm ci --no-audit --no-fund || exit 1

tmp=$(mktemp -d)
trap 'git worktree remove --force "$tmp/old" >/dev/null 2>&1; rm -rf "$tmp"' EXIT
git worktree add --detach "$tmp/old" "$1" >/dev/null 2>&1 || { echo "no such commit: $1"; exit 2; }

# Paths for node, which on Windows doesn't read Git Bash's /c/... form.
win() { command -v cygpath >/dev/null && cygpath -m "$1" || echo "$1"; }

cd ../firebase || exit 1 # firebase-tools reads firebase.json from here
SKEW_ROOT=$(win "$tmp/old") SKEW_OUT=$(win "$tmp/verdict") SKEW_COMMIT="$1" \
    npx -y firebase-tools@15.36.0 emulators:exec --project demo-kanban --only auth,firestore \
    "node ../tests/sync/skew.js" > "$tmp/log" 2>&1
status=$?
if [ -s "$tmp/verdict" ]; then cat "$tmp/verdict"; else echo "ERROR  skew $1"; tail -20 "$tmp/log" | sed 's/^/      /'; fi
exit $status
