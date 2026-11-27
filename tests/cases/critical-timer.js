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
const { openApp, moveCard, settle, sleep, fakeClock, setClock, advanceClock, clickAway: clickAwayOn, pickPriority, setPriority: setPriorityOn } = require('../lib');

const SKEW = (3 * 3600 + 25 * 60) * 1000; // 3h 25m

(async () => {
    const app = await openApp(fakeClock('2028-11-15 10:00'), { demo: false });
    const { page } = app;
    await page.setViewport({ width: 1280, height: 1000 });
    await setClock(page, '2028-11-15 10:00', { freeze: true }); // stands still until the case moves it

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
    // Waits for the 250 ms tick to show `want` on that Card's timer.
    const timerIs = (list, text, want) => page.waitForFunction((list, text, want) => {
        const c = $('.wrap .board .list').eq(list).find('.card').toArray().find((c) => getText($(c).find('.text')) == text);
        return c && $(c).find('.wip-timer:visible').text() == want;
    }, {}, list, text, want);
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
        await timerIs(BACKLOG, 'fix the gate', '0m 0s'); // counting from 0
        let t = await timerOf(BACKLOG, 'fix the gate');
        assert.ok(isRed(t), 'in red: ' + t.bg);

        // It counts up, and it sits inside the Card on its right.
        await advanceClock(page, 3000);
        await timerIs(BACKLOG, 'fix the gate', '0m 3s');
        const box = await page.evaluate((s) => {
            const a = $(s)[0].getBoundingClientRect(), b = $(s).find('.wip-timer')[0].getBoundingClientRect();
            return { right: a.right - b.right, mid: b.left - (a.left + a.width / 2), top: b.top - a.top, bottom: a.bottom - b.bottom };
        }, sel(BACKLOG, await index(BACKLOG, 'fix the gate')));
        assert.ok(box.right >= 0 && box.right < 20 && box.mid > 0 && box.top >= 0 && box.bottom >= 0, 'on the right inside the Card ' + JSON.stringify(box));

        // Backlog to To-Do starts it over.
        await move(BACKLOG, 'fix the gate', 1);
        await timerIs(TODO, 'fix the gate', '0m 0s'); // entering To-Do starts over
        assert.ok(isRed(await timerOf(TODO, 'fix the gate')), 'still red');

        // In WIP it's the WIP timer from 0, in the accent; back in To-Do, red from 0.
        await advanceClock(page, 1000);
        await timerIs(TODO, 'fix the gate', '0m 1s');
        await move(TODO, 'fix the gate', 1);
        await timerIs(WIP, 'fix the gate', '0m 0s'); // the WIP timer starts at 0
        t = await timerOf(WIP, 'fix the gate');
        assert.ok(!isRed(t), 'not red in WIP: ' + t.bg);
        assert.strictEqual(t.border, await accentHi(), 'in the accent');
        await move(WIP, 'fix the gate', -1);
        assert.ok(isRed(await timerOf(TODO, 'fix the gate')), 'red again back in To-Do');

        // Its start is stored on the Card; reload with the clock 3h 25m on.
        const saved = await page.evaluate(() => NB.board.lists[1].notes.find((n) => n.text == 'fix the gate'));
        assert.ok(typeof saved.criticalSince == 'number', 'the start is saved: ' + JSON.stringify(saved));
        await advanceClock(page, SKEW);
        await app.reload();
        await timerIs(TODO, 'fix the gate', '3h 25m 0s'); // right after a reload with the clock moved on
        assert.ok(isRed(await timerOf(TODO, 'fix the gate')), 'red after the reload');

        // Export, take it off Critical, import the file: the timer comes back where it was.
        const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kanban-')), 'board.nbx');
        fs.writeFileSync(file, await page.evaluate(() => decodeURIComponent(exportBoard().blob.replace(/^data:[^,]*,/, ''))));
        await setPriority(TODO, await index(TODO, 'fix the gate'), 'Low');
        assert.strictEqual(await timerOf(TODO, 'fix the gate'), null, 'Low: no timer');
        await (await page.$('.config .imp-board-select')).uploadFile(file);
        await page.waitForFunction(() => $('.wrap .board .wip-timer.critical:visible').length == 1);
        await timerIs(TODO, 'fix the gate', '3h 25m 0s'); // kept through export and import

        assert.deepStrictEqual(app.errors, [], 'no page errors');
    } finally {
        await app.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
