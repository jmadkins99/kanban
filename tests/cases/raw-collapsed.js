// Nullboard's raw (no card background) and collapsed (first line only) looks
// are gone. Cards saved with either flag show as normal Cards, on the board
// and in History, and the flags are dropped the next time the board saves.
// Cards are saved as `notes`, Nullboard's name, so old boards, History days and export files load without a migration.
const assert = require('assert');
const { openApp, settle, sleep, seedBoard } = require('../lib');

const LISTS = [{
    title: 'To-Do', notes: [
        { text: 'plain', raw: false, min: false },
        { text: 'raw', raw: true, min: false },
        { text: 'two\nlines', raw: false, min: false },
        { text: 'two\nlines', raw: false, min: true },
        { text: 'two\nlines', raw: true, min: true },
    ],
}];

(async () => {
    const app = await openApp(seedBoard({ id: 5, title: 'Looks', lists: LISTS },
        [{ day: '2026-01-05', title: 'Looks', submittedAt: '2026-01-05T20:00:00.000Z', lists: LISTS }]), { demo: false });
    const { page } = app;
    await page.setViewport({ width: 1280, height: 1000 });
    await sleep(300);

    // How each element looks: its box, background, shadow, weight and colour.
    const looks = (sel) => page.evaluate((sel) => $(sel).map((_, e) => {
        const c = getComputedStyle(e);
        return JSON.stringify([e.offsetHeight, c.backgroundImage, c.backgroundColor, c.boxShadow, c.fontWeight, c.color, c.paddingBottom]);
    }).get(), sel);

    try {
        const cards = await looks('.wrap .board .card');
        assert.strictEqual(cards[1], cards[0], 'a raw Card looks like a plain one');
        assert.strictEqual(cards[3], cards[2], 'a collapsed Card shows all its lines');
        assert.strictEqual(cards[4], cards[2], 'a raw, collapsed Card looks normal too');

        // The next save drops the flags.
        await page.click('.wrap .board .card:nth-child(1) .text');
        await sleep(450);
        await page.evaluate(() => $('.wrap .board .card:nth-child(1)').find('[data-cm=edit]').click());
        await page.keyboard.press('End');
        await page.keyboard.type('!');
        await page.mouse.click(1270, 990);
        await settle(page);
        const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('nullboard.board.5.' + NB.board.revision)));
        assert.strictEqual(saved.revision, 2, 'the board saved');
        assert.deepStrictEqual(saved.lists[0].notes.filter((n) => 'raw' in n || 'min' in n), [], 'no Card keeps raw or min');
        assert.deepStrictEqual(saved.lists[0].notes.map((n) => n.text), ['plain!', 'raw', 'two\nlines', 'two\nlines', 'two\nlines']);

        // History shows them as normal Cards too.
        await page.evaluate(() => $('.config .view-history').click());
        for (let i = 0; i < 200 && !(await page.$('.history .history-item[data-day="2026-01-05"]')); i++)
            await page.click('.week-prev');
        const day = await looks('.history .history-item[data-day="2026-01-05"] .history-card');
        assert.strictEqual(day[1], day[0], 'a raw Card in History looks like a plain one');
        assert.strictEqual(day[3], day[2], 'and a collapsed one shows all its lines');

        assert.deepStrictEqual(app.errors, [], 'no page errors');
    } finally {
        await app.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
