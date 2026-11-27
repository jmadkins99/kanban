// Every Card is two lines of its Name tall, on a phone and on a desktop, at
// any List width, font size and line height (#96). A one-line Name sits
// centred top to bottom and left-aligned; a longer Name is cut off after two
// lines, and the Card editor shows it whole. The Priority icon and the WIP,
// Critical and "Next" pills sit centred top to bottom on every Card.
const assert = require('assert');
const { openApp, sleep, fakeClock, seedBoard, editCard } = require('../lib');

const since = new Date(2028, 1, 23, 8).getTime();
const LONG = 'renew the passport before the summer trip, and book the photo booth, and find the old one, and print the form, and post it off with the fee, and keep the receipt somewhere safe until the new one comes back in the post';
const BREAKS = 'line one\nline two\nline three\nline four';
const LISTS = [
    { title: 'Backlog', notes: [
        { text: 'water plants', priority: 'recurring', arrival: 1, schedule: { every: 1, start: '2028-02-01', unit: 'weeks' }, due: '2028-02-29' },
    ] },
    { title: 'To-Do', notes: [
        { text: 'call bank', priority: 'critical', arrival: 2, criticalSince: since },
        { text: 'buy milk', priority: 'medium', arrival: 3 },
        { text: 'sort out the receipts from the work trip to the coast so the claim can go in', priority: 'medium', arrival: 4 },
        { text: LONG, priority: 'low', arrival: 5 },
        { text: BREAKS, priority: 'low', arrival: 6 },
    ] },
    { title: 'WIP', notes: [{ text: 'write report', priority: 'low', arrival: 7, wip: since }] },
    { title: 'Done', notes: [] },
];

