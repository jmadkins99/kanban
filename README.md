# Kanban

> **Credit:** this is built on [Nullboard](https://github.com/apankrat/nullboard)
> by Alexander Pankratov ([nullboard.io](https://nullboard.io)). The board
> itself (lists, cards, drag and drop, undo, export) is his work, used under
> Nullboard's license, see [LICENSE](LICENSE).

A personal kanban board. Live at https://jmadkins99.github.io/kanban/

It's Nullboard with a few changes:

- **Colors**: always dark, using gym-tracker's palette and its daily accent
  rotation (`js/accentColor.js` is a straight copy), so both apps show the same
  color on the same day.
- **Clear**: a list menu option that empties a list's cards but keeps the list.
- **Auto-submit**: at midnight the day submits itself, saving a snapshot of
  the whole board to **History**, which shows past days one week at a time.
  If the tab isn't open then, it happens the next time it opens, filed under
  the last day the board changed. There's no button and no prompt. Entries can be deleted. History is in
  the ≡ menu; the board's name there goes back to the board.
- **WIP timer**: a list named "wip" (any case) shows a live timer on each
  card, counting from when that card entered it; it starts over if the card
  leaves and comes back.
- **Critical timer**: a Critical card outside WIP and Done shows the same
  timer in red, whatever the day's accent, for how long it has waited to get
  into WIP. It starts when the card becomes Critical and starts over each
  time it moves into another such list; in WIP the WIP timer takes over, and
  Done shows none. It counts from a time stored on the card, so it syncs.
- **Done list**: a list named "done" (any case) strikes through its cards.
  Auto-submit snapshots the board with them, then clears that list.
  Moving a card into Done plays gym-tracker's PR celebration on the card
  with a "+2500 XP" badge and a screen flash (`js/celebrate.js`).
- **XP bar**: World of Warcraft classic's experience bar along the bottom,
  recreated in CSS (`js/xp.js`). Each card moved into Done earns 2500 XP, plus
  57.5 XP per whole minute of its last WIP visit, up to 8 hours. Level 1
  takes 11500 XP and each level after costs 2% more than the last (44209 XP
  for 69 to 70). XP leaves with a card that leaves Done, and
  Auto-submit banks it. "XP bars" in UI preferences sets the number of bubbles (20).
- **Levels and ranks**: centered above the XP bar, your level with a rank name and
  insignia. The 70 rank names follow Call of Duty: Modern Warfare 2; the
  insignia are original SVGs modelled on real US military rank insignia
  (`js/ranks.js`), not the game's art. Reaching a new level by finishing a card
  plays a WoW-inspired level-up (`js/levelup.js`).
- **Card menu**: clicking a card (tapping it on a phone) slides down one row,
  ⬅️ Edit ➡️ (`js/cardmenu.js`), and moving off the card closes it. The
  arrows step it one list left or right, greyed out at the first and last
  list. Cards don't drag. In edit mode a small × at the card's right edge
  deletes it, asking first if it has text.
- **Priority**: every card is Recurring, Critical, Medium or Low (Low
  unless set), shown as a Jira-style icon at its left, in History too
  (original SVGs in `js/priority.js`, not Atlassian's). In edit mode the icon
  is a dropdown; clicking away saves the text and Priority as one Undo step.
- **Big screens**: everything scales with the screen's height from a 1080p
  baseline (1.33x on a 3440x1440 ultrawide, full-screen or half); a font
  size set in UI preferences still wins.
- **Starter board**: a first visit starts with four empty lists, Backlog,
  To-Do, WIP and Done.
- **One board**: no adding, deleting or switching boards. Import replaces the
  board (Undo brings the old one back).
- **Sync** (optional): "Sign in to sync..." in the ≡ menu keeps the board
  and History in Firestore, live across devices (`js/sync.js`). Signed out,
  everything stays in the browser's `localStorage`, as in Nullboard.

Everything else (undo/redo, export) is Nullboard's.

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

Security rules live in `firebase/firestore.rules`: only the owner's account, and only
the documents the app uses. They're deployed by hand after they merge, with
`cd firebase && npx -y firebase-tools@15.36.0 deploy --only firestore:rules`.

## License

Nullboard's 2-clause BSD license with the Commons Clause, see [LICENSE](LICENSE).
