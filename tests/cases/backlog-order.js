// Backlog reads as what's coming next (docs/adr/0003). The order itself is
// the Due date module's, in due-date-rules.js; here, the page applies it: a
// saved Backlog shows in that order and keeps it after a reload, and a Card
// moved out of Backlog takes 0002's order in its new List.
// Cards are saved as `notes`, Nullboard's name, so old boards, History days and export files load without a migration.
const assert = require('assert');
const { openApp, settle, sleep, fakeClock, seedBoard, moveCard } = require('../lib');

const weekly = { every: 1, start: '2028-11-05', unit: 'weeks' };   // Sundays
// late was put back in Backlog by hand on its day, so the minute tick leaves it there.
const LISTS = [
    { title: 'Backlog', notes: [
        { text: 'low', priority: 'low', arrival: 1 },
        { text: 'recurring Dec 10', priority: 'recurring', arrival: 2, schedule: weekly, due: '2028-12-10' },
        { text: 'critical', priority: 'critical', arrival: 3 },
        { text: 'recurring Dec 3', priority: 'recurring', arrival: 4, schedule: weekly, due: '2028-12-03' },
        { text: 'critical Dec 20', priority: 'critical', arrival: 5, due: '2028-12-20' },
        { text: 'late', priority: 'recurring', arrival: new Date('2028-11-26T09:00').getTime(), schedule: weekly, due: '2028-11-26' },
    ] },
    { title: 'To-Do', notes: [
        { text: 'todo critical', priority: 'critical', arrival: 7 },
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
    const BACKLOG = ['late', 'critical Dec 20', 'recurring Dec 3', 'recurring Dec 10', 'critical', 'low'];

    try {
        assert.deepStrictEqual(await texts(0), BACKLOG, 'Backlog shows in its order');
        await app.reload();
        await settle(page);
        assert.deepStrictEqual(await texts(0), BACKLOG, 'and keeps it after a reload');

        // Moved by hand into To-Do, "recurring Dec 3" goes above the Critical
        // Card there, as Recurring does in 0002's order.
        await moveCard(page, 0, 2, 1);
        await settle(page);
        assert.deepStrictEqual(await texts(1), ['recurring Dec 3', 'todo critical'], 'in To-Do it takes 0002\'s order');

        assert.deepStrictEqual(app.errors, [], 'no page errors');
    } finally {
        await app.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
