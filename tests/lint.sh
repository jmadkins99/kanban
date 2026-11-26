#!/usr/bin/env bash
# Lints the app (index.html and js/) and the tests with eslint.config.js: a
# name used that nothing defines, and in the tests an unused import or
# variable. Fast, no browser. Exits non-zero on any problem.
set -u
cd "$(dirname "$0")"

[ -d node_modules ] || npm ci --no-audit --no-fund || exit 1

cd .. && tests/node_modules/.bin/eslint -c tests/eslint.config.js index.html js tests --ignore-pattern "tests/node_modules/" && echo "PASS  lint"
