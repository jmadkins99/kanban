// Every Card has a Priority: Recurring, Critical, Medium or Low. Its icon sits
// at the very left of the Card, before the text. "+ Card" starts a Card as Low.
// In edit mode the icon is a dropdown; clicking away saves the text and the
// Priority together, as one Undo step.
// Cards are saved as `notes`, Nullboard's name, so old boards, History days and export files load without a migration.
const assert = require('assert');
const { openApp, settle } = require('../lib');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
    const app = await openApp(() => {});
    const { page } = app;
    await page.setViewport({ width: 1280, height: 1000 });
    await sleep(300);

    const clickAway = async () => { await page.mouse.click(1270, 990); await sleep(50); await settle(page); };
    // The Priority each Card in List `list` shows, top to bottom, by its icon's label.
    const shown = (list) => page.evaluate((list) => $('.wrap .board .list').eq(list).find('.card').map((_, c) => {
        const icon = $(c).find('.card-prio:visible svg');
        return icon.length ? $(c).find('.card-prio').attr('aria-label') : null;
    }).get(), list);
    const saved = (list) => page.evaluate((list) => NB.board.lists[list].notes.map((n) => [n.text, n.priority]), list);

    try {
        // "+ Card" opens a new Card in edit mode, with Low selected.
        await page.evaluate(() => $('.wrap .board .list').eq(0).find('.add-card').click());
        await sleep(100);
        assert.strictEqual(await page.evaluate(() => $('.wrap .board .card.editing .card-prio').attr('aria-label')), 'Priority: Low', 'a new Card starts as Low');
        await page.keyboard.type('a new Card');
        await clickAway();
        const n = (await saved(0)).length;
        assert.deepStrictEqual((await saved(0))[n - 1], ['a new Card', 'low'], 'saved as Low');
        assert.strictEqual((await shown(0))[n - 1], 'Priority: Low', 'shows the Low icon');

        // The icon sits at the very left of the Card, before its text.
        const box = await page.evaluate(() => {
            const $c = $('.wrap .board .list').eq(0).find('.card').last();
            const c = $c[0].getBoundingClientRect(), i = $c.find('.card-prio')[0].getBoundingClientRect(), t = $c.find('.text')[0].getBoundingClientRect();
            const range = document.createRange(); range.selectNodeContents($c.find('.text')[0]);
            const words = range.getBoundingClientRect();
            return { left: i.left - c.left, beforeText: i.right <= words.left, inside: i.top >= c.top && i.bottom <= c.bottom };
        });
        assert.ok(box.left >= 0 && box.left < 12 && box.beforeText && box.inside, 'the icon is at the left, before the text ' + JSON.stringify(box));

        // Edit, open the dropdown, pick Critical and change the text: the dropdown
        // shows the new icon, and clicking away saves both.
        const first = '.wrap .board .list:nth-child(1) .card:nth-child(1)';
        const edit = async (sel) => {
            await page.click(sel + ' .text');
            await sleep(450);
            await page.click(sel + ' [data-cm=edit]');
            await sleep(100);
        };
        const pick = async (sel, label) => {
            await page.click(sel + ' .card-prio');
            await sleep(50);
            const options = await page.evaluate((sel) => $(sel).find('.prio-pick button:visible').map((_, b) => $(b).attr('aria-label')).get(), sel);
            assert.deepStrictEqual(options, ['Recurring', 'Critical', 'Medium', 'Low'], 'the dropdown offers the four Priorities');
            await page.click(`${sel} .prio-pick button[aria-label=${label}]`);
            await sleep(50);
        };
        const before = await saved(0);
        await edit(first);
        await pick(first, 'Critical');
        assert.strictEqual(await page.evaluate((sel) => $(sel).hasClass('editing'), first), true, 'still editing after picking');
        assert.strictEqual(await page.evaluate((sel) => $(sel).find('.card-prio').attr('aria-label'), first), 'Priority: Critical', 'the dropdown shows the pick');
        assert.deepStrictEqual(await saved(0), before, 'nothing saved before clicking away');
        await page.keyboard.press('End');
        await page.keyboard.type(' now');
        await clickAway();
        assert.deepStrictEqual((await saved(0))[0], [before[0][0] + ' now', 'critical'], 'clicking away saves the text and Priority');
        assert.strictEqual((await shown(0))[0], 'Priority: Critical', 'the Card shows the Critical icon');

        // One Undo takes both back.
        await page.evaluate(() => $('.wrap .board .undo-board').click());
        await settle(page);
        assert.deepStrictEqual(await saved(0), before, 'one Undo reverts the text and Priority');
        assert.strictEqual((await shown(0))[0], 'Priority: Low', 'and the Low icon is back');

        // A Priority change alone saves too; each Priority has its own icon.
        const looks = {};
        for (const label of ['Recurring', 'Critical', 'Medium', 'Low']) {
            await edit(first);
            await pick(first, label);
            await clickAway();
            assert.strictEqual((await saved(0))[0][1], label.toLowerCase(), label + ' is saved');
            assert.strictEqual((await shown(0))[0], 'Priority: ' + label, label + ' icon shown');
            looks[label] = await page.evaluate((sel) => {
                const svg = $(sel).find('.card-prio svg')[0];
                return { shape: svg.innerHTML, color: getComputedStyle(svg).color };
            }, first);
        }
        const shapes = new Set(Object.values(looks).map((l) => l.shape)), colors = new Set(Object.values(looks).map((l) => l.color));
        assert.strictEqual(shapes.size, 4, 'four different icons');
        assert.strictEqual(colors.size, 4, 'in four colours');
        const rgb = (c) => c.match(/\d+/g).map(Number);
        const [r, g, b] = rgb(looks.Critical.color);
        assert.ok(r > 200 && g < 120 && b < 120, 'Critical is red: ' + looks.Critical.color);
        const [, , lb] = rgb(looks.Low.color), [lr] = rgb(looks.Low.color);
        assert.ok(lb > 200 && lr < 100, 'Low is blue: ' + looks.Low.color);

        assert.deepStrictEqual(app.errors, [], 'no page errors');
    } finally {
        await app.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
