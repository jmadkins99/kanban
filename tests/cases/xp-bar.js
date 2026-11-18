// XP: 2500 per note moved into Done. Level 1 takes 11500 XP (4.6 notes),
// and each level after costs 2% more than the one before.
// Leaving Done (moved out, deleted) takes the XP back; submitting the day banks it
// before clearing Done, and an Undo of that can't count it twice. The
// WoW-style bar shows "Lvl N, XP a/b, p%" in 20 bubbles, adjustable in UI
// preferences.
const assert = require('assert');
const { openApp } = require('../lib');

(async () => {
    const app = await openApp(() => {});
    const { page } = app;

    const text = () => page.evaluate(() => $('.xp-bar__text').text());
    // Move the first note of list `from` to Done (list 2) the way a drag does.
    const toDone = (from) => page.evaluate((from) => {
        const $n = $('.wrap .board .list').eq(from).find('.note').first();
        $n.appendTo($('.wrap .board .list').eq(2).find('.notes'));
        noteMoved($n, false);
        saveBoard();
    }, from);

    try {
        assert.strictEqual(await text(), 'Lvl 1, XP 0/11,500, 0%');
        // The curve: 69 -> 70 costs 11500 x 1.02^68, and the sum of levels 1-69 reaches 70 exactly.
        assert.deepStrictEqual(await page.evaluate(() => {
            let sum = 0;
            for (let l = 1; l < 70; l++) sum += XP.levelCost(l);
            const at = XP.progress(sum), before = XP.progress(sum - 1);
            return [XP.levelCost(69), at.level, at.into, before.level, before.need - before.into];
        }), [44209, 70, 0, 69, 1]);
        assert.strictEqual(await page.evaluate(() => getComputedStyle($('.xp-bar')[0]).getPropertyValue('--xp-bubbles').trim()), '20');

        await page.evaluate(() => { setText($('.wrap .board .list').eq(2).find('.head .text'), 'Done'); saveBoard(); });
        assert.strictEqual(await text(), 'Lvl 1, XP 0/11,500, 0%', 'renaming a list to Done earns nothing');

        await toDone(0);
        assert.strictEqual(await text(), 'Lvl 1, XP 2,500/11,500, 21%');
        for (let i = 0; i < 4; i++) await toDone(0);
        assert.strictEqual(await text(), 'Lvl 2, XP 1,000/11,730, 8%', 'the 5th card levels up');

        // Out of Done: taken back.
        await page.evaluate(() => { $('.wrap .board .list').eq(2).find('.note').last().appendTo($('.wrap .board .list').eq(1).find('.notes')); saveBoard(); });
        assert.strictEqual(await text(), 'Lvl 1, XP 10,000/11,500, 86%', 'moving out of Done takes the XP back');

        // Deleted from Done: taken back.
        await page.evaluate(() => { $('.wrap .board .list').eq(2).find('.note').last().remove(); saveBoard(); });
        assert.strictEqual(await text(), 'Lvl 1, XP 7,500/11,500, 65%', 'deleting takes the XP back');

        // Submitting the day banks it; the Done list empties but the XP stays, through a reload.
        await page.evaluate(() => { NB.board.day = '2000-01-01'; rollDay(); });
        await page.waitForFunction(() => NB.board.lists[2].notes.filter((n) => n.xp).length == 0, { timeout: 5000 });
        assert.strictEqual(await text(), 'Lvl 1, XP 7,500/11,500, 65%', 'Submit Day keeps the XP');
        await app.reload();
        assert.strictEqual(await text(), 'Lvl 1, XP 7,500/11,500, 65%', 'banked XP survives a reload');

        // Undo brings the banked notes back into Done: still counted once.
        await page.evaluate(() => $('.wrap .board .undo-board').click());
        await page.waitForFunction(() => NB.board.lists[2].notes.some((n) => n.xp));
        assert.strictEqual(await text(), 'Lvl 1, XP 7,500/11,500, 65%', 'undo after Submit Day does not double count');

        // XP bars preference.
        await page.evaluate(() => $('.config .ui-xp .more').click());
        assert.strictEqual(await page.evaluate(() => $('.config .ui-xp .val').text()), '21');
        await app.reload();
        assert.strictEqual(await page.evaluate(() => $('.xp-bar').css('--xp-bubbles').trim()), '21', 'bubble count persists');
        await page.evaluate(() => { $('.config .ui-xp .less').click(); $('.config .ui-xp .less').click(); });
        assert.strictEqual(await page.evaluate(() => $('.config .ui-xp .val').text()), '19');

        assert.deepStrictEqual(app.errors, [], 'no page errors');
    } finally {
        await app.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
