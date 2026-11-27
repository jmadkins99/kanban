// Cloud sync against the Firebase emulators (run via sync.sh). Two browsers
// sign in as the owner's account (the uid firestore.rules allows):
// - the first one's local board goes up to an empty cloud;
// - the second one gets it (as a new revision, so Undo still has its own),
//   and its local History days get imported;
// - board and History changes then show up live on the other browser, the
//   board with the day it last changed, which Auto-submit files it under;
// - a save made on an older board than the cloud's loses, even when it's the
//   later one (a Card edit in progress, a push still batched), but one made
//   on a board with the cloud's content goes up, even after a refusal;
// - a board save from a device that hasn't seen the cloud's current board
//   (offline, or queued offline and sent on a later open) is refused, and
//   that device takes the cloud's board;
// - Auto-submit only creates a History day: a device offline across midnight
//   doesn't overwrite the day another device filed, and takes the cloud's;
// - the rules let only the owner in, and only to the documents the app uses.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { openApp, moveCard, editCard, clickAway, fakeClock, setClock, wake } = require('../lib');

const OWNER = /userId == '([^']+)'/.exec(fs.readFileSync(path.join(__dirname, '../../firebase/firestore.rules'), 'utf8'))[1];

// The auth emulator takes unsigned custom tokens, so a test can be any uid.
function token(uid) {
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    return b64({ alg: 'none', typ: 'JWT' }) + '.' + b64({
        iss: 'firebase-auth-emulator@example.com', sub: 'firebase-auth-emulator@example.com',
        aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
        iat: now, exp: now + 3600, uid,
    }) + '.';
}

const devOptIn = () => localStorage.setItem('nullboard.firebaseDev', 'true');

const ready = (page) => page.evaluate(() => cloudSync.ready);

async function signIn(app, uid) {
    await app.page.evaluate((t) => firebase.auth().signInWithCustomToken(t), token(uid));
    await app.reload();
    assert.strictEqual(await ready(app.page), 'signed-in');
}

// Cards are saved as `notes`, Nullboard's name, so old boards, History days and export files load without a migration.
const firstCard = (page) => page.evaluate(() => NB.board.lists[0].notes[0].text);

async function editFirstCard(page, text) {
    await page.evaluate((text) => { setText($('.wrap .board .card .text').first(), text); saveBoard(); }, text);
}

const waitFor = (page, fn, arg) => page.waitForFunction(fn, { timeout: 20000, polling: 200 }, arg);

const cloudBoard = (page) => page.evaluate(() => firebase.firestore()
    .doc('users/' + firebase.auth().currentUser.uid + '/kanban/board').get({ source: 'server' })
    .then((s) => (s.exists ? s.data() : null)));

const deniedRead = (page, path) => page.evaluate((path) => firebase.firestore().doc(path).get({ source: 'server' })
    .then(() => 'allowed', (e) => e.code), path);

const deniedWrite = (page, path) => page.evaluate((path) => firebase.firestore().doc(path).set({ x: 1 })
    .then(() => 'allowed', (e) => e.code), path);

