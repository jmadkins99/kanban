# Coding standards

Read at review. `tests/all.sh` already enforces what a tool can check (the
lint's undefined names, the tests); these are the judgement calls.

## Tests: replace, don't layer

When a rule moves into a module with its own table of rows (for example
`tests/cases/due-date-rules.js` for `js/due.js`):

- The rule is checked by its row, with the day passed in. The E2E click case
  that checked the same rule loses that assertion, and keeps one wiring check:
  that a click really reaches the module and its decision is applied.
- An E2E assertion left after the move is a wiring check, or it belongs to a
  rule still outside the module. Anything else is a rule asserted twice.
- Every step comment in a case sits over the assertion it describes. When an
  assertion goes, its comment goes or is reworded to the steps that remain.
