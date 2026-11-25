// Moving a Card with the card menu's arrows keeps its state, and saves it
// once: a Card moved from WIP to Done earns its XP, the Cards it
// leaves behind keep their timers, and each move is one Undo step with no
// duplicate. Moving it back out of Done takes the XP back and starts its WIP
// timer over.
// Cards are saved as `notes`, Nullboard's name, so old boards, History days and export files load without a migration.
const assert = require('assert');
const { openApp, moveCard } = require('../lib');

(async () => {
    const app = await openApp(() => {});
    const { page } = app;

    const revision = () => page.evaluate(() => NB.board.revision);
    const saved = (i) => page.evaluate((i) => NB.board.lists[i].notes.length, i);
    const shown = (i) => page.evaluate((i) => $('.wrap .board .list').eq(i).find('.card').length, i);

    try {
        // Lists: 0 To-Do, 1 WIP, 2 Done. Two WIP Cards, started 10 and 20 minutes ago.
        const starts = await page.evaluate(() => {
            setText($('.wrap .board .list').eq(1).find('.head .text'), 'WIP');
            setText($('.wrap .board .list').eq(2).find('.head .text'), 'Done');
            saveBoard();
            const $w = $('.wrap .board .list').eq(1).find('.card');
            cardMeta($w.eq(0)).wip = Date.now() - 10 * 60000;
            cardMeta($w.eq(1)).wip = Date.now() - 20 * 60000;
            saveBoard();
            return NB.board.lists[1].notes.slice(0, 2).map((n) => n.wip);
        });

        // WIP -> Done with the right arrow (the 10-minute Card, Low): 2500, whatever its WIP time.
        const rev = await revision();
        await moveCard(page, 1, 0, 1);
        assert.strictEqual(await revision(), rev + 1, 'one save for one move');
        assert.strictEqual(await page.evaluate(() => $('.celebrate-badge').text()), '+2500 XP', 'the badge shows the award');
        assert.strictEqual(await page.evaluate(() => XP.total()), 2500);
        assert.strictEqual(await saved(2), await shown(2), 'saved once, no duplicate');
        assert.strictEqual(await page.evaluate(() => NB.board.lists[1].notes[0].wip), starts[1], 'the Card left in WIP kept its timer');

        // Back into WIP with the left arrow: the XP goes and its timer starts over.
        await moveCard(page, 2, -1, -1);
        assert.strictEqual(await page.evaluate(() => XP.total()), 0, 'leaving Done takes the XP back');
        const back = await page.evaluate(() => { const n = NB.board.lists[1].notes; return n[n.length - 1]; });
        assert.ok(Date.now() - back.wip < 5000 && !back.xp, 'back in WIP from 0: ' + JSON.stringify(back));
        assert.strictEqual(await saved(1), await shown(1));
        assert.strictEqual(await saved(2), await shown(2));

        assert.deepStrictEqual(app.errors, [], 'no page errors');
    } finally {
        await app.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
