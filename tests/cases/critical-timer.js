// A Critical Card shows a red Critical timer for how long it has waited to
// reach WIP. When it starts, starts over and ends (in WIP, in Done, off
// Critical) is the Due date module's, in due-date-rules.js; here, its callers
// apply it: saved Critical, the Card shows the timer, counting up inside it on
// the right; a move by hand starts it over; in WIP it gives way to the WIP
// timer, in the day's accent. It counts from a stored start, so it's right
// after a reload with the clock moved on, or an import.
// Cards are saved as `notes`, Nullboard's name, so old boards, History days and export files load without a migration.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openApp, moveCard, settle, sleep, fakeClock, setClock, clickAway: clickAwayOn, pickPriority, setPriority: setPriorityOn } = require('../lib');

const SKEW = (3 * 3600 + 25 * 60) * 1000; // 3h 25m

(async () => {
    // The real time, until the test moves the clock on.
    const app = await openApp(fakeClock(), { demo: false });
    const { page } = app;
    await page.setViewport({ width: 1280, height: 1000 });
    await sleep(300);

    // The first visit's Lists: Backlog, To-Do, WIP, Done.
    const BACKLOG = 0, TODO = 1, WIP = 2;
    const clickAway = () => clickAwayOn(page);
    const sel = (list, i) => `.wrap .board .list:nth-child(${list + 1}) .card:nth-child(${i + 1})`;
    const addCard = async (list, text, priority) => {
        await page.evaluate((list) => $('.wrap .board .list').eq(list).find('.add-card').click(), list);
        await sleep(100);
        await page.keyboard.type(text);
        if (priority) await pickPriority(page, '.wrap .board .card.editing', priority);
        await clickAway();
    };
    const setPriority = (list, i, priority) => setPriorityOn(page, sel(list, i), priority);
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
        await addCard(BACKLOG, 'fix the gate', 'Critical');
        assert.strictEqual(await timerOf(BACKLOG, 'calm'), null, 'a Low Card has no timer');
        let t = await timerOf(BACKLOG, 'fix the gate');
        assert.ok(t, 'a Card created as Critical shows a timer');
        assert.match(t.text, /^0m [0-2]s$/, 'counting from 0: ' + t.text);
        assert.ok(isRed(t), 'in red: ' + t.bg);

        // It counts up, and it sits inside the Card on its right.
        await sleep(3100);
        assert.ok(secs((await timerOf(BACKLOG, 'fix the gate')).text) >= 3, 'it counts up');
        const box = await page.evaluate((s) => {
            const a = $(s)[0].getBoundingClientRect(), b = $(s).find('.wip-timer')[0].getBoundingClientRect();
            return { right: a.right - b.right, mid: b.left - (a.left + a.width / 2), top: b.top - a.top, bottom: a.bottom - b.bottom };
        }, sel(BACKLOG, await index(BACKLOG, 'fix the gate')));
        assert.ok(box.right >= 0 && box.right < 20 && box.mid > 0 && box.top >= 0 && box.bottom >= 0, 'on the right inside the Card ' + JSON.stringify(box));

        // Backlog to To-Do starts it over.
        await move(BACKLOG, 'fix the gate', 1);
        t = await timerOf(TODO, 'fix the gate');
        assert.match(t.text, /^0m [0-2]s$/, 'entering To-Do starts over: ' + t.text);
        assert.ok(isRed(t), 'still red');

        // In WIP it's the WIP timer from 0, in the accent; back in To-Do, red from 0.
        await sleep(1100);
        await move(TODO, 'fix the gate', 1);
        t = await timerOf(WIP, 'fix the gate');
        assert.match(t.text, /^0m [0-1]s$/, 'the WIP timer starts at 0: ' + t.text);
        assert.ok(!isRed(t), 'not red in WIP: ' + t.bg);
        assert.strictEqual(t.border, await accentHi(), 'in the accent');
        await move(WIP, 'fix the gate', -1);
        assert.ok(isRed(await timerOf(TODO, 'fix the gate')), 'red again back in To-Do');

        // Its start is stored on the Card; reload with the clock 3h 25m on.
        const saved = await page.evaluate(() => NB.board.lists[1].notes.find((n) => n.text == 'fix the gate'));
        assert.ok(typeof saved.criticalSince == 'number', 'the start is saved: ' + JSON.stringify(saved));
        await setClock(page, await page.evaluate(() => Date.now()) + SKEW);
        await app.reload();
        await sleep(300);
        t = await timerOf(TODO, 'fix the gate');
        assert.match(t.text, /^3h 25m [0-3]s$/, 'right after a reload with the clock moved on: ' + t.text);
        assert.ok(isRed(t), 'red after the reload');

        // Export, take it off Critical, import the file: the timer comes back where it was.
        const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kanban-')), 'board.nbx');
        fs.writeFileSync(file, await page.evaluate(() => decodeURIComponent(exportBoard().blob.replace(/^data:[^,]*,/, ''))));
        await setPriority(TODO, await index(TODO, 'fix the gate'), 'Low');
        assert.strictEqual(await timerOf(TODO, 'fix the gate'), null, 'Low: no timer');
        await (await page.$('.config .imp-board-select')).uploadFile(file);
        await page.waitForFunction(() => $('.wrap .board .wip-timer.critical:visible').length == 1);
        t = await timerOf(TODO, 'fix the gate');
        assert.match(t.text, /^3h 25m [0-5]s$/, 'kept through export and import: ' + t.text);

        assert.deepStrictEqual(app.errors, [], 'no page errors');
    } finally {
        await app.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
