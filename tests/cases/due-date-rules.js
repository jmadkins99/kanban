// The Due date module (js/due.js) decides every Due-date transition from a
// Card's saved fields, where it is and the moment; callers apply what it
// decides. Each row is one call, `verb, card, where, moment → expected`, run
// inside the loaded page with the day passed in, so no clock is faked.
// A Decision is the whole state: every key present, null deleting the field,
// and an unchanged value the very one passed in.
const assert = require('assert');
const { openApp, sleep } = require('../lib');

// Wednesday 2028-02-23, 10:00 local time (`now` is worked out in the page).
const TODAY = '2028-02-23';
const AT_10 = { today: TODAY, hour: 10 };
const AT_0 = { today: TODAY, hour: 0 };   // the Auto-submit, just after midnight
// A moment in ms, local time, as the page works out `now` (same time zone).
const at = (day, hour) => new Date(day + 'T00:00').getTime() + hour * 3600000;

const backlog = { role: 'backlog', hasTodo: true };
const todo = { role: 'todo', hasTodo: true };
const wip = { role: 'wip', hasTodo: true };
const done = { role: 'done', hasTodo: true };

const weekly = { every: 1, start: '2028-02-07', unit: 'weeks' };   // Mondays
const wednesdays = { every: 1, start: '2028-02-02', unit: 'weeks' };
const daily = { every: 1, start: '2028-02-01', unit: 'days' };
const monthly1st = { every: 1, start: '2028-01-01', unit: 'months' };
const fortnightly = { every: 2, start: '2028-02-07', unit: 'weeks' };

// picked in the Card editor: its Priority, the Schedule line (Recurring) or
// the typed Due date (Critical), whether the Card is new, and the day it was picked
const picked = (priority, more) => Object.assign({ priority, schedule: null, due: null, isNew: false, on: TODAY }, more);

