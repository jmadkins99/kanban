// Lists still move with their menu's "Move >" and "< Move", one place at a
// time, and the order is saved. The card menu's arrows follow the new order:
// a Card in the List now last can't go right.
// Cards are saved as `notes`, Nullboard's name, so old boards, History days and export files load without a migration.
const assert = require('assert');
const { openApp, settle } = require('../lib');

(async () => {
    const app = await openApp(() => {});
    const { page } = app;

    const titles = () => page.evaluate(() => ({
        shown: $('.wrap .board .list .head .text').map((_, t) => $(t).attr('_text')).get(),
        saved: NB.board.lists.map((l) => l.title),
    }));
    const pick = async (list, sel) => {
        await page.evaluate((list, sel) => $('.wrap .board .list').eq(list).find(sel).click(), list, sel);
        await settle(page);
    };

    try {
        const start = (await titles()).saved;
        assert.strictEqual(start.length, 3);

        await pick(0, '.mov-list-r.full');
        assert.deepStrictEqual(await titles(), { shown: [start[1], start[0], start[2]], saved: [start[1], start[0], start[2]] }, 'Move > swaps it with the next List');

        await pick(1, '.mov-list-l.full');
        assert.deepStrictEqual(await titles(), { shown: start, saved: start }, '< Move puts it back');

        await pick(2, '.mov-list-l.full');
        const moved = [start[0], start[2], start[1]];
        assert.deepStrictEqual(await titles(), { shown: moved, saved: moved });
        await app.reload();
        assert.deepStrictEqual((await titles()).saved, moved, 'the order survives a reload');

        // The card menu follows: a Card in the List now last can't go right.
        const greyed = await page.evaluate(() => {
            const $c = $('.wrap .board .list').eq(2).find('.card').first();
            $c.find('.text').trigger('click');
            return ['left', 'right'].map((d) => $c.find(`[data-cm=${d}]`).prop('disabled'));
        });
        assert.deepStrictEqual(greyed, [false, true]);

        assert.deepStrictEqual(app.errors, [], 'no page errors');
    } finally {
        await app.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
