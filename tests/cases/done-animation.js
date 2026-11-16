// Dragging a note into a Done list plays the celebration: the card's gold
// aura, a "+2500 XP" badge and a full-screen flash, gone after ~2 s.
// Reordering inside Done, or dragging out of it, doesn't celebrate.
const assert = require('assert');
const { openApp } = require('../lib');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
    const app = await openApp(() => {});
    const { page } = app;
    await page.setViewport({ width: 1280, height: 1000 });
    await sleep(300); // let the board re-centre before reading positions

    // A real mouse drag of note [list, index] to the top of list `to`.
    async function drag(list, index, to) {
        const [from, dest] = await page.evaluate((list, index, to) => {
            const c = (el) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + Math.min(r.height / 2, 8)]; };
            const n = $('.wrap .board .list').eq(list).find('.note .text').eq(index)[0];
            const first = $('.wrap .board .list').eq(to).find('.note').first()[0];
            const r = first.getBoundingClientRect();
            return [c(n), [r.left + r.width / 2, r.top + 4]]; // drop at the top of the target list
        }, list, index, to);
        await page.mouse.move(from[0], from[1]);
        await page.mouse.down();
        await sleep(600); // Nullboard starts a drag after a 500 ms hold
        for (let i = 1; i <= 15; i++) {
            await page.mouse.move(from[0] + (dest[0] - from[0]) * i / 15, from[1] + (dest[1] - from[1]) * i / 15);
            await sleep(20);
        }
        await page.mouse.up();
        await sleep(100);
    }
    const fx = () => page.evaluate(() => ({
        badges: $('.celebrate-badge').map((_, b) => b.textContent).get(),
        inDone: $('.celebrate-badge').closest('.list').hasClass('done-list'),
        flash: $('.celebrate-flash').length,
    }));

    try {
        await page.evaluate(() => { setText($('.wrap .board .list').eq(2).find('.head .text'), 'Done'); saveBoard(); });
        const doneBefore = await page.evaluate(() => NB.board.lists[2].notes.length);

        await drag(0, 1, 2);
        assert.strictEqual(await page.evaluate(() => NB.board.lists[2].notes.length), doneBefore + 1, 'the drag landed in Done');
        let f = await fx();
        assert.deepStrictEqual(f.badges, ['+2500 XP'], 'badge reads +2500 XP');
        assert.ok(f.inDone, 'badge is on the moved card');
        assert.strictEqual(f.flash, 1, 'screen flash');

        await sleep(2300);
        f = await fx();
        assert.deepStrictEqual(f, { badges: [], inDone: false, flash: 0 }, 'all cleaned up');
        assert.strictEqual(await page.evaluate(() => $('.celebrate-done, .celebrate-fx').length), 0);

        // Reordering inside Done: no celebration.
        await drag(2, 1, 2);
        assert.deepStrictEqual((await fx()).badges, [], 'reorder within Done is quiet');

        // Out of Done: no celebration.
        await drag(2, 0, 1);
        assert.deepStrictEqual((await fx()).badges, [], 'leaving Done is quiet');

        assert.deepStrictEqual(app.errors, [], 'no page errors');
    } finally {
        await app.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
