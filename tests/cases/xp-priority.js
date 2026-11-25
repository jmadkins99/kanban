// A Card entering Done earns a flat amount by its Priority: Low 2500, Medium
// 3500, Critical 5000, Recurring 5000, and the +XP badge shows it. Time in WIP
// earns nothing. The amount is fixed when it enters Done, so changing its
// Priority there leaves it alone. XP already banked or earned (under the old
// per-WIP-minute rule) loads as it was.
// Cards are saved as `notes`, Nullboard's name, so old boards, History days and export files load without a migration.
const assert = require('assert');
const { openApp, moveCard, sleep, setPriority: setPriorityOn } = require('../lib');

(async () => {
    // XP banked on an earlier day, under the old rule.
    const app = await openApp(() => {
        if (!localStorage.getItem('nullboard.xpBank')) localStorage.setItem('nullboard.xpBank', JSON.stringify({ old1: 3075, old2: 30100 }));
    });
    const { page } = app;
    await page.setViewport({ width: 1280, height: 1000 });
    await sleep(300);
    // These awards level up a few times; the level-up show (level-up.js covers
    // it) would cover the Cards this test clicks.
    await page.evaluate(() => { LevelUp.play = () => {}; });

    const card = (list, i) => `.wrap .board .list:nth-child(${list + 1}) .card:nth-child(${i + 1})`;
    // Edit the Card, pick a Priority in the Card editor, click away.
    const setPriority = (sel, priority) => setPriorityOn(page, sel, priority);
    // Where the Card with this text sits in List `list`.
    const indexOf = (list, text) => page.evaluate((list, text) => NB.board.lists[list].notes.findIndex((n) => n.text == text), list, text);
    // The Card with this text in Done: what it saved and what its badge says.
    const inDone = (text) => page.evaluate((text) => {
        const n = NB.board.lists[2].notes.find((n) => n.text == text);
        const $c = $('.wrap .board .list').eq(2).find('.card').filter((_, c) => getText($(c).find('.text')) == text);
        return { xp: n.xp, badge: $c.find('.celebrate-badge').text() };
    }, text);
    const total = () => page.evaluate(() => XP.total());

    try {
        // Lists: 0 To-Do, 1 WIP, 2 Done.
        await page.evaluate(() => {
            setText($('.wrap .board .list').eq(1).find('.head .text'), 'WIP');
            setText($('.wrap .board .list').eq(2).find('.head .text'), 'Done');
            saveBoard();
        });
        let want = 3075 + 30100;
        assert.strictEqual(await total(), want, 'banked XP counts');

        // Each Priority, from To-Do to Done.
        const award = { Low: 2500, Medium: 3500, Critical: 5000, Recurring: 5000 };
        for (const priority of Object.keys(award)) {
            const text = await page.evaluate(() => NB.board.lists[0].notes[0].text);
            await setPriority(card(0, 0), priority);
            await moveCard(page, 0, await indexOf(0, text), 2);
            assert.deepStrictEqual(await inDone(text), { xp: award[priority], badge: `+${award[priority]} XP` }, priority + ' earns ' + award[priority]);
            want += award[priority];
        }
        assert.strictEqual(await total(), want, 'the bar adds them up');

        // Hours in WIP earn nothing extra: a Low Card 10 hours in, a Critical one an hour in.
        const [low, critical] = await page.evaluate(() => {
            const $w = $('.wrap .board .list').eq(1).find('.card');
            cardMeta($w.eq(0)).wip = Date.now() - 10 * 3600000;
            cardMeta($w.eq(1)).wip = Date.now() - 3600000;
            saveBoard();
            return NB.board.lists[1].notes.slice(0, 2).map((n) => n.text);
        });
        await setPriority(card(1, await indexOf(1, critical)), 'Critical');
        await moveCard(page, 1, await indexOf(1, low), 1);
        assert.deepStrictEqual(await inDone(low), { xp: 2500, badge: '+2500 XP' }, '10 hours in WIP: still 2500');
        await moveCard(page, 1, await indexOf(1, critical), 1);
        assert.deepStrictEqual(await inDone(critical), { xp: 5000, badge: '+5000 XP' }, 'an hour in WIP: still 5000');
        want += 2500 + 5000;

        // Changing a Priority in Done doesn't change what the Card earned.
        await setPriority(card(2, await indexOf(2, low)), 'Critical');
        assert.strictEqual(await page.evaluate((t) => NB.board.lists[2].notes.find((n) => n.text == t).priority, low), 'critical');
        assert.strictEqual((await inDone(low)).xp, 2500, 'a Low Card made Critical in Done keeps its 2500');
        assert.strictEqual(await total(), want);

        // XP a Card earned under the old rule, and the bank, load unchanged.
        await page.evaluate(() => {
            const n = NB.board.lists[2].notes.find((n) => !n.xp);
            n.xp = 5950; n.xpId = 'oldcard';
            NB.storage.saveBoard(NB.board);
        });
        want += 5950;
        await app.reload();
        assert.strictEqual(await page.evaluate(() => NB.board.lists[2].notes.find((n) => n.xpId == 'oldcard').xp), 5950, 'earned XP is kept on load');
        const bank = await page.evaluate(() => XP.bank());
        assert.deepStrictEqual([bank.old1, bank.old2], [3075, 30100], 'banked XP is kept on load');
        assert.strictEqual(await total(), want);

        // Level costs are unchanged: 11,500 for level 1, then +2% a level.
        assert.deepStrictEqual(await page.evaluate(() => [1, 2, 69].map(XP.levelCost)), [11500, 11730, 44209]);

        assert.deepStrictEqual(app.errors, [], 'no page errors');
    } finally {
        await app.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
