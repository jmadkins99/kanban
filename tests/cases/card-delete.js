// Deleting a Card: Delete, at the bottom of the Card editor and only there.
// It asks first when the Card has text (OK deletes, Cancel keeps it), deletes
// an empty one straight away, and Undo brings a deleted Card back.
// Cards are saved as `notes`, Nullboard's name, so old boards, History days and export files load without a migration.
const assert = require('assert');
const { openApp, settle } = require('../lib');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
    const app = await openApp(() => {});
    const { page } = app;
    await page.setViewport({ width: 1280, height: 1000 });
    await sleep(300);
    const dialogs = [];
    page.on('dialog', (d) => dialogs.push(d.message().trim()));

    const first = '.wrap .board .list:nth-child(1) .card:nth-child(1)';
    const texts = () => page.evaluate(() => NB.board.lists[0].notes.map((n) => n.text));
    const xShown = (sel) => page.evaluate((sel) => $(sel).find('.card-del').is(':visible'), sel);
    const edit = async (sel) => {
        await page.click(sel + ' .text');
        await sleep(450);
        await page.click(sel + ' [data-cm=edit]');
        await sleep(100);
    };

    try {
        // Not editing: no Delete.
        assert.strictEqual(await xShown(first), false, 'no Delete outside the Card editor');

        // In the editor: Delete, the editor's last and widest control.
        await edit(first);
        assert.strictEqual(await xShown(first), true, 'Delete shown in the Card editor');
        const box = await page.evaluate((sel) => {
            const a = $(sel)[0].getBoundingClientRect(), b = $(sel).find('.card-del')[0].getBoundingClientRect();
            const others = $(sel).children(':visible').not('.card-del').get().map((e) => e.getBoundingClientRect().bottom);
            return { text: getComputedStyle($(sel).find('.card-del')[0], '::before').content, last: others.every((y) => y <= b.top), wide: b.width >= a.width * 0.8 };
        }, first);
        assert.deepStrictEqual(box, { text: '"Delete"', last: true, wide: true }, 'Delete at the bottom of the editor');

        // Cancel on the prompt keeps the Card.
        const before = await texts();
        page.removeAllListeners('dialog');
        page.on('dialog', (d) => { dialogs.push(d.message().trim()); d.dismiss(); });
        await page.click(first + ' .card-del');
        await sleep(600);
        assert.deepStrictEqual(dialogs, ['Delete this Card?'], 'a Card with text asks first');
        assert.deepStrictEqual(await texts(), before, 'Cancel keeps the Card');

        // OK deletes it.
        page.removeAllListeners('dialog');
        page.on('dialog', (d) => { dialogs.push(d.message().trim()); d.accept(); });
        if (!(await xShown(first))) await edit(first);
        await page.click(first + ' .card-del');
        await sleep(600);
        await settle(page);
        assert.strictEqual(dialogs.length, 2, 'asked again');
        assert.deepStrictEqual(await texts(), before.slice(1), 'OK deletes the Card');
        assert.strictEqual(await page.evaluate(() => $('.wrap .board .list').eq(0).find('.card').length), before.length - 1, 'gone from the page');

        // Undo brings it back.
        await page.evaluate(() => $('.wrap .board .undo-board').click());
        await settle(page);
        assert.deepStrictEqual(await texts(), before, 'Undo restores the deleted Card');

        // An empty Card goes without asking.
        await page.evaluate(() => $('.wrap .board .list').eq(0).find('.add-card').click());
        await sleep(100);
        const fresh = '.wrap .board .card.editing';
        assert.strictEqual(await xShown(fresh), true, 'a new Card has Delete too');
        await page.click(fresh + ' .card-del');
        await sleep(600);
        await settle(page);
        assert.strictEqual(dialogs.length, 2, "an empty Card is not asked about: " + JSON.stringify(dialogs));
        assert.deepStrictEqual(await texts(), before, 'the empty Card is gone, the rest untouched');
        assert.strictEqual(await page.evaluate(() => $('.wrap .board .list').eq(0).find('.card').length), before.length);

        assert.deepStrictEqual(app.errors, [], 'no page errors');
    } finally {
        await app.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
