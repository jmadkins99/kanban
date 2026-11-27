// A Recurring Card that isn't in Done by the end of its Due date is Late.
// What Late is (from when, in which Lists) and where it sorts is the Due date
// module's, in due-date-rules.js; here, its callers apply it: midnight passes
// with the tab open, and the minute tick turns the Card Late on its own. Its
// circular-arrow icon turns red, a red Critical timer counts from midnight,
// and it moves to the very top of its List. Late is never stored, and isn't a
// Priority: the Card stays Recurring.
// Cards are saved as `notes`, Nullboard's name, so old boards, History days and export files load without a migration.
const assert = require('assert');
const { openApp, settle, sleep, fakeClock, seedBoard } = require('../lib');

// "pay bills" is due Dec 1, so it turns Late at 00:00 Dec 2.
const LISTS = [
    { title: 'Backlog', notes: [] },
    { title: 'To-Do', notes: [
        { text: 'tidy desk', priority: 'low', arrival: 1 },
        { text: 'fix leak', priority: 'critical', arrival: 2, criticalSince: 2 },
        { text: 'water plants', priority: 'recurring', arrival: 3, schedule: { every: 1, start: '2028-11-05', unit: 'weeks' }, due: '2028-12-03' },
        { text: 'pay bills', priority: 'recurring', arrival: 4, schedule: { every: 1, start: '2028-11-01', unit: 'months' }, due: '2028-12-01' },
    ] },
    { title: 'WIP', notes: [] },
    { title: 'Done', notes: [] },
];

(async () => {
    // The first load sees 2s before midnight at the end of Dec 1, 2028.
    const app = await openApp([
        fakeClock('2028-12-01 23:59:58'),
        seedBoard({ id: 39, title: 'Chores', day: '2028-12-01', lists: LISTS }),
    ], { demo: false });
    const { page } = app;
    await page.setViewport({ width: 1280, height: 1000 });
    await page.waitForFunction(() => window.NB && NB.board && NB.board.title == 'Chores' && new Date().getFullYear() == 2028);
    await sleep(300);

    const TODO = 1;
    const texts = (list) => page.evaluate((list) => $('.wrap .board .list').eq(list).find('.card').toArray().map((c) => getText($(c).find('.text'))), list);
    // What a Card shows: its icon's label and colour, and its timer's text and colour (or null).
    const card = (list, text) => page.evaluate((list, text) => {
        const c = $('.wrap .board .list').eq(list).find('.card').toArray().find((c) => getText($(c).find('.text')) == text);
        if (!c) return null;
        const t = $(c).find('.wip-timer');
        return {
            icon: $(c).find('.card-prio').attr('aria-label'),
            iconColor: getComputedStyle($(c).find('.card-prio svg')[0]).color,
            timer: t.is(':visible') ? { text: t.text(), bg: getComputedStyle(t[0]).backgroundColor, border: getComputedStyle(t[0]).borderColor } : null,
        };
    }, list, text);
    const saved = (text) => page.evaluate((text) => {
        for (const l of NB.board.lists) for (const n of l.notes) if (n.text == text) return n;
        return null;
    }, text);
    const rgb = (c) => c.match(/\d+/g).slice(0, 3).map(Number);
    const red = (c) => { const [r, g, b] = rgb(c); return r > 150 && g < 100 && b < 100; };
    const secs = (t) => { const m = /^(?:(\d+)h )?(\d+)m (\d+)s$/.exec(t); assert.ok(m, 'timer format: ' + t); return (+m[1] || 0) * 3600 + +m[2] * 60 + +m[3]; };

    try {
        // Dec 1, 23:59:58: still due today, so not Late yet.
        assert.deepStrictEqual(await texts(TODO), ['water plants', 'pay bills', 'fix leak', 'tidy desk'], 'Recurring first, by Arrival');
        let c = await card(TODO, 'pay bills');
        assert.ok(!red(c.iconColor), 'on its Due date the icon is the usual Recurring colour: ' + c.iconColor);
        assert.strictEqual(c.timer, null, 'and it shows no timer');

        // Midnight passes with the tab open: it turns Late on its own.
        await page.waitForFunction(() => new Date().getDate() == 2, { timeout: 10000 });
        await sleep(600);
        await settle(page);
        assert.deepStrictEqual(await texts(TODO), ['pay bills', 'water plants', 'fix leak', 'tidy desk'], 'a Late Card goes to the very top, above Recurring');
        c = await card(TODO, 'pay bills');
        assert.strictEqual(c.icon, 'Priority: Recurring', 'Late is not a Priority: it is still Recurring');
        assert.ok(red(c.iconColor), 'the circular arrow turns red: ' + c.iconColor);
        assert.ok(c.timer, 'it shows a timer');
        assert.ok(red(c.timer.bg), 'a red Critical timer: ' + c.timer.bg);
        assert.ok(secs(c.timer.text) <= 2, 'counting from midnight: ' + c.timer.text);
        assert.strictEqual((await saved('pay bills')).priority, 'recurring', 'the saved Card is still Recurring');
        assert.ok(!('late' in await saved('pay bills')), 'Late is not stored');
        assert.deepStrictEqual(app.errors, []);

        console.log('PASS  late-card');
    } finally {
        await app.close();
    }
})().catch((e) => { console.error('FAIL  late-card\n', e); process.exit(1); });
