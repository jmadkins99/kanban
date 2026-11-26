// The Card editor shows no tag from the board: a Recurring Card's purple
// "Next:", a Critical Card's red timer or red "Next:", a WIP Card's timer.
// Each one shows on the board, then not while its Card is being edited (it
// once sat over the Low button).
const assert = require('assert');
const { openApp, sleep, fakeClock, seedBoard, clickAway, editCard } = require('../lib');

const since = new Date(2028, 1, 23, 8).getTime();
const LISTS = [
    { title: 'Backlog', notes: [
        { text: 'water plants', priority: 'recurring', arrival: 1, schedule: { every: 1, start: '2028-02-01', unit: 'weeks' }, due: '2028-02-29' },
        { text: 'renew passport', priority: 'critical', arrival: 2, due: '2028-03-02' },
    ] },
    { title: 'To-Do', notes: [{ text: 'call bank', priority: 'critical', arrival: 3, criticalSince: since }] },
    { title: 'WIP', notes: [{ text: 'write report', priority: 'low', arrival: 4, wip: since }] },
    { title: 'Done', notes: [] },
];

(async () => {
    const app = await openApp([fakeClock('2028-02-23 10:00'), seedBoard({ id: 81, title: 'Tags', lists: LISTS })], { demo: false });
    const { page } = app;
    await page.setViewport({ width: 1280, height: 1000 });
    await sleep(300);

    // Marks the Card with this text so a selector can find it after a save.
    const card = async (text) => {
        await page.evaluate((text) => $('.wrap .board .card').filter((_, c) => getText($(c).find('.text')) == text).attr('data-t', text), text);
        return `.wrap .board .card[data-t="${text}"]`;
    };
    const tagShown = (sel) => page.evaluate((sel) => $(sel).find('.wip-timer').is(':visible'), sel);

    try {
        for (const text of ['water plants', 'renew passport', 'call bank', 'write report']) {
            const sel = await card(text);
            assert.strictEqual(await tagShown(sel), true, `"${text}" shows its tag on the board`);
            await editCard(page, sel);
            assert.strictEqual(await page.evaluate((sel) => $(sel).hasClass('editing'), sel), true, `"${text}" is in the Card editor`);
            assert.strictEqual(await tagShown(sel), false, `no tag shows while "${text}" is being edited`);
            await clickAway(page);
        }
        assert.deepStrictEqual(app.errors, [], 'no page errors');
    } finally {
        await app.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
