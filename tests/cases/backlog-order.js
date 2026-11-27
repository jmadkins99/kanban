// Backlog reads as what's coming next (docs/adr/0003). The order itself is
// the Due date module's, in due-date-rules.js; here, the page applies it: a
// saved Backlog shows in Backlog's order, and a Card moved out of Backlog
// takes 0002's order in its new List.
// Cards are saved as `notes`, Nullboard's name, so old boards, History days and export files load without a migration.
const assert = require('assert');
const { openApp, settle, sleep, fakeClock, seedBoard, moveCard } = require('../lib');

const weekly = { every: 1, start: '2028-11-05', unit: 'weeks' };   // Sundays
// Saved in 0002's order, the reverse of Backlog's.
const LISTS = [
    { title: 'Backlog', notes: [
        { text: 'recurring Dec 3', priority: 'recurring', arrival: 1, schedule: weekly, due: '2028-12-03' },
        { text: 'critical', priority: 'critical', arrival: 2 },
        { text: 'critical Dec 20', priority: 'critical', arrival: 3, due: '2028-12-20' },
    ] },
    { title: 'To-Do', notes: [
        { text: 'todo critical', priority: 'critical', arrival: 4 },
    ] },
    { title: 'WIP', notes: [] },
    { title: 'Done', notes: [] },
];

(async () => {
    const app = await openApp([
        fakeClock('2028-12-01 10:00'),
        seedBoard({ id: 50, title: 'Coming next', day: '2028-12-01', lists: LISTS }),
    ], { demo: false });
    const { page } = app;
    await page.setViewport({ width: 1280, height: 1000 });
    await page.waitForFunction(() => window.NB && NB.board && NB.board.title == 'Coming next');
    await sleep(300);

    const texts = (list) => page.evaluate((list) => $('.wrap .board .list').eq(list).find('.card').toArray().map((c) => getText($(c).find('.text'))), list);

    try {
        assert.deepStrictEqual(await texts(0), ['recurring Dec 3', 'critical Dec 20', 'critical'], 'Backlog shows in its order');

        // Moved by hand into To-Do, "recurring Dec 3" goes above the Critical
        // Card there, as Recurring does in 0002's order.
        await moveCard(page, 0, 0, 1);
        await settle(page);
        assert.deepStrictEqual(await texts(1), ['recurring Dec 3', 'todo critical'], 'in To-Do it takes 0002\'s order');

        assert.deepStrictEqual(app.errors, [], 'no page errors');
    } finally {
        await app.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