(async () => {
    const oldDay = (() => {
        const d = new Date(); d.setDate(d.getDate() - 20);
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    })();

    const a = await openApp([fakeClock(), devOptIn]);
    const b = await openApp([fakeClock(), new Function(`
        localStorage.setItem('nullboard.firebaseDev', 'true');
        if (! localStorage.getItem('nullboard.history'))
            localStorage.setItem('nullboard.history', JSON.stringify([{ day: '${oldDay}', title: 'Old', submittedAt: '${oldDay}T12:00:00.000Z',
                lists: [{ title: 'Done', notes: [{ text: 'from B', raw: false, min: false }] }] }]));`)]);
    const refusals = [];
    b.page.on('console', (m) => { if (m.text().includes('day write refused')) refusals.push(m.text()); });
    const aRefusals = [];
    a.page.on('console', (m) => { if (m.text().includes('board write refused')) aRefusals.push(m.text()); });
    try {
        // Signed out: the app stays local and offers sign-in.
        assert.strictEqual(await ready(a.page), 'signed-out');
        assert.ok(await a.page.evaluate(() => $('.config .sync-in').css('display') != 'none'), 'menu offers sign-in');
        assert.ok(await a.page.evaluate(() => $('.config .sync-out').css('display') == 'none'));

        // A's local edit goes up to the empty cloud on first sign-in.
        await editFirstCard(a.page, 'from A before sign-in');
        await signIn(a, OWNER);
        assert.ok(await a.page.evaluate(() => $('.config .sync-out').css('display') != 'none'), 'menu offers sign-out');
        assert.strictEqual(await a.page.evaluate(() => $('.firebase-emulator-warning').filter(':visible').length), 0, 'no emulator banner over the XP bar');
        for (let i = 0; i < 50 && ((await cloudBoard(a.page)) || { lists: [] }).lists[0]?.notes[0]?.text != 'from A before sign-in'; i++)
            await new Promise((r) => setTimeout(r, 200));
        assert.strictEqual((await cloudBoard(a.page)).lists[0].notes[0].text, 'from A before sign-in', 'local board uploaded');

        // B signs in to the same account: gets A's board as a new revision,
        // and its own History day goes up.
        const bBefore = await firstCard(b.page);
        await signIn(b, OWNER);
        await waitFor(b.page, () => NB.board.lists[0].notes[0].text == 'from A before sign-in').catch(async (e) => {
            const diag = await b.page.evaluate(async () => {
                const s = await firebase.firestore().doc('users/' + firebase.auth().currentUser.uid + '/kanban/board').get({ source: 'server' });
                return { uid: firebase.auth().currentUser.uid, cloud: s.exists ? s.data().lists[0].notes[0].text : null, local: NB.board.lists[0].notes[0].text, editing: $('.wrap .board .editing').length };
            });
            const aUid = await a.page.evaluate(() => firebase.auth().currentUser.uid);
            throw new Error("B never got A's board: " + JSON.stringify({ aUid, ...diag }) + ' ' + e.message);
        });
        const undoTo = await b.page.evaluate(() => {
            const hist = NB.storage.getBoardIndex().get(NB.board.id).history; // newest first
            return NB.storage.loadBoard(NB.board.id, hist[1]).lists[0].notes[0].text;
        });
        assert.strictEqual(undoTo, bBefore, 'the cloud board landed as a new revision, so Undo has B\'s own');
        await waitFor(a.page, (day) => loadHistory().some((e) => e.day == day), oldDay); // imported, and live on A

        // Live board: an edit on A shows up on B without a reload.
        await editFirstCard(a.page, 'live from A');
        await waitFor(b.page, () => NB.board.lists[0].notes[0].text == 'live from A');
        // ...with the day it last changed, so B's midnight Auto-submit files
        // it and clears Done even if A is closed by then.
        assert.strictEqual(await b.page.evaluate(() => NB.board.day), await a.page.evaluate(() => NB.board.day), 'B has the day A stamped the board with');

        // B's board landing while A edits a Card waits for the edit, so the
        // Card isn't yanked from under the cursor. Then A's save, made on the
        // older board, loses even though it's the later one: B's board wins
        // on A, in the cloud and on B, and Undo on A gets back A's edit.
        await a.page.setViewport({ width: 1280, height: 1000 });
        const second = '.wrap .board .list:nth-child(1) .card:nth-child(2)';
        await editCard(a.page, second);
        await a.page.keyboard.down('Control'); await a.page.keyboard.press('a'); await a.page.keyboard.up('Control');
        await a.page.keyboard.type('typed on A');
        await b.page.evaluate(() => { setText($('.wrap .board .list').last().find('.card .text').last(), 'saved on B meanwhile'); saveBoard(); });
        await new Promise((r) => setTimeout(r, 2500)); // B's board reaches A mid-edit
        assert.strictEqual(await a.page.evaluate(() => $('.wrap .board .card.editing').length), 1, 'A is still editing');
        await clickAway(a.page);
        const holdsText = (lists, t) => lists.some((l) => l.notes.some((n) => n.text == t));
        await waitFor(a.page, () => NB.board.lists.some((l) => l.notes.some((n) => n.text == 'saved on B meanwhile')));
        await new Promise((r) => setTimeout(r, 3000)); // A's push would have landed by now
        assert.ok(! holdsText(await a.page.evaluate(() => NB.board.lists), 'typed on A'), "B's board wins on A");
        assert.ok(holdsText((await cloudBoard(a.page)).lists, 'saved on B meanwhile'), 'in the cloud');
        assert.ok(! holdsText((await cloudBoard(a.page)).lists, 'typed on A'), "without A's edit");
        assert.ok(holdsText(await b.page.evaluate(() => NB.board.lists), 'saved on B meanwhile'), 'and on B');
        assert.ok(! holdsText(await b.page.evaluate(() => NB.board.lists), 'typed on A'), "without A's edit");
        assert.strictEqual(await a.page.evaluate(() => {
            const hist = NB.storage.getBoardIndex().get(NB.board.id).history; // newest first
            return NB.storage.loadBoard(NB.board.id, hist[1]).lists[0].notes[1].text;
        }), 'typed on A', "Undo on A gets back A's edit");

        // A Card's Priority goes across too, and B shows its icon.
        await a.page.evaluate(() => { setPriority($('.wrap .board .card').first(), 'critical'); saveBoard(); });
        await waitFor(b.page, () => NB.board.lists[0].notes[0].priority == 'critical');
        assert.strictEqual(await b.page.evaluate(() => $('.wrap .board .card-prio').first().attr('aria-label')), 'Priority: Critical', 'B shows the Critical icon');
        assert.strictEqual(await b.page.evaluate(() => NB.board.lists[0].notes[0].text), 'live from A', 'the text is untouched');
        // So does its Critical timer's start: B counts from the same moment.
        const since = await a.page.evaluate(() => NB.board.lists[0].notes[0].criticalSince);
        assert.ok(typeof since == 'number', 'A started the Critical timer: ' + since);
        await waitFor(b.page, (since) => NB.board.lists[0].notes[0].criticalSince == since, since);

        // So does each Card's Arrival: a Card A moves lands in the same place on B.
        const order = (page) => page.evaluate(() => NB.board.lists.map((l) => l.notes.map((n) => [n.text, n.priority, n.arrival])));
        const moved = await a.page.evaluate(() => NB.board.lists[0].notes[NB.board.lists[0].notes.length - 1].text);
        await moveCard(a.page, 0, -1, 1);
        await waitFor(b.page, (t) => NB.board.lists[1].notes.some((n) => n.text == t), moved);
        assert.deepStrictEqual(await order(b.page), await order(a.page), 'B has the same Cards, Priorities, Arrivals and order');

        // A save from a device that hasn't seen the cloud's current board is
        // refused: here B was offline while A moved a Card. `resume` brings B
        // back: its network again, or a later open that sends the write
        // queued offline.
        const has = (lists, i, t) => lists[i].notes.some((n) => n.text == t);
        const boardOf = (page) => page.evaluate(() => NB.board.lists);
        async function staleSaveRefused(edit, resume, batched) {
            await b.page.evaluate(() => firebase.firestore().disableNetwork());
            const t = await a.page.evaluate(() => NB.board.lists[0].notes[NB.board.lists[0].notes.length - 1].text);
            await moveCard(a.page, 0, -1, 1);
            await waitFor(a.page, (t) => firebase.firestore().doc('users/' + firebase.auth().currentUser.uid + '/kanban/board')
                .get({ source: 'server' }).then((s) => s.data().lists[1].notes.some((n) => n.text == t)), t);
            await b.page.evaluate((edit) => { setText($('.wrap .board .list').last().find('.card .text').last(), edit); saveBoard(); }, edit);
            if (! batched)
                await new Promise((r) => setTimeout(r, 1500)); // B's batched push is sent, queued while offline
            await resume();
            await waitFor(b.page, (t) => NB.board.lists[1].notes.some((n) => n.text == t), t);
            await new Promise((r) => setTimeout(r, 4000)); // B's stale write would have landed by now
            // The cloud keeps A's move, and so do A and B.
            assert.ok(has((await cloudBoard(a.page)).lists, 1, t), "the cloud keeps A's move");
            assert.ok(has(await boardOf(a.page), 1, t), 'so does A');
            assert.ok(has(await boardOf(b.page), 1, t), 'and B takes it');
            // B took the cloud's board as a new revision, so Undo on B still gets back what B had.
            const undoTo = await b.page.evaluate(() => {
                const hist = NB.storage.getBoardIndex().get(NB.board.id).history; // newest first
                const l = NB.storage.loadBoard(NB.board.id, hist[1]).lists;
                return l[l.length - 1].notes[l[l.length - 1].notes.length - 1].text;
            });
            assert.strictEqual(undoTo, edit, "Undo has B's own");
        }
        await staleSaveRefused('saved on B offline', () => b.page.evaluate(() => firebase.firestore().enableNetwork()));
        // B back within a second of its save: the cloud's board lands while
        // that save's push is still batched, and the save, made on B's older
        // board, doesn't go up.
        await staleSaveRefused('saved on B, back at once', () => b.page.evaluate(() => firebase.firestore().enableNetwork()), true);
        // B saving again just before it's back doesn't let its stale board
        // win: that save's push is still batched when the refusal lands.
        await staleSaveRefused('saved on B, then saved again', () => b.page.evaluate(() => {
            setText($('.wrap .board .list').eq(2).find('.card .text').first(), 'saved again on B');
            saveBoard();
            return firebase.firestore().enableNetwork();
        }));
        await staleSaveRefused('saved on B, sent next open', async () => {
            await b.reload();
            assert.strictEqual(await ready(b.page), 'signed-in');
        });

        // A and B save the same board, B's write lands first, and A saves
        // again before its own write of that board is refused. A's later save
        // was made on a board with the cloud's content, so it goes up, and
        // nothing is lost: B's save is inside it (#81).
        const holdsAll = (lists, ...ts) => ts.every((t) => holdsText(lists, t));
        const contentOf = (page) => page.evaluate(() => JSON.stringify([NB.board.day, NB.board.lists.map((l) => [l.title, l.notes.map((n) =>
            Object.keys(n).sort().filter((k) => k != 'raw' && k != 'min' && n[k] != null).map((k) => [k, n[k]]))])])); // as sync.js compares boards
        const refusalsBefore = aRefusals.length;
        const revisionBefore = await a.page.evaluate(() => NB.board.revision);
        await a.page.evaluate(() => firebase.firestore().disableNetwork());
        const saveSame = () => { setText($('.wrap .board .list').last().find('.card .text').last(), 'saved on both'); saveBoard(); };
        await a.page.evaluate(saveSame);
        await new Promise((r) => setTimeout(r, 1500)); // A's batched push is sent, queued while offline
        await b.page.evaluate(saveSame);
        await waitFor(b.page, () => firebase.firestore().doc('users/' + firebase.auth().currentUser.uid + '/kanban/board')
            .get({ source: 'server' }).then((s) => s.data().lists.some((l) => l.notes.some((n) => n.text == 'saved on both'))));
        assert.strictEqual(await contentOf(a.page), await contentOf(b.page), 'A and B saved the same board');
        await a.page.evaluate(() => {
            setText($('.wrap .board .list').eq(2).find('.card .text').first(), 'then saved again on A');
            saveBoard();
            return firebase.firestore().enableNetwork(); // within the second, so that save's push is still batched
        });
        await waitFor(b.page, () => NB.board.lists.some((l) => l.notes.some((n) => n.text == 'then saved again on A')));
        await new Promise((r) => setTimeout(r, 3000)); // anything else would have landed by now
        assert.strictEqual(aRefusals.length, refusalsBefore + 1, "A's write of the same board was refused: " + JSON.stringify(aRefusals));
        assert.ok(holdsAll((await cloudBoard(a.page)).lists, 'saved on both', 'then saved again on A'), "the cloud has A's later save, B's inside it");
        assert.ok(holdsAll(await boardOf(a.page), 'saved on both', 'then saved again on A'), 'so does A');
        assert.ok(holdsAll(await boardOf(b.page), 'saved on both', 'then saved again on A'), 'and B');
        assert.strictEqual(await contentOf(b.page), await contentOf(a.page), 'A and B end up with the same board');
        // The board A last saw, which the refusal rolls A back to, never
        // lands over A's later save: A's board holds just its own two saves.
        assert.strictEqual(await a.page.evaluate(() => NB.board.revision), revisionBefore + 2, "no other board landed on A");

        // So do a Recurring Card's Schedule and Due date, and A's own copy
        // coming back from the cloud isn't taken for a change.
        const recurring = (page) => page.evaluate(() => {
            for (const l of NB.board.lists) for (const n of l.notes) if (n.text == 'live from A') return [n.priority, n.schedule, n.due];
        });
        await a.page.evaluate(() => {
            const $c = $('.wrap .board .card').filter((_, c) => getText($(c).find('.text')) == 'live from A');
            const d = Due.edited(cardMeta($c), dueWhere($c), dueMoment(),
                { priority: 'recurring', schedule: Schedule.make(2, 'weeks', Schedule.today()), due: null, isNew: false, on: Schedule.today() });
            setPriority($c, 'recurring');
            applyDue($c, d);
            saveBoard();
        });
        const sent = await recurring(a.page);
        assert.strictEqual(sent[0], 'recurring');
        assert.ok(sent[1] && sent[2], 'A has a Schedule and Due date: ' + JSON.stringify(sent));
        await waitFor(b.page, () => NB.board.lists.some((l) => l.notes.some((n) => n.text == 'live from A' && n.schedule)));
        assert.deepStrictEqual(await recurring(b.page), sent, 'B has the same Schedule and Due date');
        const revA = await a.page.evaluate(() => NB.board.revision);
        await new Promise((r) => setTimeout(r, 3000));
        assert.strictEqual(await a.page.evaluate(() => NB.board.revision), revA, "A's echo from the cloud makes no new revision");

        // A Due date that has ended makes the Card Late on B too: a red icon, top of its List.
        await a.page.evaluate(() => {
            const $c = $('.wrap .board .card').filter((_, c) => getText($(c).find('.text')) == 'live from A');
            cardMeta($c).due = '2000-01-03';
            saveBoard();
        });
        await waitFor(b.page, () => NB.board.lists.some((l) => l.notes.some((n) => n.text == 'live from A' && n.due == '2000-01-03')));
        await waitFor(b.page, () => $('.wrap .board .card').filter((_, c) => getText($(c).find('.text')) == 'live from A').hasClass('late'));
        assert.deepStrictEqual(await b.page.evaluate(() => {
            const c = $('.wrap .board .card').filter((_, c) => getText($(c).find('.text')) == 'live from A');
            return [getComputedStyle(c.find('.card-prio svg')[0]).color, c.index()];
        }), ['rgb(255, 86, 48)', 0], 'B shows it Late: a red icon, at the top of its List');

        // Auto-submit waits for the cloud's board when signed in; that wait ends.
        assert.strictEqual(await Promise.race([b.page.evaluate(() => cloudSync.boardFresh.then(() => 'fresh')),
            new Promise((r) => setTimeout(r, 20000, 'never'))]), 'fresh', "the server's board was seen");

        // Live History: B files today, A sees it; B deletes it, A loses it.
        const today = await b.page.evaluate(() => dayKey(new Date()));
        await b.page.evaluate((day) => submitDay(day), today);
        await waitFor(a.page, (day) => loadHistory().some((e) => e.day == day && e.lists[0].notes[0].text == 'live from A'), today);
        await b.page.evaluate((day) => { $('.config .view-history').click(); $('.history-item[data-day="' + day + '"] .del-day').click(); }, today);
        await waitFor(a.page, (day) => ! loadHistory().some((e) => e.day == day), today);
        assert.ok(await a.page.evaluate((day) => loadHistory().some((e) => e.day == day), oldDay), 'other days untouched');

        // XP banked on one device reaches the other (the bank merges, never overwrites).
        await a.page.evaluate(() => XP.bankCards([{ xp: 2500, xpId: 'from-a' }]));
        await b.page.evaluate(() => XP.bankCards([{ xp: 2500, xpId: 'from-b' }]));
        await waitFor(a.page, () => 'from-b' in XP.bank() && 'from-a' in XP.bank());
        await waitFor(b.page, () => 'from-a' in XP.bank() && 'from-b' in XP.bank());

        // Auto-submit only creates a History day. B sits offline across
        // midnight with yesterday's board while A files the day; when B is
        // back, the day is still A's, in the cloud and on B, and B's stale
        // board save is refused too, so B takes the cloud's board.
        const day = await a.page.evaluate(() => dayKey(new Date()));
        const midnight = await a.page.evaluate(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 30).getTime(); });
        const setLastCard = (text) => { setText($('.wrap .board .list').last().find('.card .text').last(), text); saveBoard(); };
        const cloudDay = (page, day) => page.evaluate((day) => firebase.firestore().doc('users/' + firebase.auth().currentUser.uid + '/history/' + day)
            .get({ source: 'server' }).then((s) => (s.exists ? s.data() : null)), day);
        const mirrorDay = (page, day) => page.evaluate((day) => loadHistory().find((e) => e.day == day) || null, day);
        const holds = (entry, t) => !! entry && entry.lists.some((l) => l.notes.some((n) => n.text == t));
        await b.page.evaluate(() => firebase.firestore().disableNetwork());
        await a.page.evaluate(setLastCard, 'filed by A');
        await waitFor(a.page, () => firebase.firestore().doc('users/' + firebase.auth().currentUser.uid + '/kanban/board')
            .get({ source: 'server' }).then((s) => s.data().lists.some((l) => l.notes.some((n) => n.text == 'filed by A'))));
        await b.page.evaluate(setLastCard, 'stale on B');
        await new Promise((r) => setTimeout(r, 1500)); // B's batched push is sent, queued while offline
        await setClock(a.page, midnight);
        await wake(a.page);
        await waitFor(a.page, (day) => firebase.firestore().doc('users/' + firebase.auth().currentUser.uid + '/history/' + day)
            .get({ source: 'server' }).then((s) => s.exists), day);
        const filedByA = await cloudDay(a.page, day);
        assert.ok(holds(filedByA, 'filed by A'), 'A filed the day at midnight');
        await setClock(b.page, midnight);
        await wake(b.page);
        assert.ok(holds(await mirrorDay(b.page, day), 'stale on B'), 'B, offline, filed its stale board');
        await b.page.evaluate(() => firebase.firestore().enableNetwork());
        await waitFor(b.page, (day) => (loadHistory().find((e) => e.day == day) || { lists: [] }).lists
            .some((l) => l.notes.some((n) => n.text == 'filed by A')), day);
        await waitFor(b.page, () => NB.board.lists.some((l) => l.notes.some((n) => n.text == 'filed by A'))); // and the cloud's board
        await new Promise((r) => setTimeout(r, 4000)); // B's stale write would have landed by now
        await wake(b.page); // another tick doesn't file the day again
        await new Promise((r) => setTimeout(r, 2000));
        assert.deepStrictEqual(await cloudDay(a.page, day), filedByA, "the cloud keeps A's day");
        assert.deepStrictEqual(await mirrorDay(b.page, day), filedByA, 'and B takes it');
        assert.deepStrictEqual(await mirrorDay(a.page, day), filedByA, 'so does A');
        assert.strictEqual(refusals.length, 1, 'B tried once, not in a loop: ' + JSON.stringify(refusals));

        // Rules: only the owner, only the app's documents; signed out sees nothing.
        const uid = await a.page.evaluate(() => firebase.auth().currentUser.uid);
        assert.strictEqual(uid, OWNER);
        assert.strictEqual(await deniedRead(a.page, 'users/someone-else/kanban/board'), 'permission-denied');
        assert.strictEqual(await deniedWrite(a.page, 'users/someone-else/kanban/board'), 'permission-denied', "can't write someone else's data");
        assert.strictEqual(await deniedWrite(a.page, 'users/' + OWNER + '/junk/x'), 'permission-denied', 'only the documents the app uses');
        assert.strictEqual(await deniedWrite(a.page, 'users/' + OWNER + '/kanban/other'), 'permission-denied');
        await Promise.all([
            b.page.waitForNavigation({ waitUntil: 'load' }),
            b.page.evaluate(() => { $('.config .sync-out').click(); }),
        ]);
        assert.strictEqual(await ready(b.page), 'signed-out');
        assert.strictEqual(await deniedRead(b.page, 'users/' + uid + '/kanban/board'), 'permission-denied');
        assert.strictEqual(await firstCard(b.page), 'live from A', 'signed out, B keeps its local copy');

        // Any other account, even signed in, gets nothing, not even its own tree.
        await b.page.evaluate((t) => firebase.auth().signInWithCustomToken(t), token('stranger'));
        assert.strictEqual(await deniedWrite(b.page, 'users/stranger/kanban/board'), 'permission-denied', 'strangers get nothing');
        assert.strictEqual(await deniedRead(b.page, 'users/' + OWNER + '/kanban/board'), 'permission-denied');

        assert.deepStrictEqual([...a.errors, ...b.errors], [], 'no page errors');
    } finally {
        await a.close();
        await b.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
