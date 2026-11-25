// Moving a Card into a Done list with the right arrow plays the celebration: the Card's
// gold aura, a "+2500 XP" badge and a full-screen flash, gone after ~2 s.
// Passing through another List on the way, or moving out of Done, doesn't.
// Cards are saved as `notes`, Nullboard's name, so old boards, History days and export files load without a migration.
const assert = require('assert');
const { openApp, moveCard } = require('../lib');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
    const app = await openApp(() => {});
    const { page } = app;
    await page.setViewport({ width: 1280, height: 1000 });

    const fx = () => page.evaluate(() => ({
        badges: $('.celebrate-badge').map((_, b) => b.textContent).get(),
        inDone: $('.celebrate-badge').closest('.list').hasClass('done-list'),
        flash: $('.celebrate-flash').length,
    }));

    try {
        await page.evaluate(() => { setText($('.wrap .board .list').eq(2).find('.head .text'), 'Done'); saveBoard(); });
        const doneBefore = await page.evaluate(() => NB.board.lists[2].notes.length);

        await moveCard(page, 0, 1, 2); // two Lists over, the first hop quiet
        assert.strictEqual(await page.evaluate(() => NB.board.lists[2].notes.length), doneBefore + 1, 'the Card landed in Done');
        let f = await fx();
        assert.deepStrictEqual(f.badges, ['+2500 XP'], 'badge reads +2500 XP');
        assert.ok(f.inDone, 'badge is on the moved card');
        assert.strictEqual(f.flash, 1, 'screen flash');

        await sleep(2300);
        f = await fx();
        assert.deepStrictEqual(f, { badges: [], inDone: false, flash: 0 }, 'all cleaned up');
        assert.strictEqual(await page.evaluate(() => $('.celebrate-done, .celebrate-fx').length), 0);

        // Out of Done: no celebration.
        await moveCard(page, 2, -1, -1);
        assert.deepStrictEqual((await fx()).badges, [], 'leaving Done is quiet');

        assert.deepStrictEqual(app.errors, [], 'no page errors');
    } finally {
        await app.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
