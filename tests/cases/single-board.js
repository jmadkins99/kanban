// One board only: no way to add or delete boards, the menu lists the one
// board, and Import replaces it (as a new revision, so Undo brings it back).
// Cards are saved as `notes`, Nullboard's name, so old boards, History days and export files load without a migration.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openApp, settle } = require('../lib');

(async () => {
    const app = await openApp(() => {});
    const { page } = app;
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kanban-')), 'board.nbx');
    try {
        assert.strictEqual(await page.$$eval('.add-board, .del-board', (els) => els.length), 0, 'no add/delete board');
        assert.strictEqual(await page.$$eval('.config .load-board', (els) => els.length), 1, 'menu lists the one board');
        assert.strictEqual(await page.evaluate(() => cloudSync.ready), 'off', 'off the live site, sync stays off');
        assert.ok(await page.evaluate(() => typeof firebase == 'undefined' && $('.config .sync-in').css('display') == 'none'),
            'no Firebase SDK and no sign-in item unless opted in');

        const before = await page.evaluate(() => ({ id: NB.board.id, lists: NB.board.lists.length }));
        fs.writeFileSync(file, JSON.stringify({
            format: 20190412, id: 42, revision: 7, title: 'Imported',
            lists: [{ title: 'Only', notes: [{ text: 'hi', raw: false, min: false }] }],
        }));
        await (await page.$('.config .imp-board-select')).uploadFile(file);
        await page.waitForFunction(() => NB.board.title == 'Imported');

        const after = await page.evaluate(() => ({ id: NB.board.id, lists: NB.board.lists.length }));
        assert.deepStrictEqual(after, { id: before.id, lists: 1 }, 'import replaced the board, same id');
        assert.strictEqual(await page.$$eval('.config .load-board', (els) => els.length), 1, 'still one board');

        await page.evaluate(() => $('.wrap .board .undo-board').click());
        await settle(page);
        assert.strictEqual(await page.evaluate(() => NB.board.lists.length), before.lists, 'undo restores the old board');

        await app.reload();
        assert.strictEqual(await page.evaluate(() => NB.board.lists.length), before.lists, 'reload opens the one board');

        assert.deepStrictEqual(app.errors, [], 'no page errors');
    } finally {
        await app.close();
        fs.rmSync(path.dirname(file), { recursive: true, force: true });
    }
})().catch((e) => { console.error(e); process.exit(1); });
