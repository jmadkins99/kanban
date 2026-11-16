// A list named "wip" (any case) shows a live timer on the right of each
// note, per note, counting from when that note entered the list. It
// survives a reload, stops when the note leaves (keeping that visit's
// length), and starts over from 0 if the note comes back.
const assert = require('assert');
const { openApp } = require('../lib');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
    const app = await openApp(() => {});
    const { page } = app;

    const move = (from, to) => page.evaluate((from, to) => {
        $('.wrap .board .list').eq(from).find('.note').first().appendTo($('.wrap .board .list').eq(to).find('.notes'));
        saveBoard();
    }, from, to);
    const timers = (i) => page.evaluate((i) => $('.wrap .board .list').eq(i).find('.note').toArray().map((n) => {
        const t = $(n).find('.wip-timer');
        return t.is(':visible') ? t.text() : null;
    }), i);
    const secs = (t) => { const m = /^(?:(\d+)h )?(\d+)m (\d+)s$/.exec(t); assert.ok(m, 'timer format: ' + t); return (+m[1] || 0) * 3600 + +m[2] * 60 + +m[3]; };

    try {
        await page.evaluate(() => { setText($('.wrap .board .list').eq(2).find('.head .text'), 'WiP'); saveBoard(); });
        const before = (await timers(2)).length;
        assert.ok((await timers(0)).every((t) => t === null), 'no timers outside WIP');

        await move(0, 2);
        let t = await timers(2);
        assert.strictEqual(t.length, before + 1);
        assert.match(t[before], /^0m [01]s$/, 'a note entering WIP starts at 0');

        // Right side of the card, inside it.
        const box = await page.evaluate(() => {
            const n = $('.wrap .board .list').eq(2).find('.note').last();
            const a = n[0].getBoundingClientRect(), b = n.find('.wip-timer')[0].getBoundingClientRect();
            return { right: a.right - b.right, top: b.top - a.top, bottom: a.bottom - b.bottom, mid: b.left - (a.left + a.width / 2) };
        });
        assert.ok(box.right >= 0 && box.right < 20 && box.mid > 0 && box.top >= 0 && box.bottom >= 0, 'timer sits on the right inside the card ' + JSON.stringify(box));

        // Per card: a second note entering later shows less time.
        await sleep(2100);
        await move(1, 2);
        await sleep(1100);
        t = await timers(2);
        assert.ok(secs(t[before]) - secs(t[before + 1]) >= 1, 'each card counts from its own start: ' + t);

        // Survives a reload (counts from the stored start, not from the reload).
        await app.reload();
        t = await timers(2);
        assert.ok(secs(t[before]) >= 2, 'still counting after a reload: ' + t);

        // Leaving stops it and keeps the visit's length; coming back starts at 0.
        await page.evaluate(() => { $('.wrap .board .list').eq(2).find('.note').eq(-2).appendTo($('.wrap .board .list').eq(0).find('.notes')); saveBoard(); });
        const left = await page.evaluate(() => { const n = NB.board.lists[0].notes; return n[n.length - 1]; });
        assert.ok(!('wip' in left) && left.wipMs >= 2000, 'leaving keeps the visit length: ' + JSON.stringify(left));
        assert.ok((await timers(0)).every((x) => x === null), 'no timer after leaving');
        await page.evaluate(() => { $('.wrap .board .list').eq(0).find('.note').last().appendTo($('.wrap .board .list').eq(2).find('.notes')); saveBoard(); });
        t = await timers(2);
        assert.match(t[t.length - 1], /^0m [01]s$/, 'coming back starts over');

        assert.deepStrictEqual(app.errors, [], 'no page errors');
    } finally {
        await app.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
