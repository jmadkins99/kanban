// "Next: <date>" fills in as its day nears: only an outline 28 days or more
// out, full 3 days or fewer out (how much, by day, is the Due date module's,
// in due-date-rules.js). Here, the page draws that fill on a purple and a
// red tag and redraws it as the days pass, with no save; the WIP timer and
// the Critical timer stay fully filled, also on a Card whose tag was part
// filled before its day came.
const assert = require('assert');
const { openApp, sleep, fakeClock, setClock, wake, seedBoard } = require('../lib');

const since = new Date(2028, 1, 23, 8).getTime();
const LISTS = [
    { title: 'Backlog', notes: [
        { text: 'clean gutters', priority: 'recurring', arrival: 1, schedule: { every: 3, start: '2028-03-30', unit: 'months' }, due: '2028-03-30' },
        { text: 'water plants', priority: 'recurring', arrival: 2, schedule: { every: 2, start: '2028-02-24', unit: 'weeks' }, due: '2028-03-09' },
        { text: 'renew passport', priority: 'critical', arrival: 3, due: '2028-03-21' },
    ] },
    { title: 'To-Do', notes: [{ text: 'call bank', priority: 'critical', arrival: 4, criticalSince: since }] },
    { title: 'WIP', notes: [{ text: 'write report', priority: 'low', arrival: 5, wip: since }] },
    { title: 'Done', notes: [] },
];

(async () => {
    // Wednesday 2028-02-23, 10:00.
    const app = await openApp([fakeClock('2028-02-23 10:00'), seedBoard({ id: 82, title: 'Fill', lists: LISTS })], { demo: false });
    const { page } = app;
    await page.setViewport({ width: 1280, height: 1000 });
    await sleep(300);

    // The alpha of the tag's fill and border on the Card with this Name.
    const tag = (name) => page.evaluate((name) => {
        const t = $('.wrap .board .card').filter((_, c) => getText($(c).find('.text')) == name).find('.wip-timer');
        const alpha = (c) => { const m = /^rgba?\(([^)]*)\)/.exec(c); const p = m ? m[1].split(',') : []; return p.length == 4 ? +p[3] : p.length == 3 ? 1 : null; };
        const cs = getComputedStyle(t[0]);
        return { fill: alpha(cs.backgroundColor), border: alpha(cs.borderTopColor) };
    }, name);
    const assertAlphaNear = (got, want, label) => {
        assert.strictEqual(typeof got, 'number', label + ': an alpha was read');
        assert.ok(Math.abs(got - want) < 0.01, `${label}: ${got}, not ${want}`);
    };

    try {
        let t = await tag('clean gutters');
        assertAlphaNear(t.fill, 0, 'a Recurring Card 36 days out is only an outline');
        assertAlphaNear(t.border, 1, 'its border as strong as ever');

        // 15 days out: 52% of the purple's full 0.35; 27 days out: 4% of the red's 0.55.
        assertAlphaNear((await tag('water plants')).fill, 0.35 * 0.52, 'a Recurring Card 15 days out is half filled in');
        assertAlphaNear((await tag('renew passport')).fill, 0.55 * 0.04, 'a Critical Card 27 days out has a faint red fill');

        assertAlphaNear((await tag('call bank')).fill, 0.55, 'a Critical timer stays fully filled');
        assertAlphaNear((await tag('write report')).fill, 0.45, 'and a WIP timer');

        // Days pass with the tab open, nothing saved: on Mar 6, 3 days before
        // its day, it's fully filled in.
        await setClock(page, '2028-03-06 09:00');
        await sleep(500);
        assertAlphaNear((await tag('water plants')).fill, 0.35, '3 days out it is fully filled in');
        assertAlphaNear((await tag('renew passport')).fill, 0.55 * 0.52, 'the Critical Card, 15 days out, half');

        // Its day comes: the Critical Card's tag, half filled when last seen,
        // becomes its Critical timer, fully filled.
        await setClock(page, '2028-03-21 09:00');
        await wake(page);
        assertAlphaNear((await tag('renew passport')).fill, 0.55, 'its Critical timer is fully filled');

        assert.deepStrictEqual(app.errors, [], 'no page errors');
    } finally {
        await app.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
