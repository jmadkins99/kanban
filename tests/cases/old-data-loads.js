// Data saved before Cards were called Cards still loads unchanged: a board in
// localStorage, its History entries and an old export file. Each keeps its
// Cards under Nullboard's `notes` field, and saving or exporting still writes
// that field, so nothing on disk or in the cloud needs migrating. Cards from
// before Priorities, in any of them, are Low.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openApp, seedBoard } = require('../lib');

const LISTS = [
    { title: 'To-Do', notes: [{ text: 'plain card', raw: false, min: false }, { text: 'raw card', raw: true, min: false }] },
    { title: 'WIP', notes: [{ text: 'timed card\nsecond line', raw: false, min: true, wip: 1700000000000 }] },
    { title: 'Done', notes: [{ text: 'done card', raw: false, min: false, xp: 2500, xpId: 'old-1' }] },
];

(async () => {
    // Exactly what the app wrote to localStorage before the rename.
    const app = await openApp(seedBoard({ id: 77, title: 'Saved earlier', lists: LISTS }, [{
        day: '2026-01-05', title: 'Saved earlier', submittedAt: '2026-01-05T20:00:00.000Z', lists: LISTS,
    }]), { demo: false });
    const { page } = app;
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kanban-')), 'old.nbx');

    // What each List on screen shows: its title, then each Card's text. (Raw and
    // collapsed Cards show as normal ones; raw-collapsed.js covers that.)
    const shown = () => page.evaluate(() => $('.wrap .board .list').map((_, l) => ({
        title: $(l).find('.head .text').text(),
        cards: $(l).find('.text').not('.head .text').map((_, t) => $(t).attr('_text')).get(),
    })).get());
    const expected = (lists) => lists.map((l) => ({ title: l.title, cards: l.notes.map((n) => n.text) }));
    // The Priority each Card's icon shows, List by List.
    const icons = () => page.evaluate(() => $('.wrap .board .list').map((_, l) => [$(l).find('.card .card-prio').map((_, i) => $(i).attr('aria-label')).get()]).get());
    const allLow = (lists) => lists.map((l) => l.notes.map(() => 'Priority: Low'));
    const strip = (lists) => lists.map((l) => ({ title: l.title, notes: l.notes.map(({ text, wip, xp, xpId }) => ({ text, wip, xp, xpId })) }));

    try {
        // The saved board opens with every Card and its state.
        assert.strictEqual(await page.evaluate(() => NB.board.title), 'Saved earlier');
        assert.deepStrictEqual(await shown(), expected(LISTS), 'the saved board shows its Cards');
        assert.deepStrictEqual(strip(await page.evaluate(() => NB.board.lists)), strip(LISTS), 'WIP start and XP survive');
        assert.strictEqual(await page.evaluate(() => XP.total()), 2500, "the Done Card's XP counts");
        assert.deepStrictEqual(await icons(), allLow(LISTS), 'every saved Card shows as Low');

        // Saving writes the same field back.
        await page.evaluate(() => saveBoard());
        const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('nullboard.board.77.' + NB.board.revision)));
        assert.deepStrictEqual(strip(saved.lists), strip(LISTS), 'a save keeps the Cards under notes');
        assert.deepStrictEqual(saved.lists.map((l) => l.notes.map((n) => n.priority)), LISTS.map((l) => l.notes.map(() => 'low')), 'a save stores them as Low');

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
        const dayIcons = await page.evaluate(() => $('.history .history-item[data-day="2026-01-05"] .history-list').map((_, l) =>
            [$(l).find('.history-card').map((_, n) => $(n).find('[role=img]').attr('aria-label')).get()]).get());
        assert.deepStrictEqual(dayIcons, allLow(LISTS), 'History shows the old Cards as Low');
        await page.evaluate(() => showView('board'));

        // An old export file imports with its Cards.
        const imported = [{ title: 'Imported', notes: [{ text: 'from the file', raw: true, min: false }] }];
        fs.writeFileSync(file, JSON.stringify({ format: 20190412, id: 9, revision: 3, title: 'Old export', lists: imported }));
        await (await page.$('.config .imp-board-select')).uploadFile(file);
        await page.waitForFunction(() => NB.board.title == 'Old export');
        assert.deepStrictEqual(await shown(), expected(imported), 'the old export shows its Cards');
        assert.deepStrictEqual(await icons(), allLow(imported), "the old export's Cards show as Low");

        assert.deepStrictEqual(app.errors, [], 'no page errors');
    } finally {
        await app.close();
        fs.rmSync(path.dirname(file), { recursive: true, force: true });
    }
})().catch((e) => { console.error(e); process.exit(1); });
