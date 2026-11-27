// A list named "wip" (any case) shows a live timer on the right of each
// card, per card, counting from when that card entered the list. It
// survives a reload, stops when the card leaves (keeping that visit's
// length), and starts over from 0 if the card comes back.
// Cards are saved as `notes`, Nullboard's name, so old boards, History days and export files load without a migration.
const assert = require('assert');
const { openApp, moveCard, fakeClock, advanceClock } = require('../lib');

(async () => {
    const app = await openApp(fakeClock('2028-11-15 10:00', { freeze: true }));
    const { page } = app;

    const move = (from, to) => moveCard(page, from, 0, to - from);
    const timers = (i) => page.evaluate((i) => $('.wrap .board .list').eq(i).find('.card').toArray().map((n) => {
        const t = $(n).find('.wip-timer');
        return t.is(':visible') ? t.text() : null;
    }), i);
    // Waits for the 250 ms tick to show `want` on every visible timer of List 2 from `from` on.
    const shows = (from, want) => page.waitForFunction((from, want) => {
        const cards = $('.wrap .board .list').eq(2).find('.card').toArray();
        return cards.length == from + want.length && cards.slice(from)
            .every((n, i) => $(n).find('.wip-timer:visible').text() == want[i]);
    }, {}, from, want);

    try {
        await page.evaluate(() => { setText($('.wrap .board .list').eq(2).find('.head .text'), 'WiP'); saveBoard(); });
        const before = (await timers(2)).length;
        assert.ok((await timers(0)).every((t) => t === null), 'no timers outside WIP');

        await move(0, 2);
        // A card entering WIP starts at 0.
        await shows(before, ['0m 0s']);

        // Right side of the card, inside it.
        const box = await page.evaluate(() => {
            const n = $('.wrap .board .list').eq(2).find('.card').last();
            const a = n[0].getBoundingClientRect(), b = n.find('.wip-timer')[0].getBoundingClientRect();
            return { right: a.right - b.right, top: b.top - a.top, bottom: a.bottom - b.bottom, mid: b.left - (a.left + a.width / 2) };
        });
        assert.ok(box.right >= 0 && box.right < 20 && box.mid > 0 && box.top >= 0 && box.bottom >= 0, 'timer sits on the right inside the card ' + JSON.stringify(box));

        // Per card: a second card entering later shows less time.
        await advanceClock(page, 2000);
        await shows(before, ['0m 2s']);
        await move(1, 2);
        await advanceClock(page, 1000);
        await shows(before, ['0m 3s', '0m 1s']);

        // Survives a reload (counts from the stored start, not from the reload).
        await app.reload();
        await shows(before, ['0m 3s', '0m 1s']);

        // Leaving stops it and keeps the visit's length; coming back starts at 0.
        await moveCard(page, 2, -2, -2);
        const left = await page.evaluate(() => { const n = NB.board.lists[0].notes; return n[n.length - 1]; });
        assert.ok(!('wip' in left) && left.wipMs == 3000, 'leaving keeps the visit length: ' + JSON.stringify(left));
        assert.ok((await timers(0)).every((x) => x === null), 'no timer after leaving');
        await moveCard(page, 0, -1, 2);
        // The one that stayed, then the one back, starting over.
        await shows(before, ['0m 1s', '0m 0s']);

        assert.deepStrictEqual(app.errors, [], 'no page errors');
    } finally {
        await app.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
