// @serial: asserts the level-up overlay is still up after 1.2 s and gone within about 5 s, both on the app's real setTimeout and CSS animation
// Levels and ranks: the badge above the XP bar shows level, rank name and
// insignia; reaching a new level by moving a card into Done plays the
// level-up once (with the new level, rank and insignia), and the overlay
// removes itself afterwards. Dropping a level (moving out of Done) is quiet.
const assert = require('assert');
const { openApp, moveCard } = require('../lib');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
    const app = await openApp(() => {});
    const { page } = app;

    const badge = () => page.evaluate(() => ({
        num: $('.level-badge .level-num').text(),
        rank: $('.level-badge .level-rank').text(),
        svg: $('.level-badge .level-insignia svg').length,
    }));
    const toDone = (from) => moveCard(page, from, 0, 2 - from);

    try {
        assert.deepStrictEqual(await badge(), { num: 'Lvl 1', rank: 'Private', svg: 1 });

        // Record level-up calls, still playing the real thing.
        await page.evaluate(() => {
            window.played = [];
            const real = LevelUp.play;
            LevelUp.play = (o) => { window.played.push({ level: o.level, rankName: o.rankName, svg: /<svg/.test(o.insigniaSvg) }); return real(o); };
            setText($('.wrap .board .list').eq(2).find('.head .text'), 'Done');
            saveBoard();
        });

        for (let i = 0; i < 4; i++) await toDone(0);
        await sleep(1200);
        assert.deepStrictEqual(await page.evaluate(() => window.played), [], 'no level-up before the 5th card');

        await toDone(0);
        assert.deepStrictEqual(await badge(), { num: 'Lvl 2', rank: 'Private I', svg: 1 }, 'badge shows the new level');
        await sleep(1200);
        assert.deepStrictEqual(await page.evaluate(() => window.played), [{ level: 2, rankName: 'Private I', svg: true }], 'level-up plays once');
        assert.strictEqual(await page.evaluate(() => $('.lu-ov').length), 1, 'overlay is up');

        // It cleans itself up (about 5 s).
        await page.waitForFunction(() => !$('.lu-ov').length, { timeout: 9000 });

        // Dropping back a level: badge follows, no show.
        await moveCard(page, 2, -1, -1);
        await sleep(1200);
        assert.deepStrictEqual(await badge(), { num: 'Lvl 1', rank: 'Private', svg: 1 });
        assert.strictEqual(await page.evaluate(() => window.played.length), 1, 'losing a level is quiet');

        assert.deepStrictEqual(app.errors, [], 'no page errors');
    } finally {
        await app.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
