// The Group module (js/group.js) decides which Cards of a List form a Group
// and the List's final order (docs/adr/0004). Each row is one call, run
// inside the loaded page with the day passed in, so no clock is faked:
// `nameOf, Name → Group name`, or `arrange, Cards, role, moment → each Card's
// Name and its place in its Group` ('-' for none).
const assert = require('assert');
const { openApp, sleep } = require('../lib');

const TODAY = '2028-02-23';
const AT_10 = { today: TODAY, hour: 10 };
const weekly = { every: 1, start: '2028-02-07', unit: 'weeks' };   // Mondays

const card = (text, priority, arrival, more) => Object.assign({ text, priority, arrival }, more);

// [what it shows, 'nameOf', Name, expected Group name]
// [what it shows, 'arrange', Cards, role, moment, expected [Name, place] in order]
const ROWS = [
    ['the text before the colon and space', 'nameOf', 'kanban: group cards', 'kanban'],
    ['a colon with no space after it isn\'t one', 'nameOf', 'add 30 minutes to 9:15 timer', null],
    ['a time before the colon and space is part of the Group name', 'nameOf', 'standup 9:15: notes', 'standup 9:15'],
    ['only the first colon and space counts', 'nameOf', 'kanban: sync: refused writes', 'kanban'],
    ['any case', 'nameOf', 'Kanban: group cards', 'kanban'],
    ['trimmed', 'nameOf', '  gym-tracker  : ui refresh', 'gym-tracker'],
    ['an empty Group name is none', 'nameOf', '  : nothing before it', null],
    ['a Name with no colon has none', 'nameOf', 'brush teeth', null],
    ['an empty Name has none', 'nameOf', '', null],
    ['a Card not yet named has none', 'nameOf', undefined, null],

    ['a lone Card with a Group name stays ungrouped', 'arrange', [
        card('costco: milk', 'low', 1), card('gym', 'medium', 2),
    ], 'todo', AT_10, [['gym', '-'], ['costco: milk', '-']]],
    ['"kanban and gym-tracker" is not "kanban"', 'arrange', [
        card('kanban: a', 'medium', 1), card('x', 'medium', 2), card('kanban and gym-tracker: b', 'medium', 3),
    ], 'todo', AT_10, [['kanban: a', '-'], ['x', '-'], ['kanban and gym-tracker: b', '-']]],
    ['Group names match in any case', 'arrange', [
        card('Kanban: a', 'medium', 1), card('x', 'medium', 2), card('kanban: b', 'medium', 3),
    ], 'todo', AT_10, [['Kanban: a', 'first'], ['kanban: b', 'last'], ['x', '-']]],
    ['a Group sits at its top Card\'s place, in Priority then Arrival order inside it', 'arrange', [
        card('k: low old', 'low', 1), card('critical', 'critical', 2), card('medium', 'medium', 3),
        card('k: critical', 'critical', 4), card('k: low new', 'low', 5), card('low', 'low', 6),
    ], 'todo', AT_10, [
        ['critical', '-'], ['k: critical', 'first'], ['k: low old', 'middle'], ['k: low new', 'last'],
        ['medium', '-'], ['low', '-'],
    ]],
    ['a Late Card pulls its Group to the top', 'arrange', [
        card('recurring', 'recurring', 1, { schedule: weekly, due: TODAY }), card('k: low', 'low', 2),
        card('k: late', 'recurring', 3, { schedule: weekly, due: '2028-02-21' }),
    ], 'todo', AT_10, [['k: late', 'first'], ['k: low', 'last'], ['recurring', '-']]],
    ["a Group name that's also a built-in key works like any other", 'arrange', [
        card('constructor: a', 'medium', 1), card('__proto__: b', 'medium', 2), card('x', 'medium', 3),
        card('Constructor: c', 'medium', 4), card('toString: d', 'medium', 5),
    ], 'todo', AT_10, [['constructor: a', 'first'], ['Constructor: c', 'last'], ['__proto__: b', '-'], ['x', '-'], ['toString: d', '-']]],
    ['Groups follow Backlog\'s Due-date order', 'arrange', [
        card('k: Mar 9', 'recurring', 1, { schedule: weekly, due: '2028-03-09' }),
        card('Mar 1', 'critical', 2, { due: '2028-03-01' }),
        card('k: Mar 6', 'critical', 3, { due: '2028-03-06' }),
        card('k: undated', 'medium', 4),
        card('Feb 28', 'recurring', 5, { schedule: weekly, due: '2028-02-28' }),
    ], 'backlog', AT_10, [
        ['Feb 28', '-'], ['Mar 1', '-'], ['k: Mar 6', 'first'], ['k: Mar 9', 'middle'], ['k: undated', 'last'],
    ]],
    ['Done never groups, and keeps Arrival order', 'arrange', [
        card('k: a', 'critical', 1), card('x', 'low', 2), card('k: b', 'low', 3),
    ], 'done', AT_10, [['k: a', '-'], ['x', '-'], ['k: b', '-']]],
    ['two Groups next to each other stay separate', 'arrange', [
        card('a: 1', 'medium', 1), card('b: 1', 'medium', 2), card('a: 2', 'medium', 3), card('b: 2', 'medium', 4),
    ], 'wip', AT_10, [['a: 1', 'first'], ['a: 2', 'last'], ['b: 1', 'first'], ['b: 2', 'last']]],
    ['Josh\'s WIP List', 'arrange', [
        card('gym-tracker: ui refresh ai deslop', 'medium', 1),
        card('kanban: group cards', 'medium', 2),
        card('gratitude', 'recurring', 3, { schedule: weekly, due: TODAY }),
        card('gym-tracker: replicate card-swiping UI from \'workout\' tab to \'history\' tab', 'medium', 4),
        card('gym', 'recurring', 5, { schedule: weekly, due: TODAY }),
        card('kanban: fixed card height', 'medium', 6),
        card('brush teeth', 'recurring', 7, { schedule: weekly, due: TODAY }),
    ], 'wip', AT_10, [
        ['gratitude', '-'], ['gym', '-'], ['brush teeth', '-'],
        ['gym-tracker: ui refresh ai deslop', 'first'],
        ['gym-tracker: replicate card-swiping UI from \'workout\' tab to \'history\' tab', 'last'],
        ['kanban: group cards', 'first'], ['kanban: fixed card height', 'last'],
    ]],
    ['arrange needs the moment', 'arrange', [], 'todo', { hour: 10 }, { threw: 'TypeError' }],
];

(async () => {
    const app = await openApp(null, { demo: false });
    const { page } = app;
    await sleep(200);

    try {
        for (const row of ROWS) {
            const [label, verb] = row;
            if (verb == 'nameOf') {
                const got = await page.evaluate((name) => Group.nameOf(name), row[2]);
                assert.deepStrictEqual(got, row[3], label);
                continue;
            }
            const [, , cards, role, moment, expected] = row;
            const got = await page.evaluate((cards, role, moment) => {
                const m = { today: moment.today, now: moment.hour == null ? undefined : new Date(moment.today + 'T00:00').getTime() + moment.hour * 3600000 };
                let arranged;
                try { arranged = Group.arrange(cards, role, m); } catch (e) { return { threw: e.constructor.name }; }
                // Each Card comes back as the very one passed in.
                if (! arranged.every((a) => cards.includes(a.card))) return { notSame: true };
                return arranged.map((a) => [a.card.text, a.place || '-']);
            }, cards, role, moment);
            assert.deepStrictEqual(got, expected, label);
        }

        assert.deepStrictEqual(app.errors, [], 'no page errors');
    } finally {
        await app.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
