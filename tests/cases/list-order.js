// Lists sort themselves: Recurring, then Critical, Medium and Low from the
// top, first in, first out by Arrival within each. Done ignores Priority and
// reads as the day in order, oldest Arrival on top.
// Cards are saved as `notes`, Nullboard's name, so old boards, History days and export files load without a migration.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openApp, settle, moveCard, sleep, seedBoard, fakeClock, clickAway, pickPriority, setPriority } = require('../lib');

// A board saved before Arrivals: Priorities, but no Arrival on any Card.
const LISTS = [
    { title: 'Backlog', notes: [{ text: 'old 1' }, { text: 'old 2' }, { text: 'old 3' }] },
    { title: 'To-Do', notes: [
        { text: 'a', priority: 'low' }, { text: 'b', priority: 'critical' }, { text: 'c', priority: 'recurring' },
        { text: 'd', priority: 'medium' }, { text: 'e', priority: 'low' }, { text: 'f', priority: 'critical' },
    ] },
    { title: 'WIP', notes: [] },
    { title: 'Done', notes: [{ text: 'done low', priority: 'low' }, { text: 'done critical', priority: 'critical' }] },
];

(async () => {
    const app = await openApp([fakeClock('2028-11-15 12:00'), seedBoard({ id: 77, title: 'Saved earlier', lists: LISTS })], { demo: false });
    const { page } = app;
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kanban-')), 'board.nbx');
    await page.setViewport({ width: 1280, height: 1000 });
    await sleep(300);

    // Picks a Priority for the Card with this text, the way a person does:
    // tap it, Edit, the Priority in the Card editor, then click away.
    const pick = async (text, priority) => {
        const at = await page.evaluate((text) => {
            const $c = $('.wrap .board .card').filter((_, c) => $(c).find('.text').attr('_text') == text);
            return [$c.closest('.list').index() + 1, $c.index() + 1];
        }, text);
        await setPriority(page, `.wrap .board .list:nth-child(${at[0]}) .card:nth-child(${at[1]})`, priority);
    };
    // Each List's Cards on screen, top to bottom, by their text.
    const shown = () => page.evaluate(() => $('.wrap .board .list').map((_, l) => [$(l).find('.card .text').map((_, t) => $(t).attr('_text')).get()]).get());

    try {
        assert.deepStrictEqual(await shown(), [
            ['old 1', 'old 2', 'old 3'],
            ['c', 'b', 'f', 'd', 'a', 'e'],
            [],
            ['done low', 'done critical'],
        ], 'tiers from the top, saved order kept within each; Done keeps its order');

        // A Card moved into a List goes to the bottom of its tier.
        await moveCard(page, 0, 1, 1); // old 2 (Low) into To-Do
        await moveCard(page, 1, 1, -1); // b (Critical) back to Backlog
        assert.deepStrictEqual((await shown()).slice(0, 2), [
            ['b', 'old 1', 'old 3'],
            ['c', 'f', 'd', 'a', 'e', 'old 2'],
        ], 'each moved Card lands at the bottom of its tier');
        await moveCard(page, 0, 0, 1); // b into To-Do again
        assert.deepStrictEqual((await shown())[1], ['c', 'f', 'b', 'd', 'a', 'e', 'old 2'], 'b is now the last Critical in');

        // Changing a Card's Priority puts it at the bottom of its new tier.
        await pick('a', 'Critical');
        assert.deepStrictEqual((await shown())[1], ['c', 'f', 'b', 'a', 'd', 'e', 'old 2'], 'a joins the back of Critical');
        await pick('c', 'Low');
        assert.deepStrictEqual((await shown())[1], ['f', 'b', 'a', 'd', 'e', 'old 2', 'c'], 'c joins the back of Low');

        // Done ignores Priority: oldest Arrival on top, so it reads as the day in order.
        await moveCard(page, 1, 4, 2); // e (Low), through WIP into Done
        await moveCard(page, 1, 0, 2); // f (Critical)
        assert.deepStrictEqual((await shown())[3], ['done low', 'done critical', 'e', 'f'], 'Done is in Arrival order');

        // A new Card picked as Critical before it's first saved lands at the bottom of Critical.
        await page.evaluate(() => $('.wrap .board .list').eq(1).find('.add-card').click());
        await sleep(100);
        await page.keyboard.type('g');
        await pickPriority(page, '.wrap .board .card.editing', 'Critical');
        await clickAway(page);
        const board = await shown();
        assert.deepStrictEqual(board[1], ['b', 'a', 'g', 'd', 'old 2', 'c'], 'g is the last Critical in');

        // The order is the same after a reload, an Undo and a Redo.
        await app.reload();
        assert.deepStrictEqual(await shown(), board, 'same after a reload');
        await page.evaluate(() => $('.wrap .board .undo-board').click());
        await settle(page);
        assert.deepStrictEqual((await shown())[1], ['b', 'a', 'd', 'old 2', 'c'], 'Undo takes g away');
        await page.evaluate(() => $('.wrap .board .redo-board').click());
        await settle(page);
        assert.deepStrictEqual(await shown(), board, 'Redo brings it back in place');

        // Arrival is stored on the Card, so it survives export and import...
        const arrivals = () => page.evaluate(() => NB.board.lists.map((l) => l.notes.map((n) => [n.text, n.arrival])));
        const kept = await arrivals();
        assert.ok(kept.every((l) => l.every(([, a]) => typeof a == 'number')), 'every Card has an Arrival');
        fs.writeFileSync(file, await page.evaluate(() => decodeURIComponent(exportBoard().blob.replace(/^data:[^,]*,/, ''))));
        await pick('b', 'Low');
        assert.notDeepStrictEqual(await arrivals(), kept);
        await (await page.$('.config .imp-board-select')).uploadFile(file);
        await page.waitForFunction(() => $('.wrap .board .list').eq(1).find('.card .text').first().attr('_text') == 'b');
        await settle(page);
        assert.deepStrictEqual(await arrivals(), kept, 'Arrivals come back with an import');
        assert.deepStrictEqual(await shown(), board, 'and so does the order');

        // ...and the day being filed into History.
        const lastDay = await page.evaluate(() => { const d = new Date(); d.setDate(d.getDate() - 3); return dayKey(d); });
        await page.evaluate((day) => { NB.board.day = day; NB.storage.saveBoard(NB.board); }, lastDay);
        await app.reload();
        await settle(page);
        const filed = await page.evaluate((day) => loadHistory().find((e) => e.day == day).lists.map((l) => l.notes.map((n) => [n.text, n.arrival])), lastDay);
        assert.deepStrictEqual(filed, kept, 'History keeps each Arrival');

        assert.deepStrictEqual(app.errors, [], 'no page errors');
    } finally {
        await app.close();
        fs.rmSync(path.dirname(file), { recursive: true, force: true });
    }
})().catch((e) => { console.error(e); process.exit(1); });
