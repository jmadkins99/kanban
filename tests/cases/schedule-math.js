// A Recurring Card's Schedule follows the calendar: every N days, weeks or
// months from its start date, each occurrence counted from the start rather
// than from the one before. Weeks keep the start's weekday; months keep its
// day of the month, clamped to shorter months and back in longer ones.
// The math is called inside the loaded page, with the clock faked before load.
const assert = require('assert');
const { openApp, sleep, fakeClock } = require('../lib');

(async () => {
    // The page's clock reads Wednesday 2028-02-23, 10:00 local time.
    const app = await openApp(fakeClock('2028-02-23 10:00'), { demo: false });
    const { page } = app;
    await sleep(200);

    const s = (every, unit, start) => ({ every, start, unit });
    // The first Schedule date on or after `day`, and strictly after it.
    const onOrAfter = (sched, day) => page.evaluate((sched, day) => Schedule.onOrAfter(sched, day), sched, day);
    const after = (sched, day) => page.evaluate((sched, day) => Schedule.after(sched, day), sched, day);
    const firstDue = (sched) => page.evaluate((sched) => Schedule.firstDue(sched), sched);

    try {
        // Today, by the faked clock.
        assert.strictEqual(await page.evaluate(() => Schedule.today()), '2028-02-23', 'today is the faked day');

        // Days: start + k·N.
        assert.strictEqual(await onOrAfter(s(1, 'days', '2028-02-01'), '2028-02-23'), '2028-02-23', 'daily lands on the day');
        assert.strictEqual(await onOrAfter(s(3, 'days', '2028-02-01'), '2028-02-23'), '2028-02-25', 'every 3 days from Feb 1: Feb 25');
        assert.strictEqual(await onOrAfter(s(3, 'days', '2028-02-01'), '2028-02-22'), '2028-02-22', 'every 3 days from Feb 1 includes Feb 22');
        assert.strictEqual(await onOrAfter(s(10, 'days', '2028-02-25'), '2028-03-01'), '2028-03-06', 'across a leap day: Feb 25 + 10 = Mar 6');
        assert.strictEqual(await onOrAfter(s(10, 'days', '2027-02-25'), '2027-03-01'), '2027-03-07', 'no leap day: Feb 25 + 10 = Mar 7');
        assert.strictEqual(await onOrAfter(s(5, 'days', '2028-03-10'), '2028-02-23'), '2028-03-10', 'before the start, the start');
        assert.strictEqual(await onOrAfter(s(2, 'days', '2027-12-30'), '2028-01-01'), '2028-01-01', 'across a new year');

        // Weeks: on the start's weekday, every N weeks.
        assert.strictEqual(await onOrAfter(s(1, 'weeks', '2028-02-07'), '2028-02-23'), '2028-02-28', 'weekly from a Monday: next Monday');
        assert.strictEqual(await onOrAfter(s(2, 'weeks', '2028-02-07'), '2028-02-23'), '2028-03-06', 'fortnightly from Feb 7: Mar 6');
        assert.strictEqual(await onOrAfter(s(1, 'weeks', '2028-02-02'), '2028-02-23'), '2028-02-23', 'weekly from a Wednesday: today');
        assert.strictEqual(await onOrAfter(s(1, 'weeks', '2028-03-05'), '2028-04-03'), '2028-04-09', 'across the clocks going forward, still a Sunday');

        // Months: the start's day of the month, clamped to shorter months.
        assert.strictEqual(await onOrAfter(s(1, 'months', '2028-01-15'), '2028-02-23'), '2028-03-15', 'monthly from the 15th');
        assert.strictEqual(await onOrAfter(s(1, 'months', '2028-01-31'), '2028-02-01'), '2028-02-29', 'Jan 31 gives Feb 29 in a leap year');
        assert.strictEqual(await onOrAfter(s(1, 'months', '2027-01-31'), '2027-02-01'), '2027-02-28', 'Jan 31 gives Feb 28 otherwise');
        assert.strictEqual(await onOrAfter(s(1, 'months', '2028-01-31'), '2028-03-01'), '2028-03-31', 'then back to Mar 31');
        assert.strictEqual(await onOrAfter(s(1, 'months', '2028-01-31'), '2028-04-01'), '2028-04-30', 'Apr 30');
        assert.strictEqual(await onOrAfter(s(1, 'months', '2028-01-30'), '2028-02-01'), '2028-02-29', 'the 30th clamps to Feb 29');
        assert.strictEqual(await onOrAfter(s(1, 'months', '2027-01-29'), '2027-02-01'), '2027-02-28', 'the 29th clamps to Feb 28');
        assert.strictEqual(await onOrAfter(s(1, 'months', '2028-01-29'), '2028-02-01'), '2028-02-29', 'the 29th is itself in a leap year');
        assert.strictEqual(await onOrAfter(s(1, 'months', '2027-01-29'), '2027-03-01'), '2027-03-29', 'and back to the 29th in March');
        assert.strictEqual(await onOrAfter(s(2, 'months', '2027-12-31'), '2028-01-01'), '2028-02-29', 'every 2 months from Dec 31: Feb 29');
        assert.strictEqual(await onOrAfter(s(2, 'months', '2027-12-31'), '2028-03-01'), '2028-04-30', 'then Apr 30');
        assert.strictEqual(await onOrAfter(s(3, 'months', '2027-11-30'), '2028-02-23'), '2028-02-29', 'quarterly from Nov 30');
        assert.strictEqual(await onOrAfter(s(12, 'months', '2028-02-29'), '2029-01-01'), '2029-02-28', 'yearly from a leap day: Feb 28');
        assert.strictEqual(await onOrAfter(s(12, 'months', '2028-02-29'), '2031-03-01'), '2032-02-29', 'and Feb 29 in the next leap year');
        assert.strictEqual(await onOrAfter(s(1, 'months', '2028-01-15'), '2028-03-15'), '2028-03-15', 'on the day itself');

        // Strictly after a day (for finishing a Card).
        assert.strictEqual(await after(s(1, 'months', '2028-01-15'), '2028-03-15'), '2028-04-15', 'strictly after the day');
        assert.strictEqual(await after(s(1, 'days', '2028-02-28'), '2028-02-28'), '2028-02-29', 'the next day');
        assert.strictEqual(await after(s(1, 'weeks', '2028-02-02'), '2028-02-23'), '2028-03-01', 'a week on');

        // The first Due date for a Card saved today.
        assert.strictEqual(await firstDue(s(1, 'weeks', '2028-02-02')), '2028-02-23', 'due today');
        assert.strictEqual(await firstDue(s(1, 'months', '2028-01-31')), '2028-02-29', 'due at the end of the month');
        assert.strictEqual(await firstDue(s(1, 'days', '2028-03-01')), '2028-03-01', 'a start in the future is the first');

        assert.deepStrictEqual(app.errors, [], 'no page errors');
    } finally {
        await app.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
