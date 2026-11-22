// A Recurring Card has a Schedule and a Due date. Picking Recurring in edit
// mode shows "Every [N] [days / weeks / months] starting [date]"; other
// Priorities hide it. Saving a Card as Recurring sets its Due date to the
// first Schedule date on or after today: due today, it stays where it is;
// due later, it moves to Backlog (found by name, or the first List) and shows
// "Next: <date>". Editing the Schedule later only changes the Due date, and
// another Priority drops both, leaving the Card where it is. Both are stored
// on the Card, so they survive export/import and History.
// Cards are saved as `notes`, Nullboard's name, so old boards, History days and export files load without a migration.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openApp, settle } = require('../lib');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
    // The page's clock reads Wednesday 2028-02-23, 10:00 local time.
    const app = await openApp(`{
        const Real = Date, skew = new Real(2028, 1, 23, 10, 0, 0).getTime() - Real.now();
        window.Date = class extends Real {
            constructor(...a) { super(...(a.length ? a : [Real.now() + skew])); }
            static now() { return Real.now() + skew; }
        };
        window.RealDate = Real;
    }`, { demo: false });
    const { page } = app;
    await page.setViewport({ width: 1280, height: 1000 });
    await sleep(300);

    // The first visit's Lists: Backlog, To-Do, WIP, Done.
    const BACKLOG = 0, TODO = 1, WIP = 2;
    const EDITING = '.wrap .board .card.editing';
    const clickAway = async () => { await page.mouse.click(1270, 990); await sleep(50); await settle(page); };
    const lists = () => page.evaluate(() => $('.wrap .board .list').map((_, l) => getText($(l).find('.head .text'))).get());
    const index = (list, text) => page.evaluate((list, text) => $('.wrap .board .list').eq(list).find('.card').toArray()
        .findIndex((c) => getText($(c).find('.text')) == text), list, text);
    // Which List (by position) holds the Card with this text, or -1.
    const where = (text) => page.evaluate((text) => $('.wrap .board .list').toArray()
        .findIndex((l) => $(l).find('.card').toArray().some((c) => getText($(c).find('.text')) == text)), text);
    const cardSel = async (text) => {
        const list = await where(text);
        assert.ok(list >= 0, `"${text}" is on the board`);
        return `.wrap .board .list:nth-child(${list + 1}) .card:nth-child(${(await index(list, text)) + 1})`;
    };
    const saved = (text) => page.evaluate((text) => {
        for (const l of NB.board.lists) for (const n of l.notes) if (n.text == text) return n;
        return null;
    }, text);
    // What the Card shows in its timer slot, if anything.
    const slot = async (text) => page.evaluate((sel) => {
        const t = $(sel).find('.wip-timer');
        return t.is(':visible') ? t.text() : null;
    }, await cardSel(text));
    const scheduleShown = () => page.evaluate((s) => $(s).find('.card-schedule').is(':visible'), EDITING);

    const pick = async (label) => {
        await page.click(EDITING + ' .card-prio');
        await sleep(50);
        await page.click(`${EDITING} .prio-pick button[aria-label=${label}]`);
        await sleep(50);
    };
    const edit = async (text) => {
        const sel = await cardSel(text);
        await page.click(sel + ' .text');
        await sleep(450);
        await page.click(sel + ' [data-cm=edit]');
        await sleep(100);
    };
    const addCard = async (list, text) => {
        await page.evaluate((list) => $('.wrap .board .list').eq(list).find('.add-card').click(), list);
        await sleep(100);
        await page.keyboard.type(text);
    };
    // Fills in the Schedule line with the real inputs, each focused in turn.
    const setSchedule = async (every, unit, start) => {
        await page.click(EDITING + ' .sched-every');
        await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control');
        await page.keyboard.type(String(every));
        assert.ok(await page.evaluate((s) => $(s).length == 1, EDITING), 'typing in the Schedule keeps edit mode');
        await page.select(EDITING + ' .sched-unit', unit);
        await page.click(EDITING + ' .sched-start');
        await page.$eval(EDITING + ' .sched-start', (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, start);
        await sleep(50);
        assert.ok(await page.evaluate((s) => $(s).length == 1, EDITING), 'picking a start date keeps edit mode');
    };
    const NEXT = (re) => new RegExp('^Next: ' + re + '$');

    try {
        // Picking Recurring shows the Schedule line; other Priorities hide it.
        await addCard(TODO, 'water plants');
        assert.strictEqual(await scheduleShown(), false, 'a Low Card has no Schedule line');
        await pick('Recurring');
        assert.strictEqual(await scheduleShown(), true, 'picking Recurring shows the Schedule line');
        const line = await page.evaluate((s) => {
            const $l = $(s).find('.card-schedule');
            return { text: $l.text().replace(/\s+/g, ' ').trim(), units: $l.find('.sched-unit option').map((_, o) => o.value).get() };
        }, EDITING);
        assert.match(line.text, /^Every .*starting/, 'it reads "Every … starting …": ' + line.text);
        assert.deepStrictEqual(line.units, ['days', 'weeks', 'months'], 'one unit: days, weeks or months');
        await pick('Medium');
        assert.strictEqual(await scheduleShown(), false, 'another Priority hides it');
        await pick('Recurring');
        assert.strictEqual(await scheduleShown(), true, 'and Recurring shows it again');

        // Clicking the line's words doesn't end editing either.
        const words = await page.evaluate((s) => { const r = $(s).find('.card-schedule')[0].getBoundingClientRect(); return { x: r.left + 3, y: r.top + r.height / 2 }; }, EDITING);
        await page.mouse.click(words.x, words.y);
        await sleep(50);
        assert.ok(await page.evaluate((s) => $(s).length == 1, EDITING), 'clicking the Schedule line keeps edit mode');

        // Weekly from a Wednesday, which today is: due today, it stays in To-Do.
        await setSchedule(1, 'weeks', '2028-02-02');
        await clickAway();
        assert.strictEqual(await where('water plants'), TODO, 'due today, it stays where it is');
        let n = await saved('water plants');
        assert.strictEqual(n.priority, 'recurring');
        assert.deepStrictEqual(n.schedule, { every: 1, start: '2028-02-02', unit: 'weeks' }, 'the Schedule is saved');
        assert.deepStrictEqual(Object.keys(n.schedule), ['every', 'start', 'unit'], 'with its keys in order');
        assert.strictEqual(n.due, '2028-02-23', 'due today');
        assert.strictEqual(await slot('water plants'), null, 'no "Next:" outside Backlog');

        // A new Card due later moves to Backlog and shows "Next:".
        await addCard(WIP, 'pay rent');
        await pick('Recurring');
        await setSchedule(1, 'months', '2028-03-01');
        await clickAway();
        assert.strictEqual(await where('pay rent'), BACKLOG, 'due later, it moves to Backlog');
        assert.strictEqual((await saved('pay rent')).due, '2028-03-01');
        assert.match(await slot('pay rent'), NEXT('(Mar 1|1 Mar)'), 'it shows "Next: <date>"');

        // Editing the Schedule only changes the Due date and "Next:".
        await edit('pay rent');
        assert.strictEqual(await scheduleShown(), true, 'a Recurring Card shows its Schedule line in edit mode');
        assert.deepStrictEqual(await page.evaluate((s) => [$(s).find('.sched-every').val(), $(s).find('.sched-unit').val(), $(s).find('.sched-start').val()], EDITING),
            ['1', 'months', '2028-03-01'], 'filled with its Schedule');
        await setSchedule(2, 'weeks', '2028-02-27');
        await clickAway();
        assert.strictEqual(await where('pay rent'), BACKLOG, 'still in Backlog');
        assert.strictEqual((await saved('pay rent')).due, '2028-02-27');
        assert.match(await slot('pay rent'), NEXT('(Feb 27|27 Feb)'), '"Next:" follows the new Schedule');

        await edit('water plants');
        await setSchedule(3, 'days', '2028-03-04');
        await clickAway();
        assert.strictEqual(await where('water plants'), TODO, 'an edited Schedule due later doesn\'t move the Card');
        assert.strictEqual((await saved('water plants')).due, '2028-03-04');

        // An existing Card changed to Recurring and due later moves to Backlog.
        await addCard(TODO, 'review week');
        await clickAway();
        await edit('review week');
        assert.strictEqual(await scheduleShown(), false, 'a Low Card in edit mode has no Schedule line');
        await pick('Recurring');
        await setSchedule(1, 'weeks', '2028-02-25');
        await clickAway();
        assert.strictEqual(await where('review week'), BACKLOG, 'changed to Recurring and due later, it moves to Backlog');
        assert.strictEqual((await saved('review week')).due, '2028-02-25');

        // History keeps the Schedule and Due date: back-date the board, reload, and it's filed.
        await page.evaluate(() => { NB.board.day = '2028-02-22'; NB.storage.saveBoard(NB.board); });
        await app.reload();
        await sleep(500);
        const filed = await page.evaluate(() => {
            const e = NB.storage.getJson('history').find((e) => e.day == '2028-02-22');
            for (const l of e.lists) for (const n of l.notes) if (n.text == 'pay rent') return n;
        });
        assert.deepStrictEqual([filed.schedule, filed.due], [{ every: 2, start: '2028-02-27', unit: 'weeks' }, '2028-02-27'], 'History keeps them');
        assert.match(await slot('pay rent'), NEXT('(Feb 27|27 Feb)'), 'and "Next:" is back after a reload');

        // Another Priority drops the Schedule and Due date and leaves the Card where it is.
        const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kanban-')), 'board.nbx');
        fs.writeFileSync(file, await page.evaluate(() => decodeURIComponent(exportBoard().blob.replace(/^data:[^,]*,/, ''))));
        await edit('pay rent');
        await pick('Critical');
        assert.strictEqual(await scheduleShown(), false, 'Critical hides the Schedule line');
        await clickAway();
        assert.strictEqual(await where('pay rent'), BACKLOG, 'it stays where it is');
        n = await saved('pay rent');
        assert.strictEqual(n.priority, 'critical');
        assert.ok(!('schedule' in n) && !('due' in n), 'no Schedule or Due date left: ' + JSON.stringify(n));
        assert.doesNotMatch(await slot('pay rent') || '', /Next/, 'no "Next:"');

        // Import the export: they come back.
        await (await page.$('.config .imp-board-select')).uploadFile(file);
        await page.waitForFunction(() => /Next/.test($('.wrap .board .wip-timer:visible').text()));
        n = await saved('pay rent');
        assert.deepStrictEqual([n.priority, n.schedule, n.due], ['recurring', { every: 2, start: '2028-02-27', unit: 'weeks' }, '2028-02-27'], 'kept through export and import');

        // Backlog is found by name, ignoring case, wherever it is.
        await page.evaluate(() => { const $l = $('.wrap .board .list').eq(0); setText($l.find('.head .text'), '  BackLOG '); saveBoard(); });
        await page.evaluate(() => $('.wrap .board .list').eq(0).find('.mov-list-r.full, .mov-list-r').first().click());
        await sleep(600);
        await settle(page);
        assert.deepStrictEqual((await lists()).map((t) => t.trim()), ['To-Do', 'BackLOG', 'WIP', 'Done']);
        await addCard(2, 'file taxes');
        await pick('Recurring');
        await setSchedule(12, 'months', '2028-04-15');
        await clickAway();
        assert.strictEqual(await where('file taxes'), 1, 'Backlog found by name, ignoring case');

        // With no Backlog, the Card goes to the first List.
        await page.evaluate(() => { const $l = $('.wrap .board .list').eq(1); setText($l.find('.head .text'), 'Someday'); saveBoard(); });
        await addCard(2, 'clean gutters');
        await pick('Recurring');
        await setSchedule(6, 'months', '2028-05-01');
        await clickAway();
        assert.strictEqual(await where('clean gutters'), 0, 'no Backlog: the first List');
        assert.match(await slot('clean gutters'), NEXT('(May 1|1 May)'), 'and it shows "Next:" there');

        assert.deepStrictEqual(app.errors, [], 'no page errors');
    } finally {
        await app.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
