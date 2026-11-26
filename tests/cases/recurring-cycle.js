// Recurring Cards come back on their own. What happens to them (the next Due
// date, To-Do or Backlog, whether one moves on) is the Due date module's, in
// due-date-rules.js; here, its callers apply it. When the midnight Auto-submit
// clears Done, a finished Recurring Card is filed in that day's History like
// any other, then goes back with a fresh Arrival and its next Due date, and
// the rest go. The minute tick moves on a Card whose day has come, at midnight
// or when the tab next opens; a move by hand is a fresh Arrival, so one put
// back in Backlog stays. Lists are found by name, any case: "backlog";
// "to-do", "todo" or "to do". With no Backlog the Card returns to the first
// List.
// Cards are saved as `notes`, Nullboard's name, so old boards, History days and export files load without a migration.
const assert = require('assert');
const { openApp, settle, moveCard, sleep, fakeClock, setClock: setPageClock, wake: wakePage } = require('../lib');

(async () => {
    // The page's clock: Wednesday 2028-11-15 10:00 local to begin with.
    const app = await openApp(fakeClock('2028-11-15 10:00'), { demo: false });
    const { page } = app;
    await page.setViewport({ width: 1280, height: 1000 });
    await sleep(300);

    const setClock = (at) => setPageClock(page, at);
    const wake = () => wakePage(page);
    const rename = (i, title) => page.evaluate((i, title) => { setText($('.wrap .board .list').eq(i).find('.head .text'), title); saveBoard(); }, i, title);
    // Each List's Cards as shown, top to bottom.
    const board = () => page.evaluate(() => $('.wrap .board .list').map((_, l) => [$(l).find('.card').map((_, c) => getText($(c).find('.text'))).get()]).get());
    const saved = (text) => page.evaluate((text) => {
        for (const l of NB.board.lists) for (const n of l.notes) if (n.text == text) return n;
        return null;
    }, text);
    const slot = (text) => page.evaluate((text) => {
        const c = $('.wrap .board .card').toArray().find((c) => getText($(c).find('.text')) == text);
        const t = $(c).find('.wip-timer');
        return t.is(':visible') ? t.text() : null;
    }, text);
    const doneIn = (day) => page.evaluate((day) => {
        const e = NB.storage.getJson('history').find((e) => e.day == day);
        return e && e.lists.find((l) => l.title == 'Done').notes.map((n) => n.text);
    }, day);
    const monthly1st = { every: 1, start: '2028-01-01', unit: 'months' };
    const daily = { every: 1, start: '2028-11-01', unit: 'days' };

    try {
        // The first visit's Lists: Backlog, To-Do, WIP, Done. Fill them, then reload.
        await page.evaluate((monthly1st, daily) => {
            const r = (text, schedule, due) => ({ text, priority: 'recurring', schedule, due });
            const [backlog, todo, wip, done] = NB.board.lists;
            backlog.notes = [
                r('file taxes',    { every: 12, start: '2028-04-15', unit: 'months' }, '2029-04-15'),
                r('weekly review', { every: 1,  start: '2028-11-09', unit: 'weeks' },  '2028-11-16'),
            ];
            todo.notes = [];
            wip.notes  = [];
            done.notes = [
                r('pay rent',         monthly1st, '2028-11-01'),
                r('renew insurance',  monthly1st, '2028-12-01'),
                r('water plants',     daily,      '2028-11-15'),
                { text: 'ordinary', priority: 'low' },
            ];
            NB.board.day = '2028-11-15';
            NB.storage.saveBoard(NB.board);
        }, monthly1st, daily);
        await app.reload();
        await sleep(300);
        assert.deepStrictEqual(await board(), [['weekly review', 'file taxes'], [], [], ['pay rent', 'renew insurance', 'water plants', 'ordinary']]);

        // Midnight with the tab open.
        await setClock('2028-11-16 00:00');
        await wake();

        assert.deepStrictEqual(await doneIn('2028-11-15'), ['pay rent', 'renew insurance', 'water plants', 'ordinary'], 'all of Done is in that day\'s History');
        let b = await board();
        assert.deepStrictEqual(b[3], [], 'Done is cleared');
        assert.deepStrictEqual(b[0], ['pay rent', 'renew insurance', 'file taxes'], 'waiting Cards return to Backlog, in Due date order');
        assert.deepStrictEqual([...b[1]].sort(), ['water plants', 'weekly review'], 'a finished Card due today, and one waiting for today, are in To-Do');

        assert.strictEqual((await saved('pay rent')).due, '2028-12-01', 'it comes back with its next Due date');
        assert.match(await slot('pay rent'), /^Next: (Dec 1|1 Dec)$/, 'and shows it');
        assert.strictEqual(await saved('ordinary'), null, 'an ordinary Card is cleared');
        const midnight = await page.evaluate(() => new Date(2028, 10, 16).getTime());
        for (const t of ['pay rent', 'water plants', 'weekly review'])
            assert.ok((await saved(t)).arrival >= midnight, t + ' has a fresh Arrival');
        assert.deepStrictEqual((await saved('pay rent')).schedule, monthly1st, 'the Schedule is kept');
        assert.deepStrictEqual(Object.keys((await saved('pay rent')).schedule), ['every', 'start', 'unit'], 'in key order');

        // A reload changes nothing.
        await app.reload();
        await sleep(300);
        assert.deepStrictEqual(await board(), b, 'the same after a reload');

        // Put back in Backlog by hand on its Due date, it stays there.
        await moveCard(page, 1, (await board())[1].indexOf('weekly review'), -1);
        await settle(page);
        await wake();
        assert.ok((await board())[0].includes('weekly review'), 'moved back to Backlog by hand, it isn\'t moved again: ' + JSON.stringify(await board()));
        await app.reload();
        await sleep(300);
        await settle(page);
        assert.ok((await board())[0].includes('weekly review'), 'nor after a reload');
        await moveCard(page, 0, (await board())[0].indexOf('weekly review'), 1);
        await settle(page);
        b = await board();

        // Closed over its Due date: on opening, it moves on. " TODO " is To-Do too.
        await rename(1, ' TODO ');
        await setClock('2028-12-01 09:00');
        await app.reload();
        await sleep(300);
        await settle(page);
        b = await board();
        assert.ok(b[1].includes('pay rent'), 'due while the tab was closed, it\'s in To-Do on opening: ' + JSON.stringify(b));

        // No Backlog: a finished Card returns to the first List; "to do" is To-Do.
        await rename(0, 'Ideas');
        await rename(1, 'to do');
        await moveCard(page, 1, (await board())[1].indexOf('water plants'), 2);
        await moveCard(page, 0, (await board())[0].indexOf('renew insurance'), 3);
        await settle(page);
        assert.deepStrictEqual((await board())[3], ['water plants', 'renew insurance']);
        await setClock('2028-12-02 00:00');
        await wake();
        b = await board();
        assert.ok(b[0].includes('renew insurance'), 'no Backlog: the first List: ' + JSON.stringify(b));
        assert.ok(b[1].includes('water plants'), '"to do" is To-Do');

        assert.deepStrictEqual(app.errors, [], 'no page errors');
    } finally {
        await app.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
