// Real mouse drags keep a card's state, and save it once. Nullboard's drag rebuilds the card
// element as it moves, which used to drop the WIP start and XP stored on it:
// a card dragged from WIP to Done earned the base 2500 whatever its WIP
// time, reordering inside Done took XP back, and inside WIP reset timers.
// And a drop mid-animation saved the outgoing copy too, as a duplicate.
const assert = require('assert');
const { openApp } = require('../lib');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
    const app = await openApp(() => {});
    const { page } = app;
    await page.setViewport({ width: 1280, height: 1000 });
    await sleep(300);

    // A real mouse drag of note [list, index] to the top of list `to`, or
    // below its last note with `bottom`.
    async function drag(list, index, to, bottom) {
        const [from, dest] = await page.evaluate((list, index, to, bottom) => {
            const n = $('.wrap .board .list').eq(list).find('.note .text').eq(index)[0].getBoundingClientRect();
            const $to = $('.wrap .board .list').eq(to).find('.note');
            const r = (bottom ? $to.last() : $to.first())[0].getBoundingClientRect();
            return [[n.left + n.width / 2, n.top + Math.min(n.height / 2, 8)], [r.left + r.width / 2, bottom ? r.bottom + 6 : r.top + 4]];
        }, list, index, to, bottom);
        await page.mouse.move(from[0], from[1]);
        await sleep(300);
        await page.mouse.down();
        await sleep(600); // Nullboard starts a drag after a 500 ms hold
        for (let i = 1; i <= 15; i++) {
            await page.mouse.move(from[0] + (dest[0] - from[0]) * i / 15, from[1] + (dest[1] - from[1]) * i / 15);
            await sleep(20);
        }
        await page.mouse.up();
        await sleep(300);
    }

    try {
        // Lists: 0 To-Do, 1 WIP, 2 Done. Two WIP cards, started 10 and 20 minutes ago.
        const starts = await page.evaluate(() => {
            setText($('.wrap .board .list').eq(1).find('.head .text'), 'WIP');
            setText($('.wrap .board .list').eq(2).find('.head .text'), 'Done');
            saveBoard();
            const $w = $('.wrap .board .list').eq(1).find('.note');
            noteMeta($w.eq(0)).wip = Date.now() - 10 * 60000;
            noteMeta($w.eq(1)).wip = Date.now() - 20 * 60000;
            saveBoard();
            return NB.board.lists[1].notes.slice(0, 2).map((n) => n.wip);
        });

        // Reorder inside WIP (the 10-minute card to the bottom): the timers keep their starts.
        await drag(1, 0, 1, true);
        const wips = await page.evaluate(() => NB.board.lists[1].notes.map((n) => n.wip));
        const moved = wips.indexOf(starts[0]);
        assert.ok(moved > 0, 'the dragged card moved down and kept its timer: ' + wips);
        assert.strictEqual(wips[0], starts[1], 'the other card kept its timer');

        // WIP -> Done by drag (the 10-minute card): 2500 + 10 minutes x 57.5.
        await drag(1, moved, 2);
        assert.strictEqual(await page.evaluate(() => $('.celebrate-badge').text()), '+3075 XP', 'the badge shows the WIP bonus');
        assert.strictEqual(await page.evaluate(() => XP.total()), 3075);
        assert.strictEqual(await page.evaluate(() => NB.board.lists[2].notes.length), await page.evaluate(() => $('.wrap .board .list').eq(2).find('.note').length), 'saved once, no duplicate');

        // Reorder inside Done (the new card further down): the XP stays.
        await drag(2, 0, 2, true);
        assert.ok(await page.evaluate(() => NB.board.lists[2].notes.findIndex((n) => n.xp == 3075) > 0), 'the card really moved, XP and all');
        assert.strictEqual(await page.evaluate(() => XP.total()), 3075, 'reordering in Done keeps the XP');
        assert.strictEqual(await page.evaluate(() => NB.board.lists[2].notes.filter((n) => n.xp).length), 1);

        assert.deepStrictEqual(app.errors, [], 'no page errors');
    } finally {
        await app.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
