// On a touch screen, "+ Card" and the card menu's Edit open the Card editor:
// a big window near the top of the screen, over a dimmed board, with the
// Card's name, its Priority as four big buttons, the Schedule line while
// Recurring is picked, and Delete. There's no Done: a tap outside it, Enter
// or Back saves and closes. Its inputs are 16px or more, so iOS doesn't zoom
// in, and neither do List and board titles. Desktop keeps editing in place.
// Cards are saved as `notes`, Nullboard's name, so old boards, History days and export files load without a migration.
const assert = require('assert');
const { openApp, settle, sleep } = require('../lib');

const EDITOR = '[role=dialog][aria-label="Card editor"]';

(async () => {
    const app = await openApp(() => {});
    const { page } = app;
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await app.reload();
    await sleep(300);

    const saved = (list) => page.evaluate((list) => NB.board.lists[list].notes.map((n) => [n.text, n.priority]), list);
    const editorOpen = () => page.evaluate((sel) => $(sel).is(':visible'), EDITOR);
    const tapOutside = async () => { await page.touchscreen.tap(195, 790); await sleep(100); await settle(page); };
    const tapIn = async (sel) => { await page.tap(EDITOR + ' ' + sel); await sleep(50); };
    const addCard = async (list) => { await page.evaluate((list) => $('.wrap .board .list').eq(list).find('.add-card').click(), list); await sleep(100); };
    const undo = async () => { await page.evaluate(() => $('.wrap .board .undo-board').click()); await settle(page); };

    try {
        // "+ Card" opens the editor: big, near the top, the name box focused
        // and empty with its placeholder, and Low picked.
        const before = await saved(0);
        await addCard(0);
        assert.strictEqual(await editorOpen(), true, '"+ Card" opens the Card editor');
        const look = await page.evaluate((sel) => {
            const r = $(sel)[0].getBoundingClientRect(), f = document.activeElement;
            return {
                wide: r.width >= innerWidth * 0.9, nearTop: r.top >= 0 && r.top < innerHeight * 0.2,
                focused: $(sel)[0].contains(f) && f.tagName == 'TEXTAREA', value: f.value, placeholder: f.placeholder,
                picked: $(sel).find('[role=radio][aria-checked=true]:visible').map((_, b) => $(b).attr('aria-label')).get(),
                choices: $(sel).find('[role=radio]:visible').map((_, b) => $(b).attr('aria-label')).get(),
                bigChoices: $(sel).find('[role=radio]:visible').get().every((b) => b.getBoundingClientRect().height >= 40),
            };
        }, EDITOR);
        assert.deepStrictEqual(look, {
            wide: true, nearTop: true, focused: true, value: '', placeholder: 'Name of the Card',
            picked: ['Priority: Low'],
            choices: ['Priority: Recurring', 'Priority: Critical', 'Priority: Medium', 'Priority: Low'],
            bigChoices: true,
        }, 'how the editor opens');

        // Type a name, pick Critical: it shows as picked, nothing is saved yet.
        await page.keyboard.type('buy milk');
        await tapIn('[role=radio][aria-label="Priority: Critical"]');
        assert.strictEqual(await editorOpen(), true, 'picking a Priority keeps the editor open');
        assert.deepStrictEqual(await page.evaluate((sel) => $(sel).find('[role=radio][aria-checked=true]').attr('aria-label'), EDITOR), 'Priority: Critical');
        assert.deepStrictEqual(await saved(0), before, 'nothing saved before tapping outside');

        // A tap outside saves both and closes it; one Undo takes it back.
        await tapOutside();
        assert.strictEqual(await editorOpen(), false, 'a tap outside closes the editor');
        assert.deepStrictEqual((await saved(0)).filter((n) => n[0] == 'buy milk'), [['buy milk', 'critical']], 'saved with its Priority');
        await undo();
        assert.deepStrictEqual(await saved(0), before, 'one Undo takes the new Card back');

        // Edit, from the card menu, opens it filled in with the Card's name
        // and Priority. Enter saves and closes rather than starting a line.
        const first = '.wrap .board .list:nth-child(1) .card:nth-child(1)';
        const name = before[0][0]; // a demo board Card: Low, though it has no Priority saved until the board is
        await page.tap(first + ' .text');
        await sleep(450);
        await page.tap(first + ' [data-cm=edit]');
        await sleep(100);
        assert.strictEqual(await editorOpen(), true, 'Edit opens the Card editor');
        assert.deepStrictEqual(await page.evaluate((sel) => [document.activeElement.value, $(sel).find('[role=radio][aria-checked=true]').attr('aria-label')], EDITOR),
            [name, 'Priority: Low'], 'filled in with the Card');
        await page.keyboard.press('End');
        await page.keyboard.type(' today');
        await page.keyboard.press('Enter');
        await sleep(100);
        await settle(page);
        assert.strictEqual(await editorOpen(), false, 'Enter closes the editor');
        assert.deepStrictEqual((await saved(0))[0], [name + ' today', 'low'], 'Enter saves the name, on one line');
        assert.strictEqual(await page.evaluate((sel) => $(sel).hasClass('cm-open'), first), false, 'the card menu stays shut afterwards');

        // Emptying the name keeps the old one.
        await page.tap(first + ' .text');
        await sleep(450);
        await page.tap(first + ' [data-cm=edit]');
        await sleep(100);
        await page.evaluate(() => { const f = document.activeElement; f.select(); });
        await page.keyboard.press('Backspace');
        await tapOutside();
        assert.deepStrictEqual((await saved(0))[0], [name + ' today', 'low'], 'an emptied name keeps the old one');

        // A new Card left empty is thrown away.
        const now = await saved(0);
        await addCard(0);
        await tapOutside();
        assert.strictEqual(await editorOpen(), false);
        assert.deepStrictEqual(await saved(0), now, 'an empty new Card is thrown away');
        assert.strictEqual(await page.evaluate(() => $('.wrap .board .list').eq(0).find('.card').length), now.length, 'and gone from the page');

        // Delete asks first: Cancel keeps the Card and the editor open, OK
        // deletes it and closes the editor.
        const edit = async (sel) => { await page.tap(sel + ' .text'); await sleep(450); await page.tap(sel + ' [data-cm=edit]'); await sleep(100); };
        const dialogs = [];
        const answer = (ok) => { page.removeAllListeners('dialog'); page.on('dialog', (d) => { dialogs.push(d.message().trim()); ok ? d.accept() : d.dismiss(); }); };
        answer(false);
        await edit(first);
        await tapIn('.card-del');
        await sleep(100);
        assert.deepStrictEqual(dialogs, ['Delete this Card?'], 'Delete asks first');
        assert.strictEqual(await editorOpen(), true, 'Cancel keeps the editor open');
        assert.deepStrictEqual(await saved(0), now, 'and the Card');
        answer(true);
        await tapIn('.card-del');
        await sleep(600);
        await settle(page);
        assert.strictEqual(await editorOpen(), false, 'OK closes the editor');
        assert.deepStrictEqual(await saved(0), now.slice(1), 'and deletes the Card');
        assert.strictEqual(await page.evaluate(() => $('.card-editor-backdrop').length), 0, 'the board is no longer dimmed');

        // A new, empty Card is deleted without asking.
        await addCard(0);
        await tapIn('.card-del');
        await sleep(600);
        await settle(page);
        assert.strictEqual(dialogs.length, 2, 'an empty Card is not asked about');
        assert.strictEqual(await editorOpen(), false);
        assert.deepStrictEqual(await saved(0), now.slice(1));

        // Recurring shows the Schedule line, in the editor and 16px; saving
        // keeps the Schedule as filled in.
        await addCard(0);
        await page.keyboard.type('water plants');
        assert.strictEqual(await page.evaluate((sel) => $(sel).find('.card-schedule').is(':visible'), EDITOR), false, 'no Schedule line for Low');
        await tapIn('[role=radio][aria-label="Priority: Recurring"]');
        const line = await page.evaluate((sel) => {
            const $l = $(sel).find('.card-schedule');
            const e = $(sel)[0].getBoundingClientRect(), l = $l[0].getBoundingClientRect();
            return { shown: $l.is(':visible'), inside: l.top >= e.top && l.bottom <= e.bottom, sizes: $l.find('input, select').map((_, i) => parseFloat(getComputedStyle(i).fontSize)).get() };
        }, EDITOR);
        assert.deepStrictEqual(line, { shown: true, inside: true, sizes: [16, 16, 16] }, 'the Schedule line, in the editor');
        await tapIn('.sched-every');
        await page.evaluate(() => document.activeElement.select());
        await page.keyboard.type('2');
        assert.strictEqual(await editorOpen(), true, 'filling in the Schedule keeps the editor open');
        await tapOutside();
        const plants = await page.evaluate(() => NB.board.lists.flatMap((l) => l.notes).filter((n) => n.text == 'water plants').map((n) => [n.priority, n.schedule.every, n.schedule.unit]));
        assert.deepStrictEqual(plants, [['recurring', 2, 'weeks']], 'saved Recurring, every 2 weeks');

        // Back closes and saves too, and the editor leaves no history behind.
        await addCard(0);
        await page.keyboard.type('call home');
        await page.evaluate(() => history.back());
        await sleep(200);
        await settle(page);
        assert.strictEqual(await editorOpen(), false, 'Back closes the editor');
        assert.deepStrictEqual((await saved(0)).filter((n) => n[0] == 'call home'), [['call home', 'low']], 'and saves the Card');
        await addCard(0);
        await page.keyboard.type('pay rent');
        await tapOutside();
        await sleep(200);
        assert.strictEqual(await page.evaluate(() => !! (history.state && history.state.cardEditor)), false, 'a tap outside takes back its history entry');
        assert.ok(await page.evaluate(() => $('.wrap .board').length == 1), 'still on the board');

        // Nothing zooms: List and board titles are 16px on a touch screen.
        const titles = await page.evaluate(() => $('.wrap .board .head .edit').map((_, i) => parseFloat(getComputedStyle(i).fontSize)).get());
        assert.ok(titles.length > 1 && titles.every((s) => s >= 16), 'List and board title inputs are 16px or more: ' + titles);
        await addCard(0);
        assert.ok(await page.evaluate(() => parseFloat(getComputedStyle(document.activeElement).fontSize)) >= 16, "the editor's name box is 16px or more");
        await tapOutside();

        // A phone keyboard whose Enter only says it would break the line
        // saves and closes too.
        await addCard(0);
        await page.keyboard.type('fix bike');
        await page.evaluate(() => document.activeElement.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertLineBreak', bubbles: true, cancelable: true })));
        await sleep(100);
        await settle(page);
        assert.strictEqual(await editorOpen(), false, 'a line break closes the editor');
        assert.deepStrictEqual((await saved(0)).filter((n) => n[0] == 'fix bike'), [['fix bike', 'low']], 'and saves the Card, on one line');

        // Desktop keeps editing in place.
        await page.setViewport({ width: 1280, height: 1000 });
        await app.reload();
        await sleep(300);
        await page.evaluate(() => $('.wrap .board .list').eq(0).find('.add-card').click());
        await sleep(100);
        assert.strictEqual(await page.evaluate((sel) => [$(sel).length, $('.wrap .board .card.editing').length], EDITOR).then((r) => r.join()), '0,1', 'no editor on desktop: the Card edits in place');

        assert.deepStrictEqual(app.errors, [], 'no page errors');
    } finally {
        await app.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
