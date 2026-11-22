// Every Card has a Priority: Recurring, Critical, Medium or Low. Its icon sits
// at the very left of the Card, before the text. "+ Card" starts a Card as Low.
// In edit mode the icon is a dropdown; clicking away saves the text and the
// Priority together, as one Undo step.
// Cards are saved as `notes`, Nullboard's name, so old boards, History days and export files load without a migration.
const assert = require('assert');
const { openApp, settle } = require('../lib');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
    const app = await openApp(() => {});
    const { page } = app;
    await page.setViewport({ width: 1280, height: 1000 });
    await sleep(300);

    const clickAway = async () => { await page.mouse.click(1270, 990); await sleep(50); await settle(page); };
    // The Priority each Card in List `list` shows, top to bottom, by its icon's label.
    const shown = (list) => page.evaluate((list) => $('.wrap .board .list').eq(list).find('.card').map((_, c) => {
        const icon = $(c).find('.card-prio:visible svg');
        return icon.length ? $(c).find('.card-prio').attr('aria-label') : null;
    }).get(), list);
    const saved = (list) => page.evaluate((list) => NB.board.lists[list].notes.map((n) => [n.text, n.priority]), list);

    try {
        // "+ Card" opens a new Card in edit mode, with Low selected.
        await page.evaluate(() => $('.wrap .board .list').eq(0).find('.add-card').click());
        await sleep(100);
        assert.strictEqual(await page.evaluate(() => $('.wrap .board .card.editing .card-prio').attr('aria-label')), 'Priority: Low', 'a new Card starts as Low');
        await page.keyboard.type('a new Card');
        await clickAway();
        const n = (await saved(0)).length;
        assert.deepStrictEqual((await saved(0))[n - 1], ['a new Card', 'low'], 'saved as Low');
        assert.strictEqual((await shown(0))[n - 1], 'Priority: Low', 'shows the Low icon');

        // The icon sits at the very left of the Card, before its text.
        const box = await page.evaluate(() => {
            const $c = $('.wrap .board .list').eq(0).find('.card').last();
            const c = $c[0].getBoundingClientRect(), i = $c.find('.card-prio')[0].getBoundingClientRect(), t = $c.find('.text')[0].getBoundingClientRect();
            const range = document.createRange(); range.selectNodeContents($c.find('.text')[0]);
            const words = range.getBoundingClientRect();
            return { left: i.left - c.left, beforeText: i.right <= words.left, inside: i.top >= c.top && i.bottom <= c.bottom };
        });
        assert.ok(box.left >= 0 && box.left < 12 && box.beforeText && box.inside, 'the icon is at the left, before the text ' + JSON.stringify(box));

        assert.deepStrictEqual(app.errors, [], 'no page errors');
    } finally {
        await app.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
