# Coding standards

Read at review. `tests/all.sh` already enforces what a tool can check (the
lint's undefined names, the tests); these are the judgement calls.

## Tests: replace, don't layer

When a rule moves into a module with its own table of rows (for example
`tests/cases/due-date-rules.js` for `js/due.js`):

- The rule is checked by its row, with the day passed in. The E2E click case
  that checked the same rule loses that assertion, and keeps its wiring
  checks: that a click really reaches the module and its decision is applied.
- A **wiring check** covers what the page does with a Decision: the class,
  colour or text it draws, where the Card lands in the DOM, and that it
  survives a reload. A row proves the Decision; only an E2E case proves the
  page draws it. Keep one E2E assertion for each distinct thing the page
  draws.
- An E2E assertion left after the move is a wiring check, or it belongs to a
  rule still outside the module. Anything else is a rule asserted twice.
- Every step comment in a case sits over the assertion it describes. When an
  assertion goes, its comment goes or is reworded to the steps that remain.

## Tests: sync fixes

- A sync fix's case in `tests/sync/sync.js` fails on the emulators without
  the fix. A claim about the order Firestore delivers events in (a write's
  refusal, a rolled-back snapshot, another device's board) is checked by a
  run there, not traced against mocked snapshots.

## Module headers

A `js/*.js` module opens with a header comment that is its contract: the
next agent reads it in place of the code.

- Every claim in the header matches the code exactly, deliberate exceptions
  included. "Uses the same rule as X" holds only if no case differs; otherwise
  the header names the case that does.
- Wording taken from a ticket is checked against the code before it goes in
  the header.
