// Only a few keys do anything. Enter finishes a List or board title; in the
// Card editor, Enter (or Shift+Enter, which would break the one-line name)
// and Esc save and close it. Esc also closes an overlay. Nullboard's other
// hotkeys (Tab, Alt+Enter, Esc to cancel, Ctrl+Enter, Ctrl+Shift+Enter,
// Alt+Up/Down, Alt+R, Ctrl+Shift+8, Ctrl+Z/Y/Shift+Z) do nothing, on Cards
// and on List titles. Clicking away from an edit saves it, and the menu's
// Undo and Redo take it back.
// Cards are saved as `notes`, Nullboard's name, so old boards, History days and export files load without a migration.
const assert = require('assert');
const { openApp, settle } = require('../lib');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const REMOVED = [
    ['Escape'], ['Tab'], ['Shift', 'Tab'], ['Shift', 'Enter'], ['Alt', 'Enter'],
    ['Control', 'Enter'], ['Control', 'Shift', 'Enter'], ['Alt', 'ArrowUp'], ['Alt', 'ArrowDown'],
    ['Alt', 'KeyR'], ['Control', 'Shift', 'Digit8'],
];

(async () => {
    const app = await openApp(() => {});
    const { page } = app;
    await page.setViewport({ width: 1280, height: 1000 });
    await sleep(300);

    const combo = async (keys) => {
        const mods = keys.slice(0, -1);
        for (const m of mods) await page.keyboard.down(m);
        await page.keyboard.press(keys[keys.length - 1]);
        for (const m of mods.reverse()) await page.keyboard.up(m);
        await sleep(50);
        await settle(page);
    };
    // What a person can see: the board, what's in edit mode and what's typed there.
    const state = () => page.evaluate(() => ({
        revision: NB.board.revision,
        title: NB.board.title,
        lists: NB.board.lists.map((l) => [l.title, l.notes.map((n) => n.text)]),
        cards: $('.wrap .board .card').length,
        editing: $('.wrap .editing').map((_, e) => $(e).closest('.list').index() + ':' + ($(e).hasClass('card') ? $(e).index() : 'head')).get(),
        typed: ($('.wrap .editing .edit').val() || '').replace(/\n/g, ''),
    }));
    const card = (l, i) => `.wrap .board .list:nth-child(${l + 1}) .card:nth-child(${i + 1})`;
    const editCard = async (sel) => {
        await page.click(sel + ' .text');
        await sleep(450);
        await page.evaluate((sel) => $(sel).find('[data-cm=edit]').click(), sel);
        await sleep(50);
    };
    const clickAway = async () => { await page.mouse.click(1270, 990); await sleep(50); await settle(page); };
    const menu = (cls) => page.evaluate((cls) => $('.wrap .board > .head .' + cls).click(), cls);

    try {
        // On a Card in the Card editor, each removed hotkey leaves it as it
        // was. Esc saves and closes the editor, like a click outside, and so
        // does anything that would break the line, as a Card's name is one
        // line; with nothing typed, the board stays as it was.
        const CLOSES = ['Escape', 'Shift+Enter'];
        for (const keys of REMOVED) {
            await editCard(card(0, 1));
            const before = await state();
            assert.deepStrictEqual(before.editing, ['0:1'], 'the Card is in the Card editor');
            await combo(keys);
            const after = await state();
            if (CLOSES.includes(keys.join('+'))) {
                assert.deepStrictEqual(after, Object.assign({}, before, { editing: [], typed: '' }), keys.join('+') + ' closes the editor and changes nothing');
                continue;
            }
            assert.deepStrictEqual(after, before, keys.join('+') + ' does nothing on a Card');
            await clickAway();
        }

        // On a List title, the same: only Enter finishes it.
        const head = '.wrap .board .list:nth-child(1) > .head .text';
        for (const keys of REMOVED) {
            await page.click(head);
            await sleep(50);
            const before = await state();
            assert.deepStrictEqual(before.editing, ['0:head'], 'the List title is in edit mode');
            await combo(keys);
            const after = await state();
            if (keys[keys.length - 1] == 'Tab') {
                after.editing = before.editing;
                after.typed = before.typed;
            }
            assert.deepStrictEqual(after, before, keys.join('+') + ' does nothing on a List title');
            await clickAway();
        }

        // Enter finishes a List title.
        const oldList = (await state()).lists[0][0];
        await page.click(head);
        await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control');
        await page.keyboard.type('Renamed');
        await combo(['Enter']);
        let s = await state();
        assert.deepStrictEqual([s.lists[0][0], s.editing], ['Renamed', []], 'Enter finishes a List title');

        // Enter finishes the board title.
        await page.click('.wrap .board > .head .text');
        await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control');
        await page.keyboard.type('My board');
        await combo(['Enter']);
        s = await state();
        assert.deepStrictEqual([s.title, s.editing], ['My board', []], 'Enter finishes the board title');

        // Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z do nothing; the menu's Undo and Redo work.
        for (const keys of [['Control', 'KeyZ'], ['Control', 'KeyY'], ['Control', 'Shift', 'KeyZ']]) {
            const before = await state();
            await combo(keys);
            assert.deepStrictEqual(await state(), before, keys.join('+') + ' does nothing');
        }
        await menu('undo-board');
        await settle(page);
        assert.notStrictEqual((await state()).title, 'My board', "the menu's Undo takes back the board title");
        await menu('undo-board');
        await settle(page);
        assert.strictEqual((await state()).lists[0][0], oldList, "the menu's Undo takes back the rename");
        for (const keys of [['Control', 'KeyY'], ['Control', 'Shift', 'KeyZ']]) {
            await combo(keys);
            assert.strictEqual((await state()).lists[0][0], oldList, keys.join('+') + ' does not redo');
        }
        await menu('redo-board');
        await settle(page);
        assert.strictEqual((await state()).lists[0][0], 'Renamed', "the menu's Redo does");

        // Clicking away from an edited Card saves it; the menu's Undo reverts it.
        const was = (await state()).lists[0][1][0];
        await editCard(card(0, 0));
        await page.keyboard.press('End');
        await page.keyboard.type(' and more');
        await clickAway();
        s = await state();
        assert.deepStrictEqual([s.lists[0][1][0], s.editing], [was + ' and more', []], 'clicking away saves the Card');
        await menu('undo-board');
        await settle(page);
        assert.strictEqual((await state()).lists[0][1][0], was, "the menu's Undo reverts the Card");

        // Esc closes an overlay.
        await page.evaluate(() => $('.view-about').click());
        await sleep(500);
        assert.ok(await page.evaluate(() => haveOverlay()), 'About opens an overlay');
        await combo(['Escape']);
        await sleep(500);
        assert.strictEqual(await page.evaluate(() => haveOverlay()), false, 'Esc closes the overlay');

        assert.deepStrictEqual(app.errors, [], 'no page errors');
    } finally {
        await app.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
