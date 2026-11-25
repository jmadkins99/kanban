// The card menu: clicking a Card (tapping on a phone) slides a panel over it
// with one row: a left arrow, Edit, a right arrow. The arrows are thin drawn
// chevrons in the accent colour (its pale shade, to show on the dark menu),
// like the Priority icons, not emoji. Moving the mouse off the Card closes
// the menu, and hovering alone opens nothing. The arrows move the Card one
// List over and are greyed out (and do nothing) in the first and last List;
// a move into Done awards XP and celebrates. A click on a Card opens the menu
// rather than editing; Edit opens the Card editor.
// Cards are saved as `notes`, Nullboard's name, so old boards, History days and export files load without a migration.
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
    const tapOpen = (sel) => page.evaluate((sel) => $(sel).find('.text').trigger('click'), sel);
    const press = (sel, cm) => page.evaluate((sel, cm) => $(sel).find(`[data-cm=${cm}]`).click(), sel, cm);
    const greyed = (sel) => page.evaluate((sel) => ['left', 'right'].map((d) => $(sel).find(`[data-cm=${d}]`).prop('disabled')), sel);

    try {
        await page.evaluate(() => { setText($('.wrap .board .list').eq(2).find('.head .text'), 'Done'); saveBoard(); });

        // Hovering alone opens nothing.
        await page.hover(card(0, 0) + ' .text');
        await sleep(450);
        assert.strictEqual(await page.evaluate((sel) => $(sel).hasClass('cm-open'), card(0, 0)), false, 'hover does not open the menu');

        // A click: the panel covers the Card, with one row: ‹ Edit ›, the
        // arrows drawn, labelled, and no emoji anywhere in the menu.
        await clickOpen(card(0, 0));
        const open = await page.evaluate((sel) => {
            const n = $(sel)[0], p = $(sel).find('.cm-panel')[0];
            const a = n.getBoundingClientRect(), b = p.getBoundingClientRect();
            const $b = $(sel).find('.cm-panel button:visible');
            const tops = $b.map((_, x) => Math.round(x.getBoundingClientRect().top)).get();
            return {
                covers: Math.abs(a.top - b.top) <= 2 && Math.abs(a.bottom - b.bottom) <= 2 && Math.abs(a.left - b.left) <= 2 && Math.abs(a.right - b.right) <= 2,
                options: $b.map((_, x) => x.getAttribute('aria-label') || x.textContent.trim().toLowerCase()).get(),
                oneRow: tops.every((t) => t === tops[0]),
                drawn: $b.filter('[data-cm=left], [data-cm=right]').get().map((x) => !! x.querySelector('svg path') && x.textContent.trim() === ''),
                noEmoji: ! /\p{Extended_Pictographic}/u.test($(sel).find('.cm-panel').text()),
                accent: $b.filter('[data-cm=left], [data-cm=right]').find('svg path').get().map((x) => getComputedStyle(x).stroke),
            };
        }, card(0, 0));
        const accent = await page.evaluate(() => { const d = $('<i>').css('color', 'var(--accent-pale)').appendTo('body'); const c = getComputedStyle(d[0]).color; d.remove(); return c; });
        assert.deepStrictEqual(open.accent, [accent, accent], 'the arrows are drawn in the accent colour');
        delete open.accent;
        assert.deepStrictEqual(open, { covers: true, options: ['Move left', 'edit', 'Move right'], oneRow: true, drawn: [true, true], noEmoji: true });

        // Moving off the Card closes it; a click opens it again.
        await page.mouse.move(5, 5);
        await sleep(100);
        assert.strictEqual(await page.evaluate((sel) => $(sel).hasClass('cm-open'), card(0, 0)), false, 'leaving the Card closes the menu');
        await clickOpen(card(0, 0));

        // In the first List, the left arrow is greyed out and does nothing; the right one moves it over.
        assert.deepStrictEqual(await greyed(card(0, 0)), [true, false]);
        const before = await counts();
        await page.click(card(0, 0) + ' [data-cm=left]');
        await sleep(100);
        assert.deepStrictEqual(await counts(), before, 'the left arrow in the first List does nothing');
        await page.click(card(0, 0) + ' [data-cm=right]');
        await sleep(100);
        assert.deepStrictEqual(await counts(), [before[0] - 1, before[1] + 1, before[2]], 'moved one List right');

        // Into Done with the right arrow: XP and the celebration.
        const last1 = `.wrap .board .list:nth-child(2) .card:last-child`;
        await tapOpen(last1);
        await press(last1, 'right');
        assert.strictEqual(await page.evaluate(() => $('.celebrate-badge').text()), '+2500 XP');
        assert.strictEqual(await page.evaluate(() => XP.total()), 2500);
        assert.deepStrictEqual(await counts(), [before[0] - 1, before[1], before[2] + 1], 'moved into Done');

        // In the last List, the right arrow is greyed out and does nothing.
        const lastDone = `.wrap .board .list:nth-child(3) .card:last-child`;
        await tapOpen(lastDone);
        assert.deepStrictEqual(await greyed(lastDone), [false, true]);
        await press(lastDone, 'right');
        assert.deepStrictEqual(await counts(), [before[0] - 1, before[1], before[2] + 1], 'the right arrow in the last List does nothing');

        // The left arrow moves it back out of Done (taking the XP back).
        await press(lastDone, 'left');
        assert.deepStrictEqual(await counts(), [before[0] - 1, before[1] + 1, before[2]], 'moved one List left');
        assert.strictEqual(await page.evaluate(() => XP.total()), 0);

        // A click on a Card opens the menu, it doesn't edit.
        await tapOpen(card(0, 1));
        assert.deepStrictEqual(await page.evaluate((sel) => [$(sel).hasClass('cm-open'), $(sel).hasClass('editing')], card(0, 1)), [true, false]);

        // Edit opens the Card editor.
        await press(card(0, 1), 'edit');
        assert.ok(await page.evaluate((sel) => $(sel).is('[role=dialog][aria-label="Card editor"]'), card(0, 1)), 'Edit opens the Card editor');
        await page.evaluate(() => $('.card-editor-backdrop').click());
        await settle(page);

        assert.deepStrictEqual(app.errors, [], 'no page errors');
    } finally {
        await app.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
