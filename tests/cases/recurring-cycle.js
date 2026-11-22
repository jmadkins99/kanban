// Recurring Cards come back on their own. When the midnight Auto-submit
// clears Done, a finished Recurring Card is filed in that day's History like
// any other, then goes back with a fresh Arrival and its next Due date: the
// first Schedule date after its current Due date, the day it was finished and
// yesterday, so missed occurrences don't pile up and it's never due on a day
// already gone. Due today, it goes straight to To-Do; otherwise to Backlog. A
// Recurring Card waiting in Backlog from before its Due date moves to To-Do by
// itself once the day comes, at midnight or when the tab next opens. One moved
// out of Backlog early, or put back there by hand, is left alone. Lists are
// found by name, any case: "backlog"; "to-do", "todo" or "to do". With no
// Backlog the Card returns to the first List; with no To-Do it stays put.
// Cards are saved as `notes`, Nullboard's name, so old boards, History days and export files load without a migration.
const assert = require('assert');
const { openApp, settle, moveCard } = require('../lib');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
    // The page's clock: whatever the test last set (kept in localStorage, so
    // it survives a reload), Wednesday 2028-11-15 10:00 local to begin with.
    const app = await openApp(`{
        const Real = Date;
        let at = null;
        try { at = +localStorage.getItem('test.clock') || null; } catch (e) {}
        window.clockSkew = (at || new Real(2028, 10, 15, 10, 0, 0).getTime()) - Real.now();
        window.Date = class extends Real {
            constructor(...a) { super(...(a.length ? a : [Real.now() + window.clockSkew])); }
            static now() { return Real.now() + window.clockSkew; }
        };
        window.RealDate = Real;
    }`, { demo: false });
    const { page } = app;
    await page.setViewport({ width: 1280, height: 1000 });
    await sleep(300);

    // Moves the page's clock to y-m-d h:mi local, now and after a reload.
    const setClock = (y, m, d, h, mi) => page.evaluate((y, m, d, h, mi) => {
        const t = new RealDate(y, m - 1, d, h, mi, 0).getTime();
        localStorage.setItem('test.clock', String(t));
        window.clockSkew = t - RealDate.now();
    }, y, m, d, h, mi);
    const wake = async () => { await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await sleep(100); await settle(page); };
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
            wip.notes  = [r('take bins out', { every: 1, start: '2028-11-02', unit: 'weeks' }, '2028-11-16')]; // moved out of Backlog early
            done.notes = [
                r('pay rent',         monthly1st, '2028-11-01'), // finished late
                r('renew insurance',  monthly1st, '2028-12-01'), // finished early
                r('water plants',     daily,      '2028-11-15'), // on the day
                { text: 'ordinary', priority: 'low' },
            ];
            NB.board.day = '2028-11-15';
            NB.storage.saveBoard(NB.board);
        }, monthly1st, daily);
        await app.reload();
        await sleep(300);
        assert.deepStrictEqual(await board(), [['file taxes', 'weekly review'], [], ['take bins out'], ['pay rent', 'renew insurance', 'water plants', 'ordinary']]);

        // Midnight with the tab open.
        await setClock(2028, 11, 16, 0, 0);
        await wake();

        assert.deepStrictEqual(await doneIn('2028-11-15'), ['pay rent', 'renew insurance', 'water plants', 'ordinary'], 'all of Done is in that day\'s History');
        let b = await board();
        assert.deepStrictEqual(b[3], [], 'Done is cleared');
        assert.strictEqual(b[0][0], 'file taxes', 'returning Cards join the back of the tier');
        assert.deepStrictEqual([...b[0].slice(1)].sort(), ['pay rent', 'renew insurance'], 'waiting Cards return to Backlog');
        assert.deepStrictEqual([...b[1]].sort(), ['water plants', 'weekly review'], 'Cards due today move on to To-Do');
        assert.deepStrictEqual(b[2], ['take bins out'], 'one moved out of Backlog early stays put');

        assert.strictEqual((await saved('pay rent')).due, '2028-12-01', 'a late finish comes back on the next date: Dec 1');
        assert.match(await slot('pay rent'), /^Next: (Dec 1|1 Dec)$/);
        assert.strictEqual((await saved('renew insurance')).due, '2029-01-01', 'an early finish skips its current date: Jan 1');
        assert.match(await slot('renew insurance'), /^Next: .*2029$/);
        assert.strictEqual((await saved('water plants')).due, '2028-11-16', 'a daily Card is due the next day');
        assert.strictEqual((await saved('take bins out')).due, '2028-11-16', 'the early Card keeps its Due date');
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

        // Closed over the Due date: on opening, it moves. " TODO " is To-Do too.
        await rename(1, ' TODO ');
        await setClock(2028, 12, 1, 9, 0);
        await app.reload();
        await sleep(300);
        await settle(page);
        b = await board();
        assert.ok(b[1].includes('pay rent'), 'due while the tab was closed, it\'s in To-Do on opening: ' + JSON.stringify(b));
        assert.deepStrictEqual(b[0], ['file taxes', 'renew insurance'], 'the others wait');

        // No Backlog: a finished Card returns to the first List, and moves on to "to do".
        await rename(0, 'Ideas');
        await rename(1, 'to do');
        await moveCard(page, 1, (await board())[1].indexOf('water plants'), 2);
        await moveCard(page, 0, (await board())[0].indexOf('renew insurance'), 3);
        await settle(page);
        assert.deepStrictEqual((await board())[3], ['water plants', 'renew insurance']);
        await setClock(2028, 12, 2, 0, 0);
        await wake();
        b = await board();
        assert.ok(b[0].includes('renew insurance'), 'no Backlog: the first List: ' + JSON.stringify(b));
        assert.strictEqual((await saved('renew insurance')).due, '2029-02-01', 'finished early again: after its Jan 1');
        assert.ok(b[1].includes('water plants'), '"to do" is To-Do');
        assert.strictEqual((await saved('water plants')).due, '2028-12-02');

        // No To-Do: it stays in Backlog.
        await rename(0, 'BACKLOG');
        await rename(1, 'Later');
        await moveCard(page, 1, (await board())[1].indexOf('water plants'), 2);
        await settle(page);
        await setClock(2028, 12, 3, 0, 0);
        await wake();
        b = await board();
        assert.ok(b[0].includes('water plants'), 'no To-Do: it stays in Backlog: ' + JSON.stringify(b));
        assert.strictEqual((await saved('water plants')).due, '2028-12-03');

        // Finished on Monday Dec 4, the tab reopened on Wednesday Dec 13: the
        // next Due date is never one already gone by. Weekly on Mondays comes
        // back due Dec 18, not Dec 11; daily is due today and goes to To-Do.
        await rename(1, 'To-Do');
        await page.evaluate(() => {
            const r = (text, schedule) => ({ text, priority: 'recurring', schedule, due: '2028-12-04', arrival: 1 });
            NB.board.lists[3].notes = [
                r('mow lawn',  { every: 1, start: '2028-11-06', unit: 'weeks' }),
                r('feed fish', { every: 1, start: '2028-11-01', unit: 'days' }),
            ];
            NB.board.day = '2028-12-04';
            NB.storage.saveBoard(NB.board);
        });
        await setClock(2028, 12, 13, 9, 0);
        await app.reload();
        await sleep(300);
        await settle(page);
        b = await board();
        assert.strictEqual((await saved('mow lawn')).due, '2028-12-18', 'weekly: the next Monday from today, not a past one');
        assert.ok(b[0].includes('mow lawn'), 'it waits in Backlog: ' + JSON.stringify(b));
        assert.strictEqual((await saved('feed fish')).due, '2028-12-13', 'daily: due today');
        assert.ok(b[1].includes('feed fish'), 'due today, it goes straight to To-Do: ' + JSON.stringify(b));

        assert.deepStrictEqual(app.errors, [], 'no page errors');
    } finally {
        await app.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
