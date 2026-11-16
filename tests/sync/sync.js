// Cloud sync against the Firebase emulators (run via sync.sh). Two browsers
// sign in as the same Google account:
// - the first one's local board goes up to an empty cloud;
// - the second one gets it (as a new revision, so Undo still has its own),
//   and its local History days get imported;
// - board and History changes then show up live on the other browser;
// - the rules keep each account to its own data.
const assert = require('assert');
const { openApp } = require('../lib');

const devOptIn = () => localStorage.setItem('nullboard.firebaseDev', 'true');

const ready = (page) => page.evaluate(() => cloudSync.ready);

async function signIn(app, sub) {
    // The auth emulator takes an unsigned Google ID token as a credential.
    await app.page.evaluate((sub) => firebase.auth().signInWithCredential(
        firebase.auth.GoogleAuthProvider.credential(JSON.stringify({ sub, email: sub + '@example.com', email_verified: true }))), sub);
    await app.reload();
    assert.strictEqual(await ready(app.page), 'signed-in');
}

const firstNote = (page) => page.evaluate(() => NB.board.lists[0].notes[0].text);

async function editFirstNote(page, text) {
    await page.evaluate((text) => { setText($('.wrap .board .note .text').first(), text); saveBoard(); }, text);
}

const waitFor = (page, fn, arg) => page.waitForFunction(fn, { timeout: 20000, polling: 200 }, arg);

const cloudBoard = (page) => page.evaluate(() => firebase.firestore()
    .doc('users/' + firebase.auth().currentUser.uid + '/kanban/board').get({ source: 'server' })
    .then((s) => (s.exists ? s.data() : null)));

const deniedRead = (page, path) => page.evaluate((path) => firebase.firestore().doc(path).get({ source: 'server' })
    .then(() => 'allowed', (e) => e.code), path);

(async () => {
    const oldDay = (() => {
        const d = new Date(); d.setDate(d.getDate() - 20);
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    })();

    const a = await openApp(devOptIn);
    const b = await openApp(new Function(`
        localStorage.setItem('nullboard.firebaseDev', 'true');
        if (! localStorage.getItem('nullboard.history'))
            localStorage.setItem('nullboard.history', JSON.stringify([{ day: '${oldDay}', title: 'Old', submittedAt: '${oldDay}T12:00:00.000Z',
                lists: [{ title: 'Done', notes: [{ text: 'from B', raw: false, min: false }] }] }]));`));
    try {
        // Signed out: the app stays local and offers sign-in.
        assert.strictEqual(await ready(a.page), 'signed-out');
        assert.ok(await a.page.evaluate(() => $('.config .sync-in').css('display') != 'none'), 'menu offers sign-in');
        assert.ok(await a.page.evaluate(() => $('.config .sync-out').css('display') == 'none'));

        // A's local edit goes up to the empty cloud on first sign-in.
        await editFirstNote(a.page, 'from A before sign-in');
        await signIn(a, 'alice');
        assert.ok(await a.page.evaluate(() => $('.config .sync-out').css('display') != 'none'), 'menu offers sign-out');
        for (let i = 0; i < 50 && ((await cloudBoard(a.page)) || { lists: [] }).lists[0]?.notes[0]?.text != 'from A before sign-in'; i++)
            await new Promise((r) => setTimeout(r, 200));
        assert.strictEqual((await cloudBoard(a.page)).lists[0].notes[0].text, 'from A before sign-in', 'local board uploaded');

        // B signs in to the same account: gets A's board as a new revision,
        // and its own History day goes up.
        const bBefore = await firstNote(b.page);
        await signIn(b, 'alice');
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
        await editFirstNote(a.page, 'live from A');
        await waitFor(b.page, () => NB.board.lists[0].notes[0].text == 'live from A');

        // Live History: B submits today, A sees it; B deletes it, A loses it.
        const today = await b.page.evaluate(() => dayKey(new Date()));
        await b.page.evaluate(() => $('.submit-day').click());
        await waitFor(a.page, (day) => loadHistory().some((e) => e.day == day && e.lists[0].notes[0].text == 'live from A'), today);
        await b.page.evaluate((day) => $('.history-item[data-day="' + day + '"] .del-day').click(), today);
        await waitFor(a.page, (day) => ! loadHistory().some((e) => e.day == day), today);
        assert.ok(await a.page.evaluate((day) => loadHistory().some((e) => e.day == day), oldDay), 'other days untouched');

        // Rules: another account's data is off limits, and signed out sees nothing.
        const uid = await a.page.evaluate(() => firebase.auth().currentUser.uid);
        assert.strictEqual(await deniedRead(a.page, 'users/someone-else/kanban/board'), 'permission-denied');
        await Promise.all([
            b.page.waitForNavigation({ waitUntil: 'load' }),
            b.page.evaluate(() => { $('.config .sync-out').click(); }),
        ]);
        assert.strictEqual(await ready(b.page), 'signed-out');
        assert.strictEqual(await deniedRead(b.page, 'users/' + uid + '/kanban/board'), 'permission-denied');
        assert.strictEqual(await firstNote(b.page), 'live from A', 'signed out, B keeps its local copy');

        assert.deepStrictEqual([...a.errors, ...b.errors], [], 'no page errors');
    } finally {
        await a.close();
        await b.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