(async () => {
    const app = await openApp([fakeClock('2028-02-23 10:00'), seedBoard({ id: 96, title: 'Heights', lists: LISTS })], { demo: false });
    const { page } = app;

    // Every board Card's box, its Name's lines and its icon and pill.
    const measure = () => page.evaluate(() => {
        const lh = parseFloat(getComputedStyle(document.documentElement).lineHeight);
        const mid = (r) => r.top + r.height / 2;
        return { lh, cards: $('.wrap .board .card').get().map((c) => {
            const text = c.querySelector('.text');
            const range = document.createRange();
            range.selectNodeContents(text);
            const lines = [...range.getClientRects()].filter((r) => r.width > 0);
            const box = c.getBoundingClientRect();
            const tr = text.getBoundingClientRect();
            const pill = c.querySelector('.wip-timer');
            // Lines Chrome draws: those inside the Name's box.
            const shown = lines.filter((r) => r.bottom <= tr.bottom + 1);
            const tops = [...new Set(shown.map((r) => Math.round(r.top)))];
            return {
                name: getText($(c).find('.text')),
                height: box.height,
                mid: mid(box),
                lines: tops.length,
                cut: text.scrollHeight > text.clientHeight + 1,
                nameHeight: text.clientHeight,
                textMid: (Math.min(...shown.map((r) => r.top)) + Math.max(...shown.map((r) => r.bottom))) / 2,
                left: Math.min(...shown.map((r) => r.left)) - tr.left - parseFloat(getComputedStyle(text).paddingLeft),
                iconMid: mid(c.querySelector('.card-prio').getBoundingClientRect()),
                pillMid: $(pill).is(':visible') ? mid(pill.getBoundingClientRect()) : null,
                pillGap: $(pill).is(':visible') ? box.right - pill.getBoundingClientRect().right : null,
            };
        }) };
    });

    const check = async (where, { short = true } = {}) => {
        const { lh, cards } = await measure();
        const near = (a, b, what) => assert.ok(Math.abs(a - b) <= 1, `${where}: ${what} (${a} vs ${b})`);
        const h = cards[0].height;
        for (const c of cards) {
            const n = JSON.stringify(c.name.slice(0, 20));
            near(c.height, h, `${n} is as tall as every other Card`);
            assert.ok(c.lines <= 2, `${where}: ${n} shows at most two lines, shows ${c.lines}`);
            near(c.textMid, c.mid, `${n}'s Name is centred top to bottom`);
            near(c.iconMid, c.mid, `${n}'s Priority icon is centred top to bottom`);
            if (c.pillMid !== null) near(c.pillMid, c.mid, `${n}'s pill is centred top to bottom`);
            if (c.pillGap !== null) assert.ok(c.pillGap >= 0 && c.pillGap <= 10, `${where}: ${n}'s pill sits at the Card's right (${c.pillGap}px in)`);
            near(c.left, 0, `${n}'s Name is left-aligned`);
        }
        const cardNamed = (name) => cards.find((c) => c.name == name);
        near(cardNamed(LONG).nameHeight, 2 * lh, 'a cut-off Name is two lines tall');
        assert.ok(h > 2 * lh && h <= 2 * lh + 16, `${where}: a Card is two lines tall plus padding (${h}, line ${lh})`);
        assert.strictEqual(cardNamed(LONG).lines, 2, `${where}: the long Name shows two lines`);
        assert.strictEqual(cardNamed(LONG).cut, true, `${where}: the long Name is cut off`);
        assert.strictEqual(cardNamed(BREAKS).lines, 2, `${where}: the Name with line breaks shows two lines`);
        assert.strictEqual(cardNamed(BREAKS).cut, true, `${where}: the Name with line breaks is cut off`);
        for (const n of ['call bank', 'water plants', 'write report'])
            assert.notStrictEqual(cardNamed(n).pillMid, null, `${where}: "${n}" shows its pill`);
        // A short Name is one line, unless the List is too narrow for it.
        if (short) assert.strictEqual(cardNamed('buy milk').lines, 1, `${where}: "buy milk" is one line`);
    };

    // The Card editor shows a long Name whole, and no pill.
    const editorShowsWhole = async (where) => {
        for (const text of [LONG, BREAKS, 'call bank']) {
            await page.evaluate((text) => $('.wrap .board .card').filter((_, c) => getText($(c).find('.text')) == text).attr('data-t', 'x'), text);
            const sel = '.wrap .board .card[data-t="x"]';
            await editCard(page, sel);
            const ed = await page.evaluate((sel) => {
                const e = $(sel).find('.edit')[0];
                // Overflow less than its padding cuts nothing off.
                return { value: e.value, whole: e.scrollHeight - e.clientHeight < parseFloat(getComputedStyle(e).paddingBottom) };
            }, sel);
            assert.strictEqual(ed.value, text, `${where}: the Card editor holds the whole Name`);
            assert.strictEqual(ed.whole, true, `${where}: the Card editor shows the whole Name`);
            assert.strictEqual(await page.evaluate((sel) => $(sel).find('.wip-timer').is(':visible'), sel), false, `${where}: no pill in the Card editor`);
            await page.keyboard.press('Escape');
            await sleep(300);
            await page.evaluate(() => $('[data-t]').removeAttr('data-t'));
        }
    };

    try {
        for (const [size, viewport] of [
            ['desktop', { width: 1280, height: 800 }],
            ['phone', { width: 390, height: 844, isMobile: true, hasTouch: true }],
        ]) {
            await page.setViewport(viewport);
            await sleep(300);
            await check(size);
            await editorShowsWhole(size);

            // Settings: the narrowest and widest Lists, the biggest and
            // smallest fonts, the tallest line height, and all at once.
            for (const [what, set, opts] of [
                ['narrow Lists', () => setListWidth(200)],
                ['wide Lists', () => setListWidth(400)],
                ['big font', () => setFontSize(24)],
                ['tall lines', () => setLineHeight(72)],
                ['narrow Lists, big font, tall lines', () => setListWidth(200), { short: false }],
                ['small font', () => { resetLineHeight(); setFontSize(9); }],
            ]) {
                await page.evaluate(set);
                await sleep(100);
                await check(`${size}, ${what}`, opts);
            }
            await page.evaluate(() => { resetFontSize(); resetLineHeight(); resetListWidth(); });
        }

        assert.deepStrictEqual(app.errors, [], 'no page errors');
    } finally {
        await app.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
