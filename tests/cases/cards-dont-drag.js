// Cards don't drag, with a mouse or by touch, so nothing suggests the order
// within a List is placed by hand. Holding a Card and moving
// it onto another List shows no ghost or drop indicator and changes nothing.
// Cards are saved as `notes`, Nullboard's name, so old boards, History days and export files load without a migration.
const assert = require('assert');
const { openApp } = require('../lib');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
    const app = await openApp(() => {});
    const { page } = app;
    await page.setViewport({ width: 1280, height: 1000 });
    await sleep(300);

    const state = () => page.evaluate(() => ({
        saved: JSON.stringify(NB.board.lists),
        shown: $('.wrap .board .list').map((_, l) => $(l).find('.card .text').map((_, t) => $(t).attr('_text')).get().join('|')).get(),
        revision: NB.board.revision,
    }));
    const dragUi = () => page.evaluate(() => ({
        ghost: $('.card-dragster').length,
        dragging: $('.dragging').length,
    }));
    // Mouse: from the middle of the 2nd Card of the first List to the top of the third List.
    const points = () => page.evaluate(() => {
        const a = $('.wrap .board .list').eq(0).find('.card .text').eq(1)[0].getBoundingClientRect();
        const b = $('.wrap .board .list').eq(2).find('.card').first()[0].getBoundingClientRect();
        return [[a.left + a.width / 2, a.top + Math.min(a.height / 2, 8)], [b.left + b.width / 2, b.top + 4]];
    });

    try {
        const before = await state();
        const [from, to] = await points();

        // Mouse: hold well past Nullboard's old 500 ms, then move across.
        await page.mouse.move(from[0], from[1]);
        await page.mouse.down();
        await sleep(700);
        for (let i = 1; i <= 15; i++) {
            await page.mouse.move(from[0] + (to[0] - from[0]) * i / 15, from[1] + (to[1] - from[1]) * i / 15);
            await sleep(20);
        }
        assert.deepStrictEqual(await dragUi(), { ghost: 0, dragging: 0 }, 'no drag ghost mid-move');
        await page.mouse.up();
        await sleep(300);
        assert.deepStrictEqual(await state(), before, 'a mouse drag moves nothing');

        // Touch: the same gesture with a finger, the other way (a swipe to the
        // right would be Chrome's own swipe-back to the blank page the test began on).
        const [tFrom, tTo] = await page.evaluate(() => {
            const a = $('.wrap .board .list').eq(2).find('.card .text').eq(1)[0].getBoundingClientRect();
            const b = $('.wrap .board .list').eq(0).find('.card').first()[0].getBoundingClientRect();
            return [[a.left + a.width / 2, a.top + Math.min(a.height / 2, 8)], [b.left + b.width / 2, b.top + 4]];
        });
        await page.touchscreen.touchStart(tFrom[0], tFrom[1]);
        await sleep(700);
        for (let i = 1; i <= 15; i++) {
            await page.touchscreen.touchMove(tFrom[0] + (tTo[0] - tFrom[0]) * i / 15, tFrom[1] + (tTo[1] - tFrom[1]) * i / 15);
            await sleep(20);
        }
        assert.deepStrictEqual(await dragUi(), { ghost: 0, dragging: 0 }, 'no drag ghost mid-touch');
        await page.touchscreen.touchEnd();
        await sleep(300);
        assert.deepStrictEqual(await state(), before, 'a touch drag moves nothing');

        assert.deepStrictEqual(app.errors, [], 'no page errors');
    } finally {
        await app.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
