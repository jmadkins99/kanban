// On desktop, a Card is edited the way it is on a touch screen: the card
// menu's Edit and "+ Card" open the Card editor, and no Card edits in place.
// Enter, Esc and a click outside each save and close it; there's no cancel.
// Its Priority choices, the Schedule line and Delete work with a mouse. On a
// wide window it's a sensible width. List and board titles still edit in
// place, as they aren't Cards.
// Cards are saved as `notes`, Nullboard's name, so old boards, History days and export files load without a migration.
const assert = require('assert');
const { openApp, settle, sleep, clickAway, editCard } = require('../lib');

const EDITOR = '[role=dialog][aria-label="Card editor"]';

(async () => {
    const app = await openApp(() => {});
    const { page } = app;
    await page.setViewport({ width: 1280, height: 1000 });
    await app.reload();
    await sleep(300);

    const card = (l, i) => `.wrap .board .list:nth-child(${l + 1}) .card:nth-child(${i + 1})`;
    const saved = (list) => page.evaluate((list) => NB.board.lists[list].notes.map((n) => [n.text, n.priority]), list);
    const editorOpen = () => page.evaluate((sel) => $(sel).is(':visible'), EDITOR);
    const inPlace = () => page.evaluate((sel) => $('.wrap .board .card.editing').not(sel).length, EDITOR);
    const edit = (sel) => editCard(page, sel);
    const addCard = async (list) => {
        await page.hover(`.wrap .board .list:nth-child(${list + 1}) > .head .menu`);
        await sleep(100);
        await page.click(`.wrap .board .list:nth-child(${list + 1}) .add-card`);
        await sleep(100);
    };
    const clickIn = async (sel) => { await page.click(EDITOR + ' ' + sel); await sleep(50); };

    try {
        // Edit, from the card menu, opens the editor filled in with the Card.
        const before = await saved(0);
        await edit(card(0, 0));
        assert.strictEqual(await editorOpen(), true, 'Edit opens the Card editor');
        assert.strictEqual(await inPlace(), 0, 'nothing edits in place');
        assert.deepStrictEqual(await page.evaluate((sel) => [document.activeElement.value, $(sel)[0].contains(document.activeElement),
            $(sel).find('[role=radio][aria-checked=true]').attr('aria-label')], EDITOR),
            [before[0][0], true, 'Priority: Low'], 'filled in with the Card, its name focused');

        // On a wide window it isn't a stretched phone screen: at most 560px
        // wide, centred, near the top.
        const box = await page.evaluate((sel) => {
            const r = $(sel)[0].getBoundingClientRect();
            return { narrow: r.width >= 360 && r.width <= 560, centred: Math.abs(r.left + r.width / 2 - innerWidth / 2) <= 2, nearTop: r.top >= 0 && r.top < innerHeight * 0.2 };
        }, EDITOR);
        assert.deepStrictEqual(box, { narrow: true, centred: true, nearTop: true }, 'its size and place on a wide window');
        await clickAway(page);
        assert.strictEqual(await editorOpen(), false, 'a click outside closes it');

        // "+ Card" opens a new Card in the editor.
        await addCard(0);
        assert.strictEqual(await editorOpen(), true, '"+ Card" opens the Card editor');
        assert.strictEqual(await inPlace(), 0, 'nothing edits in place');
        assert.strictEqual(await page.evaluate(() => document.activeElement.value), '', 'a new Card starts empty');
        await clickAway(page);

        // Enter, Esc and a click outside each save the name and close the
        // editor; Enter doesn't start a new line.
        const name = before[0][0];
        for (const [how, close] of [
            ['Enter', () => page.keyboard.press('Enter')],
            ['Esc', () => page.keyboard.press('Escape')],
            ['a click outside', () => clickAway(page)],
        ]) {
            await edit(card(0, 0));
            await page.keyboard.press('End');
            await page.keyboard.type(' ' + how);
            await close();
            await sleep(100);
            await settle(page);
            assert.strictEqual(await editorOpen(), false, how + ' closes the editor');
            assert.deepStrictEqual((await saved(0))[0], [name + ' ' + how, 'low'], how + ' saves the name, on one line');
            await page.evaluate(() => $('.wrap .board .undo-board').click());
            await settle(page);
            assert.strictEqual((await saved(0))[0][0], name, "the menu's Undo takes it back");
            assert.strictEqual(await page.evaluate((sel) => $(sel).hasClass('cm-open'), card(0, 0)), false, 'the card menu stays shut');
        }

        // A click on a blank part of the editor takes the focus off the name;
        // Esc and Enter still save and close it.
        for (const key of ['Escape', 'Enter']) {
            await edit(card(0, 0));
            await page.keyboard.press('End');
            await page.keyboard.type('!');
            const r = await page.evaluate((sel) => { const b = $(sel)[0].getBoundingClientRect(); return [b.left + 6, b.bottom - 6]; }, EDITOR);
            await page.mouse.click(r[0], r[1]);
            await sleep(50);
            assert.strictEqual(await editorOpen(), true, 'a click inside keeps it open');
            await page.keyboard.press(key);
            await sleep(100);
            await settle(page);
            assert.strictEqual(await editorOpen(), false, key + ' after a click on its blank part closes it');
            assert.strictEqual((await saved(0))[0][0], name + '!', 'and saves');
            await page.evaluate(() => $('.wrap .board .undo-board').click());
            await settle(page);
        }

        // A Priority clicked shows as picked and saves on a click outside.
        await addCard(0);
        await page.keyboard.type('buy milk');
        await clickIn('[role=radio][aria-label="Priority: Critical"]');
        assert.strictEqual(await editorOpen(), true, 'picking a Priority keeps the editor open');
        assert.strictEqual(await page.evaluate((sel) => $(sel).find('[role=radio][aria-checked=true]').attr('aria-label'), EDITOR), 'Priority: Critical');
        await clickAway(page);
        assert.deepStrictEqual((await saved(0)).filter((n) => n[0] == 'buy milk'), [['buy milk', 'critical']], 'saved with its Priority');

        // Recurring shows the Schedule line; clicking into it keeps the editor
        // open, and Esc from there saves it too.
        await addCard(0);
        await page.keyboard.type('water plants');
        assert.strictEqual(await page.evaluate((sel) => $(sel).find('.card-schedule').is(':visible'), EDITOR), false, 'no Schedule line for Low');
        await clickIn('[role=radio][aria-label="Priority: Recurring"]');
        assert.strictEqual(await page.evaluate((sel) => $(sel).find('.card-schedule').is(':visible'), EDITOR), true, 'the Schedule line for Recurring');
        await clickIn('.sched-every');
        await page.evaluate(() => document.activeElement.select());
        await page.keyboard.type('2');
        assert.strictEqual(await editorOpen(), true, 'filling in the Schedule keeps the editor open');
        await page.keyboard.press('Escape');
        await sleep(100);
        await settle(page);
        assert.strictEqual(await editorOpen(), false, 'Esc in the Schedule line closes the editor');
        const plants = await page.evaluate(() => NB.board.lists.flatMap((l) => l.notes).filter((n) => n.text == 'water plants').map((n) => [n.priority, n.schedule.every, n.schedule.unit]));
        assert.deepStrictEqual(plants, [['recurring', 2, 'weeks']], 'saved Recurring, every 2 weeks');

        // A new Card closed with no name is thrown away; emptying an existing
        // Card's name keeps the old one.
        const now = await saved(0);
        await addCard(0);
        await clickAway(page);
        assert.deepStrictEqual(await saved(0), now, 'an empty new Card is thrown away');
        assert.strictEqual(await page.evaluate(() => $('.wrap .board .list').eq(0).find('.card').length), now.length, 'and gone from the page');
        await edit(card(0, 0));
        await page.evaluate(() => document.activeElement.select());
        await page.keyboard.press('Backspace');
        await page.keyboard.press('Enter');
        await sleep(100);
        await settle(page);
        assert.deepStrictEqual(await saved(0), now, 'an emptied name keeps the old one');

        // Delete asks first, then deletes the Card and closes the editor.
        const dialogs = [];
        page.removeAllListeners('dialog');
        page.on('dialog', (d) => { dialogs.push(d.message().trim()); d.accept(); });
        await edit(card(0, 0));
        await clickIn('.card-del');
        await sleep(600);
        await settle(page);
        assert.deepStrictEqual(dialogs, ['Delete this Card?'], 'Delete asks first');
        assert.strictEqual(await editorOpen(), false, 'Delete closes the editor');
        assert.deepStrictEqual(await saved(0), now.slice(1), 'and deletes the Card');
        assert.strictEqual(await page.evaluate(() => $('.card-editor-backdrop').length), 0, 'the board is no longer dimmed');

        // List and board titles aren't Cards: a click edits them in place.
        for (const [what, head] of [['a List title', '.wrap .board .list:nth-child(1) > .head'], ['the board title', '.wrap .board > .head']]) {
            await page.click(head + ' .text');
            await sleep(50);
            assert.deepStrictEqual(await page.evaluate((head) => [$(head).hasClass('editing'), $(head).find('.edit').is(document.activeElement), $('.card-editor-backdrop').length], head),
                [true, true, 0], what + ' edits in place');
            await page.keyboard.press('End');
            await page.keyboard.type('!');
            await page.keyboard.press('Enter');
            await settle(page);
        }
        assert.deepStrictEqual(await page.evaluate(() => [NB.board.lists[0].title.slice(-1), NB.board.title.slice(-1)]), ['!', '!'], 'both saved');

        assert.deepStrictEqual(app.errors, [], 'no page errors');
    } finally {
        await app.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
