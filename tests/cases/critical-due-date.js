// A Critical Card may be given a Due date: a day still to come when it starts
// to matter. The Card editor shows an optional date field while Critical is
// picked, tomorrow at the earliest. What happens to the date (which typed
// days take, whether it waits in Backlog, what its day beginning, a move by
// hand or the Auto-submit does to it) is the Due date module's, in
// due-date-rules.js; here, its callers apply it: saved with a date, the Card
// waits in Backlog with a red "Next: <date>" and no Critical timer. When its
// day begins the minute tick moves it on to To-Do, its Critical timer
// counting from that midnight. Moved out of Backlog early by hand, its timer
// starts from the move. It's never Late.
// Cards are saved as `notes`, Nullboard's name, so old boards, History days and export files load without a migration.
const assert = require('assert');
const { openApp, settle, moveCard, sleep, fakeClock, setClock, wake, seedBoard, clickAway: clickAwayOn, pickPriority, editCard } = require('../lib');

(async () => {
    // The page's clock reads Wednesday 2028-02-23, 10:00 local time.
    const app = await openApp(fakeClock('2028-02-23 10:00'), { demo: false });
    const { page } = app;
    await page.setViewport({ width: 1280, height: 1000 });
    await sleep(300);

    // The first visit's Lists: Backlog, To-Do, WIP, Done.
    const BACKLOG = 0, TODO = 1, WIP = 2;
    const EDITING = '.wrap .board .card.editing';
    const clickAway = () => clickAwayOn(page);
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
    // What the Card shows in its timer slot, if anything, and whether it's red.
    const slot = async (text) => page.evaluate((sel) => {
        const t = $(sel).find('.wip-timer');
        if (! t.is(':visible')) return null;
        const red = /^rgba?\((\d+), (\d+), (\d+)/.exec(getComputedStyle(t[0]).borderColor);
        return { text: t.text(), red: !! red && +red[1] > 200 && +red[2] < 120 && +red[3] < 120 };
    }, await cardSel(text));
    const dueShown = () => page.evaluate((s) => $(s).find('.card-due').is(':visible'), EDITING);
    const dueMin = () => page.evaluate((s) => $(s).find('.card-due input[type=date]').attr('min'), EDITING);

    const pick = (priority) => pickPriority(page, EDITING, priority);
    const edit = async (text) => editCard(page, await cardSel(text));
    const addCard = async (list, text) => {
        await page.evaluate((list) => $('.wrap .board .list').eq(list).find('.add-card').click(), list);
        await sleep(100);
        await page.keyboard.type(text);
    };
    // Sets the date field, as the browser's date picker does.
    const setDue = async (day) => {
        await page.click(EDITING + ' .card-due input[type=date]');
        await page.$eval(EDITING + ' .card-due input[type=date]', (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, day);
        await sleep(50);
        assert.ok(await page.evaluate((s) => $(s).length == 1, EDITING), 'picking a date keeps the Card editor open');
    };

    try {
        // The date field shows only while Critical is picked; tomorrow is the earliest day.
        await addCard(TODO, 'renew passport');
        assert.strictEqual(await dueShown(), false, 'a Low Card has no date field');
        for (const p of ['Recurring', 'Medium', 'Low']) {
            await pick(p);
            assert.strictEqual(await dueShown(), false, p + ' has no date field');
        }
        await pick('Critical');
        assert.strictEqual(await dueShown(), true, 'picking Critical shows the date field');
        assert.strictEqual(await dueMin(), '2028-02-24', 'tomorrow is the earliest pickable day');
        assert.strictEqual(await page.evaluate((s) => $(s).find('.card-due input[type=date]').val(), EDITING), '', 'empty to begin with');

        // Left empty: an ordinary Critical Card, with its timer.
        await clickAway();
        let s = await slot('renew passport');
        assert.ok(s && /^\d+m \d+s$/.test(s.text) && s.red, 'and a red Critical timer: ' + JSON.stringify(s));

        // Saved with a date from To-Do: it waits in Backlog, red "Next:", no timer.
        await edit('renew passport');
        assert.strictEqual(await dueShown(), true, 'a Critical Card shows its date field in the Card editor');
        await setDue('2028-03-02');
        await clickAway();
        assert.strictEqual(await where('renew passport'), BACKLOG, 'with a date, it goes to Backlog');
        let n = await saved('renew passport');
        assert.deepStrictEqual([n.priority, n.due], ['critical', '2028-03-02'], 'saved Critical with its Due date');
        s = await slot('renew passport');
        assert.ok(s && /^Next: (Mar 2|2 Mar)$/.test(s.text), 'it shows "Next: <date>": ' + JSON.stringify(s));
        assert.ok(s.red, 'in red');

        // A new Card from WIP, picked Critical with a date tomorrow.
        await addCard(WIP, 'book dentist');
        await pick('Critical');
        await setDue('2028-02-24');
        await clickAway();

        // A Card in Done keeps its XP.
        await addCard(WIP, 'call bank');
        await clickAway();
        await moveCard(page, WIP, await index(WIP, 'call bank'), 1);
        await settle(page);
        const xp = (await saved('call bank')).xp;
        await edit('call bank');
        await pick('Critical');
        await setDue('2028-02-25');
        await clickAway();
        n = await saved('call bank');
        assert.deepStrictEqual([n.priority, n.due, n.xp], ['critical', '2028-02-25', xp], 'with its date and XP');

        // Its day begins: at 9:00 on Feb 24 it's in To-Do, its Critical timer
        // counting from midnight.
        await setClock(page, '2028-02-24 09:00');
        await wake(page);
        assert.strictEqual(await where('book dentist'), TODO, 'on its Due date it moves on to To-Do');
        s = await slot('book dentist');
        assert.ok(s && /^9h 0m \d+s$/.test(s.text) && s.red, 'so at 9:00 it reads 9h: ' + JSON.stringify(s));

        await setClock(page, '2028-02-25 09:00');
        await wake(page);

        // Changing the date: its tag follows, and it survives a reload.
        await edit('renew passport');
        assert.strictEqual(await page.evaluate((s) => $(s).find('.wip-timer').is(':visible'), EDITING), false, 'its tag hides in the Card editor');
        assert.strictEqual(await page.evaluate((s) => $(s).find('.card-due input[type=date]').val(), EDITING), '2028-03-02', 'the date field holds its Due date');
        assert.strictEqual(await dueMin(), '2028-02-26', 'tomorrow, as the clock now reads');
        await setDue('2028-03-05');
        await clickAway();
        await app.reload();
        await sleep(500);
        s = await slot('renew passport');
        assert.ok(s && /^Next: (Mar 5|5 Mar)$/.test(s.text) && s.red, 'after a reload it still shows its red "Next:": ' + JSON.stringify(s));
        assert.strictEqual((await saved('renew passport')).due, '2028-03-05', 'and keeps its Due date');

        // Clearing the date: an ordinary Critical Card.
        await edit('renew passport');
        await setDue('');
        await clickAway();
        assert.ok(!('due' in await saved('renew passport')), 'the Due date is gone');

        // Moved out of Backlog early by hand: its timer starts from the move.
        await addCard(TODO, 'pick up keys');
        await pick('Critical');
        await setDue('2028-03-10');
        await clickAway();
        assert.strictEqual(await where('pick up keys'), BACKLOG);
        await setClock(page, '2028-02-25 11:00');
        await moveCard(page, BACKLOG, await index(BACKLOG, 'pick up keys'), 1);
        await settle(page);
        assert.strictEqual(await where('pick up keys'), TODO, 'moved to To-Do by hand');
        s = await slot('pick up keys');
        assert.ok(s && /^0m \d+s$/.test(s.text) && s.red, 'its Critical timer counts from the move: ' + JSON.stringify(s));

        // Another Priority hides the date field.
        await edit('pick up keys');
        await pick('Medium');
        assert.strictEqual(await dueShown(), false, 'Medium hides the date field');
        await clickAway();

        // A date picked for tomorrow, the Card editor left open past midnight:
        // saved the next morning, the Card acts as if saved the day before and
        // moved on when its day began, its Critical timer from that midnight.
        await addCard(TODO, 'feed cat');
        await pick('Medium');
        await clickAway();
        await edit('feed cat');
        await pick('Critical');
        await setDue('2028-02-26');
        await setClock(page, '2028-02-26 09:00');
        await wake(page);
        await clickAway();
        n = await saved('feed cat');
        assert.strictEqual(await where('feed cat'), TODO, 'it ends up in To-Do');
        assert.deepStrictEqual([n.due, n.criticalSince], [undefined, new Date(2028, 1, 26).getTime()],
            'with no Due date, its Critical timer from midnight');

        assert.deepStrictEqual(app.errors, [], 'no page errors');
    } finally {
        await app.close();
    }

    // A board saved before Critical Cards had Due dates loads unchanged: its
    // Critical Card in Backlog keeps waiting with its timer, its Recurring one
    // keeps its "Next:".
    const since = new Date(2028, 1, 23, 8).getTime();
    const LISTS = [
        { title: 'Backlog', notes: [
            { text: 'old recurring', priority: 'recurring', arrival: 1, schedule: { every: 1, start: '2028-02-01', unit: 'weeks' }, due: '2028-02-29' },
            { text: 'old critical', priority: 'critical', arrival: 2, criticalSince: since },
        ] },
        { title: 'To-Do', notes: [] }, { title: 'WIP', notes: [] }, { title: 'Done', notes: [] },
    ];
    const old = await openApp([fakeClock('2028-02-23 10:00'), seedBoard({ id: 78, title: 'Saved earlier', day: '2028-02-23', lists: LISTS })], { demo: false });
    try {
        await sleep(300);
        const notes = await old.page.evaluate(() => NB.board.lists.map((l) => l.notes));
        assert.deepStrictEqual(notes, LISTS.map((l) => l.notes), 'its Cards load as they were saved');
        const tags = await old.page.evaluate(() => $('.wrap .board .card .wip-timer').map((_, t) => $(t).text()).get());
        assert.match(tags[0], /^Next: (Feb 29|29 Feb)$/, 'the Recurring Card still shows "Next:"');
        assert.match(tags[1], /^2h 0m \d+s$/, 'the Critical Card still counts from when it began waiting');
        assert.deepStrictEqual(old.errors, [], 'no page errors');
    } finally {
        await old.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
