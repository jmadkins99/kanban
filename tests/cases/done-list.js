// A list named "done" (any case) strikes through its notes, including ones
// moved in. Submit Day asks first, snapshots the board with the Done notes
// in it, then clears the Done list.
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

        // Cancelling the prompt changes nothing.
        await page.evaluate(() => { const c = window.confirm; window.confirm = () => { window.confirm = c; return false; }; $('.submit-day').click(); });
        await settle(page);
        assert.deepStrictEqual(await lists(), before, 'cancel keeps the Done list');
        assert.strictEqual(await page.evaluate(() => loadHistory().length), 0, 'cancel saves nothing');

        // Submit: the prompt says what happens, the snapshot keeps the Done notes, the board loses them.
        await page.click('.submit-day');
        await settle(page);
        assert.strictEqual(dialogs.pop().trim(), `Save a snapshot of the board exactly as it is now, then clear the ${doneCount} notes in the Done list?`);
        const snap = await page.evaluate(() => loadHistory()[0].lists);
        assert.deepStrictEqual(snap, before, 'the snapshot is the board exactly as it was');
        const after = await lists();
        assert.strictEqual(after[1].notes.length, 0, 'Done list cleared');
        assert.strictEqual(after[1].title, ' done ', 'the list itself stays');
        assert.deepStrictEqual(after.filter((_, i) => i != 1), before.filter((_, i) => i != 1), 'other lists untouched');
        const histStruck = await page.evaluate(() => $('.history-list.done-list .history-note').toArray()
            .map((el) => getComputedStyle(el).textDecorationLine.includes('line-through')));
        assert.ok(histStruck.length == doneCount && histStruck.every(Boolean), 'History shows Done struck too');

        await app.reload();
        assert.strictEqual(await page.evaluate(() => NB.board.lists[1].notes.length), 0, 'cleared state persists');

        // Nothing left in Done: resubmitting only asks about replacing.
        await page.click('.submit-day');
        await settle(page);
        assert.strictEqual(dialogs.pop().trim(), 'Today is already submitted. Replace it with a snapshot of the board exactly as it is now?');

        assert.deepStrictEqual(app.errors, [], 'no page errors');
    } finally {
        await app.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
