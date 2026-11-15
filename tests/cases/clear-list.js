// "Clear" empties a list's notes but keeps the list, survives a reload, and
// Undo brings the notes back.
const assert = require('assert');
const { openApp, settle } = require('../lib');

(async () => {
    const app = await openApp();
    const { page } = app;
    try {
        const counts = () => page.evaluate(() => $('.wrap .list').map((_, l) => $(l).find('.note').length).get());

        const before = await counts();
        assert.ok(before.length >= 2 && before[0] > 0, 'demo board should start with notes in its first list');

        await page.evaluate(() => $('.wrap .list').first().find('.clr-list').click());
        await settle(page);

        const after = await counts();
        assert.strictEqual(after.length, before.length, 'the list itself must stay');
        assert.strictEqual(after[0], 0, 'first list should be empty');
        assert.deepStrictEqual(after.slice(1), before.slice(1), 'other lists untouched');

        await app.reload();
        assert.deepStrictEqual(await counts(), after, 'cleared state persists');

        await page.evaluate(() => $('.wrap .board > .head .undo-board').click());
        await settle(page);
        assert.deepStrictEqual(await counts(), before, 'undo restores the notes');

        assert.deepStrictEqual(app.errors, [], 'no page errors');
    } finally {
        await app.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
