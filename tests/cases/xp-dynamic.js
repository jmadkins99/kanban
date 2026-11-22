// A card's XP grows with its time in WIP: 2500 + 57.5 per whole minute of
// its last WIP visit (a flat amount at every level), capped at 8 hours. The
// +XP badge shows the amount it actually earned.
// Cards are saved as `notes`, Nullboard's name, so old boards, History days and export files load without a migration.
const assert = require('assert');
const { openApp, moveCard } = require('../lib');

(async () => {
    const app = await openApp(() => {});
    const { page } = app;

    // Lists: 0 To-Do (stays), 1 WIP, 2 Done. Give the first WIP card a start
    // `minutesAgo` back, then move it straight to Done with ➡️.
    const fromWip = async (minutesAgo) => {
        await page.evaluate((minutesAgo) => { cardMeta($('.wrap .board .list').eq(1).find('.card').first()).wip = Date.now() - minutesAgo * 60000; }, minutesAgo);
        await moveCard(page, 1, 0, 1);
        return page.evaluate(() => {
            const n = NB.board.lists[2].notes;
            return { xp: n[n.length - 1].xp, badge: $('.wrap .board .list').eq(2).find('.card').last().find('.celebrate-badge').text() };
        });
    };

    try {
        await page.evaluate(() => {
            setText($('.wrap .board .list').eq(1).find('.head .text'), 'WIP');
            setText($('.wrap .board .list').eq(2).find('.head .text'), 'Done');
            saveBoard();
        });

        assert.deepStrictEqual(await fromWip(0), { xp: 2500, badge: '+2500 XP' }, 'no WIP time: the base 2500');
        assert.deepStrictEqual(await fromWip(10.9), { xp: 3075, badge: '+3075 XP' }, 'whole minutes only: 10 x 57.5');
        assert.deepStrictEqual(await fromWip(60), { xp: 5950, badge: '+5950 XP' }, 'an hour: +30% of a level');
        assert.deepStrictEqual(await fromWip(10 * 60), { xp: 30100, badge: '+30100 XP' }, 'capped at 8 hours');

        // A Card that left WIP for To-Do passes back through WIP on its way to
        // Done, and that new visit (a moment) is the one that counts.
        await page.evaluate(() => { cardMeta($('.wrap .board .list').eq(1).find('.card').first()).wip = Date.now() - 5.5 * 60000; });
        await moveCard(page, 1, 0, -1); // leaves WIP: wipMs = 5.5 min
        await moveCard(page, 0, -1, 2);
        const viaTodo = await page.evaluate(() => { const n = NB.board.lists[2].notes; return n[n.length - 1].xp; });
        assert.strictEqual(viaTodo, 2500, 'the last WIP visit counts, not the 5.5 minutes before it');

        // The bar adds them up: 2500 + 3075 + 5950 + 30100 + 2500 = 44125.
        assert.strictEqual(await page.evaluate(() => XP.total()), 44125);
        assert.strictEqual(await page.evaluate(() => $('.xp-bar__text').text()), 'Lvl 4, XP 8,930/12,204, 73%');

        assert.deepStrictEqual(app.errors, [], 'no page errors');
    } finally {
        await app.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
