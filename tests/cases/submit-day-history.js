// The day submits itself: every save stamps the board with today, and once
// that day has ended (the tab open at midnight, or the next time it opens)
// the whole board is snapshotted into History under that day. No button, no
// prompt, no jump to History. History pages by week, and delete removes a day.
const assert = require('assert');
const { openApp } = require('../lib');

const DAY = 86400000;

(async () => {
    // One older entry, 7 days back: the same weekday last week, so always
    // exactly one week earlier (8 days back is two weeks earlier on a Monday).
    // Submitted during that day, the way the old Submit Day button did.
    const app = await openApp(() => {
        if (localStorage.getItem('nullboard.history')) return; // seed only on the first load
        const d = new Date(); d.setDate(d.getDate() - 7);
        const day = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        localStorage.setItem('nullboard.history', JSON.stringify([{
            day, title: 'Old board', submittedAt: d.toISOString(),
            lists: [{ title: 'Done', notes: [{ text: 'old card', raw: false, min: false }] }],
        }]));
    });
    const { page } = app;
    const dialogs = [];
    page.on('dialog', (d) => dialogs.push(d.message()));
    const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('nullboard.history')));
    const wake = () => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));

    try {
        assert.strictEqual(await page.$('.submit-day'), null, 'no Submit Day button');
        const bar = await page.$eval('.level-badge', (e) => { const r = e.getBoundingClientRect(); return { mid: r.left + r.width / 2, w: innerWidth }; });
        assert.ok(Math.abs(bar.mid - bar.w / 2) < 2, 'the level badge is centered: ' + JSON.stringify(bar));

        // An unstamped board (a first visit, or one from before auto-submit) waits for its first edit.
        await app.reload();
        assert.strictEqual((await stored()).length, 1, 'nothing filed for a board that was never stamped');

        // An edit stamps today; the same day, nothing is filed.
        await page.evaluate(() => { setText($('.wrap .board .card .text').first(), 'edited today'); saveBoard(); });
        const today = await page.evaluate(() => dayKey(new Date()));
        assert.strictEqual(await page.evaluate(() => NB.board.day), today, 'a save stamps the day');
        await wake();
        assert.strictEqual((await stored()).length, 1, 'not filed before the day ends');
        const board = await page.evaluate(() => JSON.parse(JSON.stringify({ title: NB.board.title, lists: NB.board.lists })));

        // Midnight with the tab open: the clock moves to tomorrow, the tab wakes, today is filed.
        await page.evaluate((DAY) => {
            const Real = window.RealDate = Date;
            window.Date = class extends Real {
                constructor(...a) { super(...(a.length ? a : [Real.now() + DAY])); }
                static now() { return Real.now() + DAY; }
            };
        }, DAY);
        await wake();
        await page.evaluate(() => { window.Date = window.RealDate; });

        let hist = await stored();
        const entry = hist.find((e) => e.day == today);
        assert.ok(entry, 'today was filed at midnight');
        assert.strictEqual(entry.title, board.title);
        assert.deepStrictEqual(entry.lists, board.lists, 'snapshot matches the whole board');
        assert.ok(await page.$eval('body', (b) => !b.classList.contains('view-history')), 'stays on the board');
        assert.deepStrictEqual(dialogs, [], 'no prompts');

        // Filed after the day ended: never filed again, through reloads.
        await page.evaluate(() => rollDay());
        await app.reload();
        assert.strictEqual((await stored()).length, 2, 'one old entry + one for today');

        // History shows it this week, the seeded day the week before.
        await page.evaluate(() => $('.config .view-history').click());
        assert.ok(await page.evaluate(() => $('.config').is(':visible')), 'the menu stays reachable in History');
        const shown = () => page.evaluate(() => $('.history .history-item').map((_, el) => ({
            board: $(el).find('.history-board').text(),
            lists: $(el).find('.history-list').map((_, l) => ({
                title: $(l).find('.history-list-title').text(),
                cards: $(l).find('.history-card').map((_, n) => $(n).text()).get(),
            })).get(),
        })).get());

        let items = await shown();
        assert.strictEqual(items.length, 1, 'current week shows just today');
        assert.strictEqual(items[0].board, board.title);
        assert.deepStrictEqual(items[0].lists, board.lists.map((l) => ({ title: l.title, cards: l.notes.map((n) => n.text) })),
            'History shows the whole board');
        assert.match(await page.$eval('.week-title', (e) => e.textContent), /\(Current\)$/);
        assert.ok(await page.$eval('.week-next', (b) => b.disabled), 'no weeks after the current one');
        await page.click('.week-prev');
        assert.deepStrictEqual((await shown()).map((i) => i.board), ['Old board']);
        await page.click('.week-next');

        // A day submitted by hand during that day (before auto-submit) gets replaced once it's over.
        const oldDay = hist.find((e) => e.title == 'Old board').day;
        await page.evaluate((day) => { NB.board.day = day; NB.storage.saveBoard(NB.board); }, oldDay);
        await app.reload();
        hist = await stored();
        assert.strictEqual(hist.length, 2, 'replaced, not added');
        assert.deepStrictEqual(hist.find((e) => e.day == oldDay).lists, board.lists, 'the old day now holds the board');

        // Delete today's entry.
        await page.evaluate(() => $('.config .view-history').click());
        await page.evaluate(() => $('.history .history-item .del-day').first().click());
        assert.strictEqual((await shown()).length, 0, 'deleted from view');
        assert.deepStrictEqual((await stored()).map((e) => e.day), [oldDay], 'only the old day remains');

        assert.deepStrictEqual(app.errors, [], 'no page errors');
    } finally {
        await app.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
