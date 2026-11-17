#!/usr/bin/env bash
# Starts the local Firebase emulators (auth + Firestore, with this repo's
# firestore.rules) for testing sign-in and sync on localhost without touching
# the real project. Needs Java 21+. Then, in the page's browser console:
#   localStorage.setItem('nullboard.firebaseDev', 'true')
# and reload. "Sign in to sync..." in the menu opens a fake account picker.
cd "$(dirname "$0")/../firebase" || exit 1
exec npx -y firebase-tools@15.36.0 emulators:start --project demo-kanban --only auth,firestore
