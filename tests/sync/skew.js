// Version skew, run by skew.sh on the Firebase emulators: device A (a
// desktop) serves an older commit, SKEW_ROOT, and device B (a phone) serves
// this checkout. Both sign in to one account, then B moves Cards. Backlog
// holds a dated Critical Card and an earlier Recurring one, which the two
// sides of #88 sort in opposite orders, so a version that sends back its own
// sort of the other's board makes the two trade it without end (#90).
//
// Prints GREEN, or RED with what went wrong: B redrew the board (on a phone
// that throws it back to Backlog), B's lists scrolled back to Backlog, B's
// writes were refused, B had a page error, or the cloud board kept changing.
const fs = require('fs');
const path = require('path');
const { openApp, token, moveCard, fakeClock, seedBoard, sleep } = require('../lib');

const OWNER = /userId == '([^']+)'/.exec(fs.readFileSync(path.join(__dirname, '../../firebase/firestore.rules'), 'utf8'))[1];
const COMMIT = process.env.SKEW_COMMIT;
const MOVES = 4;

const weekly = { every: 1, start: '2028-11-05', unit: 'weeks' };
const LISTS = [
    { title: 'Backlog', notes: [
        { text: 'critical Dec 20', priority: 'critical', arrival: 1, due: '2028-12-20' },
        { text: 'recurring Dec 3', priority: 'recurring', arrival: 2, schedule: weekly, due: '2028-12-03' },
    ] },
    { title: 'To-Do', notes: [1, 2, 3, 4].map((i) => ({ text: 'to do ' + i, priority: 'medium', arrival: 2 + i })) },
    { title: 'WIP', notes: [] },
    { title: 'Done', notes: [] },
];

const devOptIn = () => localStorage.setItem('nullboard.firebaseDev', 'true');
// Counts B's redraws.
const countRedraws = () => addEventListener('DOMContentLoaded', () => {
    window.redraws = 0;
    const show = window.showBoard;
    window.showBoard = function () { window.redraws++; return show.apply(this, arguments); };
});

const cloudRev = (page) => page.evaluate(() => firebase.firestore()
    .doc('users/' + firebase.auth().currentUser.uid + '/kanban/board').get({ source: 'server' })
    .then((s) => (s.exists ? s.data().rev : null)));

const signIn = async (app) => {
    await app.page.evaluate((t) => firebase.auth().signInWithCustomToken(t), token(OWNER));
    await app.reload();
};

const state = (page) => page.evaluate(() => ({
    redraws: window.redraws,
    x: Math.round($('.wrap .board .lists')[0].scrollLeft),
}));

(async () => {
    const clock = fakeClock('2028-12-01 10:00');
    const a = await openApp([clock, devOptIn, seedBoard({ id: 60, title: 'Skew', day: '2028-12-01', lists: LISTS })],
        { demo: false, root: process.env.SKEW_ROOT });
    const b = await openApp([clock, devOptIn, countRedraws], { demo: false });
    const refused = [];
    b.page.on('console', (m) => { if (m.text().includes('refused')) refused.push(m.text()); });
    const red = [];
    try {
        await b.page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
        await signIn(a);
        await a.page.waitForFunction(() => firebase.auth().currentUser, { timeout: 20000 });
        for (let i = 0; i < 100 && ! (await cloudRev(a.page)); i++) await sleep(200);
        await signIn(b);
        await b.page.waitForFunction(() => NB.board.lists[1].notes.some((n) => n.text == 'to do 1'), { timeout: 20000 });
        await sleep(4000);

        for (let i = 0; i < MOVES; i++) {
            await b.page.evaluate(() => { $('.wrap .board .lists')[0].scrollLeft = 400; });
            const before = await state(b.page);
            await moveCard(b.page, 1, 0, 1); // To-Do to WIP
            await sleep(5000);
            const after = await state(b.page);
            if (after.redraws > before.redraws) red.push(`move ${i + 1}: B redrew the board ${after.redraws - before.redraws}x`);
            if (after.x < 30) red.push(`move ${i + 1}: B scrolled back to Backlog`);
        }
        const rev = await cloudRev(a.page);
        await sleep(3000);
        if (await cloudRev(a.page) !== rev) red.push('the cloud board keeps changing');
        if (refused.length) red.push(`B's writes were refused ${refused.length}x`);
        if (b.errors.length) red.push('B had page errors: ' + b.errors.join(' | '));
    } finally {
        await a.close();
        await b.close();
    }
    // To a file, since skew.sh keeps the emulators' output out of sight.
    fs.writeFileSync(process.env.SKEW_OUT, (red.length ? `RED  skew ${COMMIT}\n` + red.map((r) => '      ' + r).join('\n') : `GREEN  skew ${COMMIT}`) + '\n');
    process.exit(red.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
