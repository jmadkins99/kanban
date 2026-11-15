# Kanban

> **Credit:** this is built on [Nullboard](https://github.com/apankrat/nullboard)
> by Alexander Pankratov ([nullboard.io](https://nullboard.io)). The board
> itself (lists, notes, drag and drop, undo, export) is his work, used under
> Nullboard's license, see [LICENSE](LICENSE).

A personal kanban board. Live at https://jmadkins99.github.io/kanban/

It's Nullboard with a few changes:

- **Colors**: always dark, using gym-tracker's palette and its daily accent
  rotation (`accentColor.js` is a straight copy), so both apps show the same
  color on the same day.
- **Clear**: a list menu option that empties a list's notes but keeps the list.
- **Submit Day**: saves a snapshot of the whole board to **History**, which
  shows past days one week at a time. Entries can be deleted. History is in
  the ≡ menu; the board's name there goes back to the board.
- **One board**: no adding, deleting or switching boards. Import replaces the
  board (Undo brings the old one back).
- **Sync** (optional): "Sign in to sync..." in the ≡ menu keeps the board
  and History in Firestore, live across devices (`sync.js`). Signed out,
  everything stays in the browser's `localStorage`, as in Nullboard.

Everything else (drag and drop, undo/redo, export) is Nullboard's.

## Development

Needs Python, Node and Chrome; the sync tests also need Java 21+.

```bash
python -m http.server 8003   # then open http://localhost:8003/
cd tests && bash run.sh      # end-to-end tests; installs puppeteer-core
cd tests && bash sync.sh     # sync tests against the Firebase emulators
```

Only the live site talks to the real Firebase project (`jmadkins-kanban`).
To try sign-in and sync locally, run `bash tests/emulators.sh`, then in the
page's console run `localStorage.setItem('nullboard.firebaseDev', 'true')`
and reload: it signs in with fake accounts against the local emulators.

Security rules live in `firestore.rules`; deploy them with
`firebase deploy --only firestore`.

## License

Nullboard's 2-clause BSD license with the Commons Clause, see [LICENSE](LICENSE).
