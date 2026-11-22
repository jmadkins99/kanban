// A Critical Card shows a red Critical timer for how long it has waited to
// reach WIP. It starts when the Card is made Critical, starts over whenever
// the Card enters a List that isn't WIP or Done, gives way to the WIP timer
// (in the day's accent) in WIP, and shows nothing in Done. A Card that stops
// being Critical loses it. It counts from a stored start, so it's right after
// a reload with the clock moved on.
// Cards are saved as `notes`, Nullboard's name, so old boards, History days and export files load without a migration.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openApp, moveCard, settle } = require('../lib');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SKEW = (3 * 3600 + 25 * 60) * 1000; // 3h 25m

(async () => {
    // From the second load on, the clock runs 3h 25m ahead.
    const app = await openApp(`if (localStorage.getItem('test.skew')) {
        const Real = Date, skew = ${SKEW};
        window.Date = class extends Real {
            constructor(...a) { super(...(a.length ? a : [Real.now() + skew])); }
            static now() { return Real.now() + skew; }
        };
    }`, { demo: false });
    const { page } = app;
    await page.setViewport({ width: 1280, height: 1000 });
    await sleep(300);

    // The first visit's Lists: Backlog, To-Do, WIP, Done.
    const BACKLOG = 0, TODO = 1, WIP = 2, DONE = 3;
    const clickAway = async () => { await page.mouse.click(1270, 990); await sleep(50); await settle(page); };
    const sel = (list, i) => `.wrap .board .list:nth-child(${list + 1}) .card:nth-child(${i + 1})`;
    const addCard = async (list, text, label) => {
        await page.evaluate((list) => $('.wrap .board .list').eq(list).find('.add-card').click(), list);
        await sleep(100);
        await page.keyboard.type(text);
        if (label) {
            const s = '.wrap .board .card.editing';
            await page.click(s + ' .card-prio');
            await sleep(50);
            await page.click(`${s} .prio-pick button[aria-label=${label}]`);
            await sleep(50);
        }
        await clickAway();
    };
    const setPriority = async (list, i, label) => {
        await page.click(sel(list, i) + ' .text');
        await sleep(450);
        await page.click(sel(list, i) + ' [data-cm=edit]');
        await sleep(100);
        await page.click(sel(list, i) + ' .card-prio');
        await sleep(50);
        await page.click(`${sel(list, i)} .prio-pick button[aria-label=${label}]`);
        await sleep(50);
        await clickAway();
    };
    // The timer each Card in List `list` shows: its text and colours, or null.
    const timers = (list) => page.evaluate((list) => $('.wrap .board .list').eq(list).find('.card').toArray().map((c) => {
        const t = $(c).find('.wip-timer');
        if (!t.is(':visible')) return null;
        const s = getComputedStyle(t[0]);
        return { text: t.text(), bg: s.backgroundColor, border: s.borderColor };
    }), list);
    const index = (list, text) => page.evaluate((list, text) => $('.wrap .board .list').eq(list).find('.card').toArray()
        .findIndex((c) => getText($(c).find('.text')) == text), list, text);
    const timerOf = async (list, text) => {
        const i = await index(list, text);
        assert.ok(i >= 0, `"${text}" is in List ${list}`);
        return (await timers(list))[i];
    };
    const move = async (list, text, steps) => { await moveCard(page, list, await index(list, text), steps); await settle(page); };
    const secs = (t) => { const m = /^(?:(\d+)h )?(\d+)m (\d+)s$/.exec(t); assert.ok(m, 'timer format: ' + t); return (+m[1] || 0) * 3600 + +m[2] * 60 + +m[3]; };
    const rgb = (c) => c.match(/\d+/g).slice(0, 3).map(Number);
    const isRed = (t) => { const [r, g, b] = rgb(t.bg); return r > 150 && g < 100 && b < 100; };
    const accentHi = () => page.evaluate(() => {
        const probe = $('<div>').css('color', 'var(--accent-hi)').appendTo('body');
        const c = getComputedStyle(probe[0]).color; probe.remove(); return c;
    });

    try {
        // Created as Critical in Backlog: a red timer from 0. A Low Card shows none.
        await addCard(BACKLOG, 'calm', null);
        await addCard(BACKLOG, 'urgent', 'Critical');
        assert.strictEqual(await timerOf(BACKLOG, 'calm'), null, 'a Low Card has no timer');
        let t = await timerOf(BACKLOG, 'urgent');
        assert.ok(t, 'a Card created as Critical shows a timer');
        assert.match(t.text, /^0m [01]s$/, 'counting from 0: ' + t.text);
        assert.ok(isRed(t), 'in red: ' + t.bg);

        // It counts up, and it sits inside the Card on its right.
        await sleep(2100);
        assert.ok(secs((await timerOf(BACKLOG, 'urgent')).text) >= 2, 'it counts up');
        const box = await page.evaluate((s) => {
            const a = $(s)[0].getBoundingClientRect(), b = $(s).find('.wip-timer')[0].getBoundingClientRect();
            return { right: a.right - b.right, mid: b.left - (a.left + a.width / 2), top: b.top - a.top, bottom: a.bottom - b.bottom };
        }, sel(BACKLOG, await index(BACKLOG, 'urgent')));
        assert.ok(box.right >= 0 && box.right < 20 && box.mid > 0 && box.top >= 0 && box.bottom >= 0, 'on the right inside the Card ' + JSON.stringify(box));

        // Backlog to To-Do starts it over.
        await move(BACKLOG, 'urgent', 1);
        t = await timerOf(TODO, 'urgent');
        assert.match(t.text, /^0m [01]s$/, 'entering To-Do starts over: ' + t.text);
        assert.ok(isRed(t), 'still red');

        // In WIP it's the WIP timer from 0, in the accent like any WIP Card.
        await sleep(1100);
        await move(TODO, 'urgent', 1);
        await move(BACKLOG, 'calm', 2);
        t = await timerOf(WIP, 'urgent');
        const calm = await timerOf(WIP, 'calm');
        assert.match(t.text, /^0m [01]s$/, 'the WIP timer starts at 0: ' + t.text);
        assert.ok(!isRed(t), 'not red in WIP: ' + t.bg);
        assert.deepStrictEqual([t.bg, t.border], [calm.bg, calm.border], 'looks like any WIP timer');
        assert.strictEqual(t.border, await accentHi(), 'in the accent');

        // Back to To-Do: the red timer from 0 again.
        await sleep(1100);
        await move(WIP, 'urgent', -1);
        t = await timerOf(TODO, 'urgent');
        assert.match(t.text, /^0m [01]s$/, 'back in To-Do it starts over: ' + t.text);
        assert.ok(isRed(t), 'red again');

        // Done shows no timer.
        await move(TODO, 'urgent', 2);
        assert.strictEqual(await timerOf(DONE, 'urgent'), null, 'no timer in Done');
        await move(DONE, 'urgent', -2);
        assert.ok(isRed(await timerOf(TODO, 'urgent')), 'out of Done, it waits again');

        // Off Critical: gone. Critical again: from 0.
        await sleep(1100);
        await setPriority(TODO, await index(TODO, 'urgent'), 'Medium');
        assert.strictEqual(await timerOf(TODO, 'urgent'), null, 'no timer once not Critical');
        await sleep(1100);
        await setPriority(TODO, await index(TODO, 'urgent'), 'Critical');
        t = await timerOf(TODO, 'urgent');
        assert.match(t.text, /^0m [01]s$/, 'Critical again starts from 0: ' + t.text);
        assert.ok(isRed(t), 'and is red');

        // Its start is stored on the Card; reload with the clock 3h 25m on.
        const saved = await page.evaluate(() => NB.board.lists[1].notes.find((n) => n.text == 'urgent'));
        assert.ok(typeof saved.criticalSince == 'number', 'the start is saved: ' + JSON.stringify(saved));
        await page.evaluate(() => localStorage.setItem('test.skew', '1'));
        await app.reload();
        await sleep(300);
        t = await timerOf(TODO, 'urgent');
        assert.match(t.text, /^3h 25m [0-3]s$/, 'right after a reload with the clock moved on: ' + t.text);
        assert.ok(isRed(t), 'red after the reload');

        // Export, take it off Critical, import the file: the timer comes back where it was.
        const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kanban-')), 'board.nbx');
        fs.writeFileSync(file, await page.evaluate(() => decodeURIComponent(exportBoard().blob.replace(/^data:[^,]*,/, ''))));
        await setPriority(TODO, await index(TODO, 'urgent'), 'Low');
        assert.strictEqual(await timerOf(TODO, 'urgent'), null, 'Low: no timer');
        await (await page.$('.config .imp-board-select')).uploadFile(file);
        await page.waitForFunction(() => $('.wrap .board .wip-timer.critical:visible').length == 1);
        t = await timerOf(TODO, 'urgent');
        assert.match(t.text, /^3h 25m [0-5]s$/, 'kept through export and import: ' + t.text);

        assert.deepStrictEqual(app.errors, [], 'no page errors');
    } finally {
        await app.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
