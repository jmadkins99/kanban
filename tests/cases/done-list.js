// A list named "done" (any case) strikes through its notes, including ones
// moved in. Once the board's day is over, auto-submit snapshots the board
// with the Done notes in it, then clears the Done list, without asking.
const assert = require('assert');
const { openApp, settle } = require('../lib');

(async () => {
    const app = await openApp(() => {});
    const { page } = app;
    const dialogs = [];
    page.on('dialog', (d) => dialogs.push(d.message()));

    // [list index] -> whether each of its notes is drawn struck through
    const struck = (i) => page.evaluate((i) => $('.wrap .board .list').eq(i).find('.note .text').toArray()
        .map((el) => getComputedStyle(el).textDecorationLine.includes('line-through')), i);
    const rename = (i, title) => page.evaluate((i, title) => { setText($('.wrap .board .list').eq(i).find('.head .text'), title); saveBoard(); }, i, title);

    try {
        await rename(1, 'DoNE');
        assert.ok((await struck(1)).every(Boolean) && (await struck(1)).length > 0, '"DoNE" strikes its notes');
        assert.ok(!(await struck(0)).some(Boolean), 'other lists are untouched');

        // A note moved in is struck while it's there.
        await page.evaluate(() => {
            $('.wrap .board .list').eq(0).find('.note').first().appendTo($('.wrap .board .list').eq(1).find('.notes'));
            saveBoard();
        });
        assert.ok((await struck(1)).every(Boolean), 'a moved-in note is struck');

        await rename(1, 'Doing');
        assert.ok(!(await struck(1)).some(Boolean), 'renaming away from "done" un-strikes');
        await rename(1, ' done ');
        assert.ok((await struck(1)).every(Boolean), 'any case, surrounding spaces ignored');

        const lists = () => page.evaluate(() => JSON.parse(JSON.stringify(NB.board.lists)));
        const before = await lists();
        const doneCount = before[1].notes.length;
        assert.ok(doneCount > 1);

        // Cards in Done, the tab closed, opened again days later: the last day
        // the board changed is filed, Done is empty, nothing asked.
        const lastDay = await page.evaluate(() => { const d = new Date(); d.setDate(d.getDate() - 3); return dayKey(d); });
        await page.evaluate((day) => { NB.board.day = day; NB.storage.saveBoard(NB.board); }, lastDay);
        await app.reload();
        await settle(page);
        const hist = await page.evaluate(() => loadHistory());
        assert.deepStrictEqual(hist.map((e) => e.day), [lastDay], 'filed under the day it was left');
        assert.deepStrictEqual(hist[0].lists, before, 'the snapshot is the board exactly as it was');
        const after = await lists();
        assert.strictEqual(after[1].notes.length, 0, 'Done list cleared');
        assert.strictEqual(after[1].title, ' done ', 'the list itself stays');
        assert.deepStrictEqual(after.filter((_, i) => i != 1), before.filter((_, i) => i != 1), 'other lists untouched');
        assert.ok(await page.$eval('body', (b) => !b.classList.contains('view-history')), 'stays on the board');
        assert.deepStrictEqual(dialogs, [], 'no prompts');

        // History shows Done struck too (the day may be in last week).
        await page.evaluate(() => $('.config .view-history').click());
        if (! await page.$(`.history-item[data-day="${lastDay}"]`)) await page.click('.week-prev');
        const histStruck = await page.evaluate(() => $('.history-list.done-list .history-note').toArray()
            .map((el) => getComputedStyle(el).textDecorationLine.includes('line-through')));
        assert.ok(histStruck.length == doneCount && histStruck.every(Boolean), 'History shows Done struck too');

        await app.reload();
        assert.strictEqual(await page.evaluate(() => NB.board.lists[1].notes.length), 0, 'cleared state persists');
        assert.strictEqual(await page.evaluate(() => NB.board.day), await page.evaluate(() => dayKey(new Date())), 'clearing Done stamped today');

        // Back on that day again (Undo, another device): already filed, so left alone.
        await page.evaluate((day) => { NB.board.day = day; NB.storage.saveBoard(NB.board); }, lastDay);
        await app.reload();
        assert.deepStrictEqual(await page.evaluate(() => loadHistory()), hist, 'not filed twice');

        assert.deepStrictEqual(app.errors, [], 'no page errors');
    } finally {
        await app.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