// [what it shows, verb, card, where, moment, the verb's last argument, expected Decision]
const ROWS = [
    // Medium → Recurring: its Due date is the first Schedule date on or after
    // today, and it waits in Backlog unless that's today.
    ['Medium → Recurring waits in Backlog for its first Schedule date',
        'edited', { priority: 'medium', arrival: 5 }, todo, AT_10, picked('recurring', { schedule: weekly }),
        { to: 'backlog', due: '2028-02-28', schedule: weekly, criticalSince: null, changed: true }],
    ['Medium → Recurring due today stays where it is',
        'edited', { priority: 'medium', arrival: 5 }, todo, AT_10, picked('recurring', { schedule: wednesdays }),
        { to: null, due: TODAY, schedule: wednesdays, criticalSince: null, changed: true }],
    ['a new Card saved Recurring waits in Backlog',
        'edited', { priority: 'low' }, wip, AT_10, picked('recurring', { schedule: weekly, isNew: true }),
        { to: 'backlog', due: '2028-02-28', schedule: weekly, criticalSince: null, changed: true }],
    ['a Card in Done saved Recurring stays in Done',
        'edited', { priority: 'low', xp: 1 }, done, AT_10, picked('recurring', { schedule: weekly }),
        { to: null, due: '2028-02-28', schedule: weekly, criticalSince: null, changed: true }],
    ['a Schedule edited alone gives a new Due date, and no move',
        'edited', { priority: 'recurring', arrival: 5, schedule: weekly, due: '2028-02-28' }, todo, AT_10, picked('recurring', { schedule: fortnightly }),
        { to: null, due: '2028-03-06', schedule: fortnightly, criticalSince: null, changed: true }],
    ['a Recurring Card saved with its Schedule as it was is unchanged',
        'edited', { priority: 'recurring', arrival: 5, schedule: weekly, due: '2028-02-21' }, backlog, AT_10, picked('recurring', { schedule: Object.assign({}, weekly) }),
        { to: null, due: '2028-02-21', schedule: weekly, criticalSince: null, changed: false }],

    // Critical with a Due date tomorrow or later: it waits in Backlog. One in
    // Done, or in Backlog already, stays.
    ['Medium → Critical with a date tomorrow or later waits in Backlog',
        'edited', { priority: 'medium', arrival: 5 }, todo, AT_10, picked('critical', { due: '2028-03-02' }),
        { to: 'backlog', due: '2028-03-02', schedule: null, criticalSince: null, changed: true }],
    ['a waiting Critical Card given a date goes to Backlog, its Critical timer starting over',
        'edited', { priority: 'critical', arrival: 5, criticalSince: 7 }, todo, AT_10, picked('critical', { due: '2028-02-24' }),
        { to: 'backlog', due: '2028-02-24', schedule: null, criticalSince: null, changed: true }],
    // A first List that's WIP, on a board with no Backlog, is WIP: the Card
    // moves to the end of it (it used to stay put).
    ['one in WIP goes to Backlog too',
        'edited', { priority: 'medium', arrival: 5 }, wip, AT_10, picked('critical', { due: '2028-02-24', isNew: true }),
        { to: 'backlog', due: '2028-02-24', schedule: null, criticalSince: null, changed: true }],
    ['a Card in Done given a date stays in Done',
        'edited', { priority: 'low', arrival: 5, xp: 1 }, done, AT_10, picked('critical', { due: '2028-02-25' }),
        { to: null, due: '2028-02-25', schedule: null, criticalSince: null, changed: true }],
    ['a Card in Backlog given another date stays there',
        'edited', { priority: 'critical', arrival: 5, due: '2028-03-02' }, backlog, AT_10, picked('critical', { due: '2028-03-05' }),
        { to: null, due: '2028-03-05', schedule: null, criticalSince: null, changed: true }],
    ['Recurring → Critical with no date loses its Schedule and Due date',
        'edited', { priority: 'recurring', arrival: 5, schedule: weekly, due: '2028-02-28' }, backlog, AT_10, picked('critical', { due: '' }),
        { to: null, due: null, schedule: null, criticalSince: null, changed: false }],

    // A typed day of today or earlier, or one that isn't a day, keeps the old one.
    ['a typed day of today keeps the Due date it had',
        'edited', { priority: 'critical', arrival: 5, due: '2028-03-05' }, backlog, AT_10, picked('critical', { due: TODAY }),
        { to: null, due: '2028-03-05', schedule: null, criticalSince: null, changed: false }],
    ['a typed day gone by, on a Card with none, keeps none',
        'edited', { priority: 'critical', arrival: 5, criticalSince: 7 }, todo, AT_10, picked('critical', { due: '2028-02-01' }),
        { to: null, due: null, schedule: null, criticalSince: 7, changed: false }],
    ['a typed date that isn\'t a day keeps the Due date it had',
        'edited', { priority: 'critical', arrival: 5, due: '2028-03-05' }, backlog, AT_10, picked('critical', { due: '2028-3-5' }),
        { to: null, due: '2028-03-05', schedule: null, criticalSince: null, changed: false }],
    ['the day is checked against the day it was picked',
        'edited', { priority: 'critical', arrival: 5, due: '2028-03-05' }, backlog, AT_10, picked('critical', { due: '2028-02-24', on: '2028-02-24' }),
        { to: null, due: '2028-03-05', schedule: null, criticalSince: null, changed: false }],

    // Critical → another Priority, or the date cleared, drops the Due date.
    ['Critical → Medium drops the Due date, and stays',
        'edited', { priority: 'critical', arrival: 5, due: '2028-03-10' }, backlog, AT_10, picked('medium'),
        { to: null, due: null, schedule: null, criticalSince: null, changed: false }],
    ['Recurring → Low drops the Schedule and Due date',
        'edited', { priority: 'recurring', arrival: 5, schedule: weekly, due: '2028-02-28' }, todo, AT_10, picked('low'),
        { to: null, due: null, schedule: null, criticalSince: null, changed: false }],
    ['the date cleared: an ordinary Critical Card, where it is',
        'edited', { priority: 'critical', arrival: 5, due: '2028-03-05' }, backlog, AT_10, picked('critical', { due: '' }),
        { to: null, due: null, schedule: null, criticalSince: null, changed: true }],
    ['a Medium Card saved as it was is unchanged',
        'edited', { priority: 'medium', arrival: 5 }, todo, AT_10, picked('medium'),
        { to: null, due: null, schedule: null, criticalSince: null, changed: false }],

    // Moved by hand (the card menu), into `where`: a Critical Card stops
    // waiting for its day, and the move restarts its Critical timer.
    ['a dated Critical Card moved by hand loses its Due date and Critical timer',
        'moved', { priority: 'critical', arrival: 5, due: '2028-03-10', criticalSince: 7 }, todo, AT_10, undefined,
        { to: null, due: null, schedule: null, criticalSince: null }],
    ['a Recurring Card moved by hand keeps its Due date',
        'moved', { priority: 'recurring', arrival: 5, schedule: weekly, due: '2028-02-28' }, wip, AT_10, undefined,
        { to: null, due: '2028-02-28', schedule: weekly, criticalSince: null }],

    // The minute tick, on a Card in Backlog: one with a Due date that has
    // come moves on to To-Do, if it was waiting there before that day began.
    ['a Recurring Card due today, waiting since before today, moves on to To-Do',
        'dayBegins', { priority: 'recurring', arrival: at('2028-02-22', 15), schedule: wednesdays, due: TODAY }, backlog, AT_10, undefined,
        { to: 'todo', due: TODAY, schedule: wednesdays, criticalSince: null }],
    // A Critical one loses its Due date, its Critical timer counting from the
    // start of that day, so every device agrees.
    ['a Critical Card due today moves on, without its Due date, its Critical timer from midnight',
        'dayBegins', { priority: 'critical', arrival: at('2028-02-20', 9), due: TODAY }, backlog, AT_10, undefined,
        { to: 'todo', due: null, schedule: null, criticalSince: at(TODAY, 0) }],
    ['one put back in Backlog by hand on its Due date stays',
        'dayBegins', { priority: 'recurring', arrival: at(TODAY, 9), schedule: wednesdays, due: TODAY }, backlog, AT_10, undefined,
        { to: null, due: TODAY, schedule: wednesdays, criticalSince: null }],
    ['one saved in Backlog due today stays',
        'dayBegins', { priority: 'recurring', arrival: at(TODAY, 0), schedule: wednesdays, due: TODAY }, backlog, AT_10, undefined,
        { to: null, due: TODAY, schedule: wednesdays, criticalSince: null }],
    ['one due later waits',
        'dayBegins', { priority: 'critical', arrival: 5, due: '2028-03-02' }, backlog, AT_10, undefined,
        { to: null, due: '2028-03-02', schedule: null, criticalSince: null }],
    ['with no To-Do, nothing moves',
        'dayBegins', { priority: 'critical', arrival: 5, due: TODAY }, { role: 'backlog', hasTodo: false }, AT_10, undefined,
        { to: null, due: TODAY, schedule: null, criticalSince: null }],
    ['a Card moved out of Backlog early is left where it is',
        'dayBegins', { priority: 'recurring', arrival: 5, schedule: wednesdays, due: TODAY }, wip, AT_10, undefined,
        { to: null, due: TODAY, schedule: wednesdays, criticalSince: null }],
    // On a board with no List named Backlog whose first List is WIP or Done,
    // that List is WIP or Done: nothing waits there, so nothing moves on (it
    // used to move to To-Do). At the module it looks like any WIP row.
    ['no Backlog, and a first List that is WIP: nothing moves on from it',
        'dayBegins', { priority: 'critical', arrival: 5, due: TODAY, criticalSince: 7 }, wip, AT_10, undefined,
        { to: null, due: TODAY, schedule: null, criticalSince: 7 }],
    ['no Backlog, and a first List that is Done: nothing moves on from it',
        'dayBegins', { priority: 'recurring', arrival: 5, schedule: wednesdays, due: TODAY }, done, AT_10, undefined,
        { to: null, due: TODAY, schedule: wednesdays, criticalSince: null }],

    // The midnight Auto-submit, on a Card in Done finished on `day`: a
    // Recurring Card goes back to wait for its next Due date, the first
    // Schedule date after its current one, after `day` and on or after today,
    // so missed dates don't pile up. Due today, it goes straight to To-Do.
    ['a daily Card finished yesterday is due today, so straight to To-Do',
        'finished', { priority: 'recurring', arrival: 5, schedule: daily, due: '2028-02-22', xp: 3 }, done, AT_0, '2028-02-22',
        { to: 'todo', due: TODAY, schedule: daily, criticalSince: null }],
    ['a weekly Card finished on a Monday, the tab reopened 9 days on: to Backlog with next Monday, not a past one',
        'finished', { priority: 'recurring', arrival: 5, schedule: weekly, due: '2028-02-14' }, done, AT_10, '2028-02-14',
        { to: 'backlog', due: '2028-02-28', schedule: weekly, criticalSince: null }],
    ['a monthly Card finished late comes back on its next date',
        'finished', { priority: 'recurring', arrival: 5, schedule: monthly1st, due: '2028-02-01' }, done, AT_0, '2028-02-22',
        { to: 'backlog', due: '2028-03-01', schedule: monthly1st, criticalSince: null }],
    ['a monthly Card finished early skips its current date',
        'finished', { priority: 'recurring', arrival: 5, schedule: monthly1st, due: '2028-03-01' }, done, AT_0, '2028-02-22',
        { to: 'backlog', due: '2028-04-01', schedule: monthly1st, criticalSince: null }],
    ['due today with no To-Do, it goes to Backlog',
        'finished', { priority: 'recurring', arrival: 5, schedule: daily, due: '2028-02-22' }, { role: 'done', hasTodo: false }, AT_0, '2028-02-22',
        { to: 'backlog', due: TODAY, schedule: daily, criticalSince: null }],
    ["a Card that isn't Recurring doesn't come back",
        'finished', { priority: 'critical', arrival: 5, due: '2028-02-22', xp: 3 }, done, AT_0, '2028-02-22',
        null],
    ['a Recurring Card with no Schedule doesn\'t come back',
        'finished', { priority: 'recurring', arrival: 5, due: '2028-02-22' }, done, AT_0, '2028-02-22',
        null],

    // The caller reads the clock: no moment, no default.
    ['a missing moment.today throws',
        'edited', { priority: 'medium' }, todo, { hour: 10 }, picked('medium'), { threw: 'TypeError' }],
    ['a missing moment.now throws',
        'edited', { priority: 'medium' }, todo, { today: TODAY }, picked('medium'), { threw: 'TypeError' }],

    // Every save: a Critical Card outside WIP and Done is waiting, its
    // Critical timer counting from criticalSince; it never moves a Card.
    ['an undated Critical Card waiting gets its Critical timer from now',
        'settle', { priority: 'critical', arrival: 5 }, todo, AT_10, undefined,
        { to: null, due: null, schedule: null, criticalSince: at(TODAY, 10) }],
    ['one already waiting keeps its start',
        'settle', { priority: 'critical', arrival: 5, criticalSince: 7 }, backlog, AT_10, undefined,
        { to: null, due: null, schedule: null, criticalSince: 7 }],
    ['a dated Critical Card whose day has come, still in Backlog, counts from that midnight',
        'settle', { priority: 'critical', arrival: 5, due: TODAY }, { role: 'backlog', hasTodo: false }, AT_10, undefined,
        { to: null, due: TODAY, schedule: null, criticalSince: at(TODAY, 0) }],
    ['one whose day is still to come has no Critical timer',
        'settle', { priority: 'critical', arrival: 5, due: '2028-03-02', criticalSince: 7 }, backlog, AT_10, undefined,
        { to: null, due: '2028-03-02', schedule: null, criticalSince: null }],
    ['a Critical Card in WIP has none',
        'settle', { priority: 'critical', arrival: 5, criticalSince: 7 }, wip, AT_10, undefined,
        { to: null, due: null, schedule: null, criticalSince: null }],
    ['nor one in Done',
        'settle', { priority: 'critical', arrival: 5, criticalSince: 7, xp: 5000 }, done, AT_10, undefined,
        { to: null, due: null, schedule: null, criticalSince: null }],
    ['a Card that is no longer Critical loses it',
        'settle', { priority: 'medium', arrival: 5, criticalSince: 7 }, todo, AT_10, undefined,
        { to: null, due: null, schedule: null, criticalSince: null }],
    ['a Recurring Card is left as it is',
        'settle', { priority: 'recurring', arrival: 5, schedule: weekly, due: '2028-02-28' }, backlog, AT_10, undefined,
        { to: null, due: '2028-02-28', schedule: weekly, criticalSince: null }],

    // What a Card shows of its Due date: Late (a Recurring Card past the end
    // of its Due date, never in Done), the red Critical timer's start (from),
    // and the day it waits for in Backlog (next; nextCritical: in red).
    // The Card editor's Due line starts from a Critical Card's Due date, or
    // empty; the earliest day it takes is tomorrow.
    ['a Late Card in To-Do counts from the end of its Due date',
        'shows', { priority: 'recurring', schedule: weekly, due: '2028-02-21' }, todo, AT_10, undefined,
        { late: true, from: at('2028-02-22', 0), next: null, nextCritical: false, dueLine: { value: '', min: '2028-02-24' } }],
    ['a Late Card in WIP is still Late, with no red timer',
        'shows', { priority: 'recurring', schedule: weekly, due: '2028-02-21', wip: 9 }, wip, AT_10, undefined,
        { late: true, from: null, next: null, nextCritical: false, dueLine: { value: '', min: '2028-02-24' } }],
    ['a Card in Done is never Late',
        'shows', { priority: 'recurring', schedule: weekly, due: '2028-02-21' }, done, AT_10, undefined,
        { late: false, from: null, next: null, nextCritical: false, dueLine: { value: '', min: '2028-02-24' } }],
    ['on its Due date it is not Late yet',
        'shows', { priority: 'recurring', schedule: wednesdays, due: TODAY }, todo, AT_10, undefined,
        { late: false, from: null, next: null, nextCritical: false, dueLine: { value: '', min: '2028-02-24' } }],
    ['a Critical Card is never Late',
        'shows', { priority: 'critical', due: '2028-02-21', criticalSince: at('2028-02-21', 0) }, { role: 'backlog', hasTodo: false }, AT_10, undefined,
        { late: false, from: at('2028-02-21', 0), next: null, nextCritical: false, dueLine: { value: '2028-02-21', min: '2028-02-24' } }],
    ['a Recurring Card waiting in Backlog for a later day: next, in purple',
        'shows', { priority: 'recurring', schedule: weekly, due: '2028-02-28' }, backlog, AT_10, undefined,
        { late: false, from: null, next: '2028-02-28', nextCritical: false, dueLine: { value: '', min: '2028-02-24' } }],
    ["a Critical one: next, in red, and its Due line holds its Due date",
        'shows', { priority: 'critical', due: '2028-03-05' }, backlog, AT_10, undefined,
        { late: false, from: null, next: '2028-03-05', nextCritical: true, dueLine: { value: '2028-03-05', min: '2028-02-24' } }],
    ['a Card moved out of Backlog early shows no next',
        'shows', { priority: 'recurring', schedule: weekly, due: '2028-02-28' }, todo, AT_10, undefined,
        { late: false, from: null, next: null, nextCritical: false, dueLine: { value: '', min: '2028-02-24' } }],
    ['a waiting Critical Card counts from criticalSince',
        'shows', { priority: 'critical', criticalSince: at(TODAY, 8) }, todo, AT_10, undefined,
        { late: false, from: at(TODAY, 8), next: null, nextCritical: false, dueLine: { value: '', min: '2028-02-24' } }],
    ['in WIP it has no red timer',
        'shows', { priority: 'critical', criticalSince: at(TODAY, 8), wip: 9 }, wip, AT_10, undefined,
        { late: false, from: null, next: null, nextCritical: false, dueLine: { value: '', min: '2028-02-24' } }],
    ["tomorrow across a month's end",
        'shows', { priority: 'critical' }, todo, { today: '2028-02-29', hour: 23 }, undefined,
        { late: false, from: null, next: null, nextCritical: false, dueLine: { value: '', min: '2028-03-01' } }],

    // The order of a List (docs/adr/0002): Late first, then Recurring,
    // Critical, Medium and Low, each first in, first out by Arrival. Done
    // goes by Arrival alone. Here `card` is the List's Cards and the
    // expected value their texts in order.
    ['a List sorts Late first, then by Priority, then by Arrival',
        'order', [
            { text: 'low', priority: 'low', arrival: 1 },
            { text: 'medium 2', priority: 'medium', arrival: 7 },
            { text: 'critical', priority: 'critical', arrival: 3 },
            { text: 'recurring', priority: 'recurring', arrival: 4, schedule: weekly, due: '2028-02-28' },
            { text: 'late', priority: 'recurring', arrival: 9, schedule: weekly, due: '2028-02-21' },
            { text: 'medium 1', priority: 'medium', arrival: 2 },
            { text: 'no Priority', arrival: 0 },
        ], todo, AT_10, undefined,
        ['late', 'recurring', 'critical', 'medium 1', 'medium 2', 'no Priority', 'low']],
    ['in WIP a Late Card still sorts first',
        'order', [
            { text: 'recurring', priority: 'recurring', arrival: 1, schedule: weekly, due: '2028-02-28' },
            { text: 'late', priority: 'recurring', arrival: 3, schedule: weekly, due: '2028-02-21' },
        ], wip, AT_10, undefined,
        ['late', 'recurring']],
    ['Done sorts by Arrival alone',
        'order', [
            { text: 'low', priority: 'low', arrival: 1 },
            { text: 'late', priority: 'recurring', arrival: 3, schedule: weekly, due: '2028-02-21' },
            { text: 'critical', priority: 'critical', arrival: 2 },
        ], done, AT_10, undefined,
        ['low', 'critical', 'late']],
    ['settle needs the moment too',
        'settle', { priority: 'critical' }, todo, { today: TODAY }, undefined, { threw: 'TypeError' }],
    ['shows needs the moment too',
        'shows', { priority: 'critical' }, todo, { hour: 10 }, undefined, { threw: 'TypeError' }],
    ['order needs the moment too',
        'order', [], todo, { hour: 10 }, undefined, { threw: 'TypeError' }],
];

