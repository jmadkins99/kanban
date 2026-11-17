// Cloud sync against the Firebase emulators (run via sync.sh). Two browsers
// sign in as the owner's account (the uid firestore.rules allows):
// - the first one's local board goes up to an empty cloud;
// - the second one gets it (as a new revision, so Undo still has its own),
//   and its local History days get imported;
// - board and History changes then show up live on the other browser;
// - the rules let only the owner in, and only to the documents the app uses.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { openApp } = require('../lib');

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

const deniedWrite = (page, path) => page.evaluate((path) => firebase.firestore().doc(path).set({ x: 1 })
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
        await signIn(a, OWNER);
        assert.ok(await a.page.evaluate(() => $('.config .sync-out').css('display') != 'none'), 'menu offers sign-out');
        assert.strictEqual(await a.page.evaluate(() => $('.firebase-emulator-warning').filter(':visible').length), 0, 'no emulator banner over the XP bar');
        for (let i = 0; i < 50 && ((await cloudBoard(a.page)) || { lists: [] }).lists[0]?.notes[0]?.text != 'from A before sign-in'; i++)
            await new Promise((r) => setTimeout(r, 200));
        assert.strictEqual((await cloudBoard(a.page)).lists[0].notes[0].text, 'from A before sign-in', 'local board uploaded');

        // B signs in to the same account: gets A's board as a new revision,
        // and its own History day goes up.
        const bBefore = await firstNote(b.page);
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
        await editFirstNote(a.page, 'live from A');
        await waitFor(b.page, () => NB.board.lists[0].notes[0].text == 'live from A');

        // Live History: B submits today, A sees it; B deletes it, A loses it.
        const today = await b.page.evaluate(() => dayKey(new Date()));
        await b.page.evaluate(() => $('.submit-day').click());
        await waitFor(a.page, (day) => loadHistory().some((e) => e.day == day && e.lists[0].notes[0].text == 'live from A'), today);
        await b.page.evaluate((day) => $('.history-item[data-day="' + day + '"] .del-day').click(), today);
        await waitFor(a.page, (day) => ! loadHistory().some((e) => e.day == day), today);
        assert.ok(await a.page.evaluate((day) => loadHistory().some((e) => e.day == day), oldDay), 'other days untouched');

        // XP banked on one device reaches the other (the bank merges, never overwrites).
        await a.page.evaluate(() => XP.bankNotes([{ xp: 2500, xpId: 'from-a' }]));
        await b.page.evaluate(() => XP.bankNotes([{ xp: 2500, xpId: 'from-b' }]));
        await waitFor(a.page, () => 'from-b' in XP.bank() && 'from-a' in XP.bank());
        await waitFor(b.page, () => 'from-a' in XP.bank() && 'from-b' in XP.bank());

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
        assert.strictEqual(await firstNote(b.page), 'live from A', 'signed out, B keeps its local copy');

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
