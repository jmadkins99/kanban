// Data saved before Cards were called Cards still loads unchanged: a board in
// localStorage, its History entries and an old export file. Each keeps its
// Cards under Nullboard's `notes` field, and saving or exporting still writes
// that field, so nothing on disk or in the cloud needs migrating.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openApp } = require('../lib');

const LISTS = [
    { title: 'To-Do', notes: [{ text: 'plain card', raw: false, min: false }, { text: 'raw card', raw: true, min: false }] },
    { title: 'WIP', notes: [{ text: 'timed card\nsecond line', raw: false, min: true, wip: 1700000000000 }] },
    { title: 'Done', notes: [{ text: 'done card', raw: false, min: false, xp: 2500, xpId: 'old-1' }] },
];

(async () => {
    // Exactly what the app wrote to localStorage before the rename.
    const app = await openApp(`(${(lists) => {
        if (localStorage.getItem('nullboard.last_board')) return; // seed only on the first load
        const board = { format: 20190412, id: 77, revision: 1, title: 'Saved earlier', lists };
        localStorage.setItem('nullboard.board.77.1', JSON.stringify(board));
        localStorage.setItem('nullboard.board.77.meta', JSON.stringify({ title: 'Saved earlier', current: 1, history: [1] }));
        localStorage.setItem('nullboard.board.77', '1');
        localStorage.setItem('nullboard.last_board', '77');
        localStorage.setItem('nullboard.history', JSON.stringify([{
            day: '2026-01-05', title: 'Saved earlier', submittedAt: '2026-01-05T20:00:00.000Z', lists,
        }]));
    }})(${JSON.stringify(LISTS)})`, { demo: false });
    const { page } = app;
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kanban-')), 'old.nbx');

    // What each List on screen shows: its title, then each Card's text and look.
    const shown = () => page.evaluate(() => $('.wrap .board .list').map((_, l) => ({
        title: $(l).find('.head .text').text(),
        cards: $(l).find('.text').not('.head .text').map((_, t) => ({
            text: $(t).attr('_text'),
            raw: $(t).parent().hasClass('raw'),
            min: $(t).parent().hasClass('collapsed'),
        })).get(),
    })).get());
    const expected = (lists) => lists.map((l) => ({ title: l.title, cards: l.notes.map((n) => ({ text: n.text, raw: n.raw, min: n.min })) }));
    const strip = (lists) => lists.map((l) => ({ title: l.title, notes: l.notes.map(({ text, raw, min, wip, xp, xpId }) => ({ text, raw, min, wip, xp, xpId })) }));

    try {
        // The saved board opens with every Card, its look and its state.
        assert.strictEqual(await page.evaluate(() => NB.board.title), 'Saved earlier');
        assert.deepStrictEqual(await shown(), expected(LISTS), 'the saved board shows its Cards');
        assert.deepStrictEqual(strip(await page.evaluate(() => NB.board.lists)), strip(LISTS), 'WIP start and XP survive');
        assert.strictEqual(await page.evaluate(() => XP.total()), 2500, "the Done Card's XP counts");

        // Saving writes the same field back.
        await page.evaluate(() => saveBoard());
        const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('nullboard.board.77.' + NB.board.revision)));
        assert.deepStrictEqual(strip(saved.lists), strip(LISTS), 'a save keeps the Cards under notes');

        // Export writes it too.
        const exported = await page.evaluate(() => JSON.parse(decodeURIComponent(exportBoard().blob.replace(/^data:[^,]*,/, ''))));
        assert.deepStrictEqual(strip(exported.lists), strip(LISTS), 'an export keeps the Cards under notes');

        // The old History entry shows its Cards.
        await page.evaluate(() => $('.config .view-history').click());
        for (let i = 0; i < 200 && !(await page.$('.history .history-item[data-day="2026-01-05"]')); i++)
            await page.click('.week-prev');
        const day = await page.evaluate(() => $('.history .history-item[data-day="2026-01-05"] .history-list').map((_, l) => ({
            title: $(l).find('.history-list-title').text(),
            cards: $(l).children().not('.history-list-title').map((_, n) => $(n).text()).get(),
        })).get());
        assert.deepStrictEqual(day, LISTS.map((l) => ({ title: l.title, cards: l.notes.map((n) => n.text) })), 'History shows the old Cards');
        await page.evaluate(() => showView('board'));

        // An old export file imports with its Cards.
        const imported = [{ title: 'Imported', notes: [{ text: 'from the file', raw: true, min: false }] }];
        fs.writeFileSync(file, JSON.stringify({ format: 20190412, id: 9, revision: 3, title: 'Old export', lists: imported }));
        await (await page.$('.config .imp-board-select')).uploadFile(file);
        await page.waitForFunction(() => NB.board.title == 'Old export');
        assert.deepStrictEqual(await shown(), expected(imported), 'the old export shows its Cards');

        assert.deepStrictEqual(app.errors, [], 'no page errors');
    } finally {
        await app.close();
        fs.rmSync(path.dirname(file), { recursive: true, force: true });
    }
})().catch((e) => { console.error(e); process.exit(1); });