(async () => {
    const app = await openApp(null, { demo: false });
    const { page } = app;
    await sleep(200);

    try {
        for (const [label, verb, card, where, moment, last, expected] of ROWS) {
            const got = await page.evaluate((verb, card, where, moment, last) => {
                const m = moment && { today: moment.today, now: moment.hour == null ? undefined : new Date(moment.today + 'T00:00').getTime() + moment.hour * 3600000 };
                let d;
                try {
                    d = verb == 'order' ? card.slice().sort(Due.order(where.role, m)).map((c) => c.text)
                        : Due[verb](card, where, m, last);
                } catch (e) { return { threw: e.constructor.name }; }
                if (d === null || verb == 'order') return { d };
                // which of the card's own values came back as the very same value
                const same = {};
                for (const k of ['due', 'schedule', 'criticalSince']) same[k] = k in card && d[k] === card[k];
                return { d, same };
            }, verb, card, where, moment, last);

            if (expected === null || expected.threw) { assert.deepStrictEqual(expected === null ? got.d : got, expected, label); continue; }
            assert.ok(got.d, label + ': ' + JSON.stringify(got));
            assert.deepStrictEqual(got.d, expected, label);
            if (verb != 'shows' && verb != 'order') for (const k of ['due', 'schedule', 'criticalSince'])
                if (k in card && JSON.stringify(card[k]) == JSON.stringify(expected[k]))
                    assert.ok(got.same[k], label + ': an unchanged ' + k + ' comes back as the one passed in');
        }

        assert.deepStrictEqual(app.errors, [], 'no page errors');
    } finally {
        await app.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
