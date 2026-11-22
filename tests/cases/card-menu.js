// The card menu: clicking a card (tapping on a phone) slides a panel over it
// with Move, Edit and Delete; moving the mouse off the card closes it, and
// hovering alone opens nothing. Move offers left/right arrows, greyed out at the board's ends, and
// a move into Done counts like a drag (XP + celebration). A click on a card
// opens the menu rather than editing; Edit edits; Delete deletes.
const assert = require('assert');
const { openApp, settle } = require('../lib');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
    const app = await openApp(() => {});
    const { page } = app;
    await page.setViewport({ width: 1280, height: 1000 });
    await sleep(300);

    const card = (l, i) => `.wrap .board .list:nth-child(${l + 1}) .card:nth-child(${i + 1})`;
    const counts = () => page.evaluate(() => NB.board.lists.map((l) => l.notes.length));
    const clickOpen = async (sel) => { await page.click(sel + ' .text'); await sleep(450); };
    const press = (sel, cm) => page.evaluate((sel, cm) => $(sel).find(`[data-cm=${cm}]`).click(), sel, cm);

    try {
        await page.evaluate(() => { setText($('.wrap .board .list').eq(2).find('.head .text'), 'Done'); saveBoard(); });

        // Hovering alone opens nothing.
        await page.hover(card(0, 0) + ' .text');
        await sleep(450);
        assert.strictEqual(await page.evaluate((sel) => $(sel).hasClass('cm-open'), card(0, 0)), false, 'hover does not open the menu');

        // A click: the panel covers the card, with exactly the three options.
        await clickOpen(card(0, 0));
        const open = await page.evaluate((sel) => {
            const n = $(sel)[0], p = $(sel).find('.cm-panel')[0];
            const a = n.getBoundingClientRect(), b = p.getBoundingClientRect();
            return {
                covers: Math.abs(a.top - b.top) <= 2 && Math.abs(a.bottom - b.bottom) <= 2 && Math.abs(a.left - b.left) <= 2 && Math.abs(a.right - b.right) <= 2,
                options: $(sel).find('.cm-main button').map((_, x) => x.textContent.trim().toLowerCase()).get(),
            };
        }, card(0, 0));
        assert.deepStrictEqual(open, { covers: true, options: ['move', 'edit', 'delete'] });

        // Moving off the card closes it; a click opens it again.
        await page.mouse.move(5, 5);
        await sleep(100);
        assert.strictEqual(await page.evaluate((sel) => $(sel).hasClass('cm-open'), card(0, 0)), false, 'leaving the card closes the menu');
        await clickOpen(card(0, 0));

        // Move: in the first list, left is greyed out; right moves it over.
        await press(card(0, 0), 'move');
        assert.deepStrictEqual(await page.evaluate((sel) => [$(sel).find('[data-cm=left]').prop('disabled'), $(sel).find('[data-cm=right]').prop('disabled')], card(0, 0)), [true, false]);
        const before = await counts();
        await press(card(0, 0), 'right');
        assert.deepStrictEqual(await counts(), [before[0] - 1, before[1] + 1, before[2]], 'moved one list right');

        // Into Done with the arrows: XP and the celebration, like a drag.
        await page.evaluate(() => { $('.wrap .board .list').eq(1).find('.card').last().find('.text').trigger('click'); });
        const last1 = `.wrap .board .list:nth-child(2) .card:last-child`;
        await press(last1, 'move');
        await press(last1, 'right');
        assert.strictEqual(await page.evaluate(() => $('.celebrate-badge').text()), '+2500 XP');
        assert.strictEqual(await page.evaluate(() => XP.total()), 2500);

        // In the last list, right is greyed out.
        const lastDone = `.wrap .board .list:nth-child(3) .card:last-child`;
        await page.evaluate((sel) => $(sel).find('.text').trigger('click'), lastDone);
        await press(lastDone, 'move');
        assert.deepStrictEqual(await page.evaluate((sel) => [$(sel).find('[data-cm=left]').prop('disabled'), $(sel).find('[data-cm=right]').prop('disabled')], lastDone), [false, true]);

        // A click on a card opens the menu, it doesn't edit.
        await page.evaluate((sel) => $(sel).find('.text').trigger('click'), card(0, 1));
        assert.deepStrictEqual(await page.evaluate((sel) => [$(sel).hasClass('cm-open'), $(sel).hasClass('editing')], card(0, 1)), [true, false]);

        // Edit edits.
        await press(card(0, 1), 'edit');
        assert.ok(await page.evaluate((sel) => $(sel).hasClass('editing'), card(0, 1)), 'Edit starts editing');
        await page.evaluate(() => $('.wrap .board .card.editing .edit').blur());
        await settle(page);

        // Delete deletes.
        const n0 = (await counts())[0];
        await press(card(0, 1), 'delete');
        await sleep(600);
        assert.strictEqual((await counts())[0], n0 - 1, 'Delete removes the card');

        assert.deepStrictEqual(app.errors, [], 'no page errors');
    } finally {
        await app.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
