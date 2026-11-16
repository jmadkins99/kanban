// A first visit starts with four empty lists: Backlog, To-Do, WIP, Done,
// already stored (so a reload keeps them) and working as WIP and Done.
const assert = require('assert');
const { openApp } = require('../lib');

(async () => {
    const app = await openApp(() => {}, { demo: false });
    const { page } = app;
    try {
        const board = () => page.evaluate(() => ({
            title: NB.board.title,
            lists: NB.board.lists.map((l) => l.title + ':' + l.notes.length),
            kinds: $('.wrap .board .list').map((_, l) => (l.classList.contains('wip-list') ? 'wip' : l.classList.contains('done-list') ? 'done' : '-')).get().join(' '),
        }));
        const want = { title: 'Welcome to Kanban', lists: ['Backlog:0', 'To-Do:0', 'WIP:0', 'Done:0'], kinds: '- - wip done' };
        assert.deepStrictEqual(await board(), want);
        await app.reload();
        assert.deepStrictEqual(await board(), want, 'stored, so a reload keeps it');
        assert.strictEqual(await page.evaluate(() => NB.storage.getBoardIndex().size), 1, 'one board');
        assert.deepStrictEqual(app.errors, [], 'no page errors');
    } finally {
        await app.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
