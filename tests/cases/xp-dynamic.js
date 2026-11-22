// A card's XP grows with its time in WIP: 2500 + 57.5 per whole minute of
// its last WIP visit (a flat amount at every level), capped at 8 hours. The
// +XP badge shows the amount it actually earned.
const assert = require('assert');
const { openApp } = require('../lib');

(async () => {
    const app = await openApp(() => {});
    const { page } = app;

    // Lists: 0 To-Do (stays), 1 WIP, 2 Done. Give the first WIP card a start
    // `minutesAgo` back, then move it straight to Done the way a drag does.
    const fromWip = (minutesAgo) => page.evaluate((minutesAgo) => {
        const $n = $('.wrap .board .list').eq(1).find('.card').first();
        cardMeta($n).wip = Date.now() - minutesAgo * 60000;
        $n.appendTo($('.wrap .board .list').eq(2).find('.cards'));
        cardMoved($n, false);
        saveBoard();
        const n = NB.board.lists[2].notes;
        return { xp: n[n.length - 1].xp, badge: $n.find('.celebrate-badge').text() };
    }, minutesAgo);

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

        // A card that left WIP earlier carries that visit's length.
        const viaTodo = await page.evaluate(() => {
            const $n = $('.wrap .board .list').eq(1).find('.card').first();
            cardMeta($n).wip = Date.now() - 5.5 * 60000;
            $n.appendTo($('.wrap .board .list').eq(0).find('.cards'));
            saveBoard(); // leaves WIP: wipMs = 5.5 min
            $n.appendTo($('.wrap .board .list').eq(2).find('.cards'));
            cardMoved($n, false);
            saveBoard();
            const n = NB.board.lists[2].notes;
            return n[n.length - 1].xp;
        });
        assert.strictEqual(viaTodo, 2788, 'last WIP visit counts: 2500 + 5 x 57.5');

        // The bar adds them up: 2500 + 3075 + 5950 + 30100 + 2788 = 44413.
        assert.strictEqual(await page.evaluate(() => XP.total()), 44413);
        assert.strictEqual(await page.evaluate(() => $('.xp-bar__text').text()), 'Lvl 4, XP 9,218/12,204, 75%');

        assert.deepStrictEqual(app.errors, [], 'no page errors');
    } finally {
        await app.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
