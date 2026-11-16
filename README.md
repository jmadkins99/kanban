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
- **WIP timer**: a list named "wip" (any case) shows a live timer on each
  note, counting from when that note entered it; it starts over if the note
  leaves and comes back.
- **Done list**: a list named "done" (any case) strikes through its notes.
  Submit Day snapshots the board with them, then clears that list.
  Dragging a note into Done plays gym-tracker's PR celebration on the card
  with a "+2500 XP" badge and a screen flash (`celebrate.js`).
- **XP bar**: World of Warcraft classic's experience bar along the bottom,
  recreated in CSS (`xp.js`). Each note moved into Done earns 2500 XP, plus
  57.5 XP (0.5% of a level) per whole minute of its last WIP visit, up to 8
  hours; a level is 11500 XP. XP leaves with a note that leaves Done, and
  Submit Day banks it. "XP bars" in UI preferences sets the number of bubbles (20).
- **Levels and ranks**: beside Submit Day, your level with a rank name and
  insignia. The 70 rank names follow Call of Duty: Modern Warfare 2; the
  insignia are original SVGs modelled on real US military rank insignia
  (`ranks.js`), not the game's art. Reaching a new level by finishing a note
  plays a WoW-inspired level-up (`levelup.js`).
- **Card menu**: hovering a note (tapping it on a phone) slides down Move,
  Edit and Delete (`cardmenu.js`); Move steps it one list left or right.
  Drag and drop still works: hold anywhere on the card.
- **Starter board**: a first visit starts with four empty lists, Backlog,
  To-Do, WIP and Done.
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
