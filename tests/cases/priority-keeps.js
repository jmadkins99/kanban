// A Card's Priority is stored on the Card, so it survives a reload, export
// and import, and the day being filed into History, where its icon shows.
// Cards are saved as `notes`, Nullboard's name, so old boards, History days and export files load without a migration.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openApp, settle, sleep, fakeClock, setPriority: setPriorityOn } = require('../lib');

(async () => {
    const app = await openApp(fakeClock('2028-11-15 12:00'));
    const { page } = app;
    await page.setViewport({ width: 1280, height: 1000 });
    await sleep(300);
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kanban-')), 'board.nbx');

    const card = (i) => `.wrap .board .list:nth-child(1) .card:nth-child(${i + 1})`;
    const setPriority = (i, priority) => setPriorityOn(page, card(i), priority);
    // The first three Cards of the first List: text and the Priority its icon shows.
    const shown = () => page.evaluate(() => $('.wrap .board .list').eq(0).find('.card').slice(0, 3)
        .map((_, c) => [[getText($(c).find('.text')), $(c).find('.card-prio').attr('aria-label')]]).get());

    try {
        await setPriority(0, 'Critical');
        await setPriority(1, 'Medium');
        await setPriority(2, 'Recurring');
        const want = await shown();
        assert.deepStrictEqual(want.map((c) => c[1]), ['Priority: Recurring', 'Priority: Critical', 'Priority: Medium'], 'sorted by Priority');

        // A reload keeps them.
        await app.reload();
        assert.deepStrictEqual(await shown(), want, 'kept across a reload');

        // Export, change one, then import the file: the exported Priorities come back.
        const exported = await page.evaluate(() => decodeURIComponent(exportBoard().blob.replace(/^data:[^,]*,/, '')));
        fs.writeFileSync(file, exported);
        await setPriority(0, 'Low');
        assert.strictEqual((await shown())[0][1], 'Priority: Critical', 'the Recurring Card is Low now');
        await (await page.$('.config .imp-board-select')).uploadFile(file);
        await page.waitForFunction(() => $('.wrap .board .card-prio').first().attr('aria-label') == 'Priority: Recurring');
        assert.deepStrictEqual(await shown(), want, 'kept through export and import');

        // The day is filed (the board last changed days ago): History shows the icons.
        const lastDay = await page.evaluate(() => { const d = new Date(); d.setDate(d.getDate() - 3); return dayKey(d); });
        await page.evaluate((day) => { NB.board.day = day; NB.storage.saveBoard(NB.board); }, lastDay);
        await app.reload();
        await settle(page);
        await page.evaluate(() => $('.config .view-history').click());
        if (!(await page.$(`.history-item[data-day="${lastDay}"]`))) await page.click('.week-prev');
        const day = await page.evaluate((day) => $(`.history-item[data-day="${day}"] .history-list`).first().find('.history-card').slice(0, 3)
            .map((_, n) => [[$(n).text(), $(n).find('[role=img]').attr('aria-label')]]).get(), lastDay);
        assert.deepStrictEqual(day, want, 'History shows each Card with its icon');
        assert.strictEqual(await page.evaluate((day) => $(`.history-item[data-day="${day}"] .wip-timer`).length, lastDay), 0, 'and no timers');

        assert.deepStrictEqual(app.errors, [], 'no page errors');
    } finally {
        await app.close();
        fs.rmSync(path.dirname(file), { recursive: true, force: true });
    }
})().catch((e) => { console.error(e); process.exit(1); });
