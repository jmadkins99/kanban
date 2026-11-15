// Submit Day snapshots the whole board into History; History pages by week,
// resubmitting the same day replaces it, and delete removes it.
const assert = require('assert');
const { openApp } = require('../lib');

(async () => {
    // One older entry, 8 days back, so it always lands in an earlier week.
    const app = await openApp(() => {
        if (localStorage.getItem('nullboard.history')) return; // seed only on the first load
        const d = new Date(); d.setDate(d.getDate() - 8);
        const day = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        localStorage.setItem('nullboard.history', JSON.stringify([{
            day, title: 'Old board', submittedAt: d.toISOString(),
            lists: [{ title: 'Done', notes: [{ text: 'old note', raw: false, min: false }] }],
        }]));
    });
    const { page } = app;
    try {
        const board = await page.evaluate(() => ({ title: NB.board.title, lists: NB.board.lists }));

        await page.click('.submit-day');
        assert.ok(await page.$eval('body', (b) => b.classList.contains('view-history')), 'Submit Day opens History');
        assert.ok(await page.evaluate(() => $('.config').is(':visible')), 'the menu stays reachable in History');

        const shown = () => page.evaluate(() => $('.history .history-item').map((_, el) => ({
            board: $(el).find('.history-board').text(),
            lists: $(el).find('.history-list').map((_, l) => ({
                title: $(l).find('.history-list-title').text(),
                notes: $(l).find('.history-note').map((_, n) => $(n).text()).get(),
            })).get(),
        })).get());

        let items = await shown();
        assert.strictEqual(items.length, 1, 'current week shows just today');
        assert.strictEqual(items[0].board, board.title);
        assert.deepStrictEqual(items[0].lists, board.lists.map((l) => ({ title: l.title, notes: l.notes.map((n) => n.text) })),
            'snapshot matches the whole board');
        assert.match(await page.$eval('.week-title', (e) => e.textContent), /\(Current\)$/);
        assert.ok(await page.$eval('.week-next', (b) => b.disabled), 'no weeks after the current one');

        // Earlier week holds the seeded entry.
        await page.click('.week-prev');
        items = await shown();
        assert.deepStrictEqual(items.map((i) => i.board), ['Old board']);
        await page.click('.week-next');

        // Resubmitting today replaces rather than duplicates, and survives a reload.
        await page.evaluate(() => $('.config .load-board.active').click()); // the board's name in the menu
        assert.ok(await page.$eval('body', (b) => !b.classList.contains('view-history')), 'back on the board');
        await page.click('.submit-day');
        await app.reload();
        const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('nullboard.history')));
        assert.strictEqual(stored.length, 2, 'one old entry + one for today');

        // Delete today's entry.
        await page.evaluate(() => $('.config .view-history').click());
        await page.evaluate(() => $('.history .history-item .del-day').first().click());
        assert.strictEqual((await shown()).length, 0, 'deleted from view');
        const left = await page.evaluate(() => JSON.parse(localStorage.getItem('nullboard.history')));
        assert.deepStrictEqual(left.map((e) => e.title), ['Old board'], 'only the old entry remains');

        assert.deepStrictEqual(app.errors, [], 'no page errors');
    } finally {
        await app.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
