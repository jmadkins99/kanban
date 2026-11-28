// Cards that share a Group name sit together, where the highest-ranked of
// them would sit (docs/adr/0004). The order is the Group module's (its rules
// are in group-rules.js); this checks only that the page draws it, keeps it
// across a reload, and regroups at once on a rename, a move and an undo.
const assert = require('assert');
const { openApp, settle, moveCard, sleep, seedBoard, fakeClock, clickAway, editCard } = require('../lib');

const LISTS = [
    { title: 'Backlog', notes: [] },
    { title: 'To-Do', notes: [
        { text: 'k: a', priority: 'medium', arrival: 1 },
        { text: 'x', priority: 'medium', arrival: 2 },
        { text: 'k: b', priority: 'medium', arrival: 3 },
        { text: 'j: c', priority: 'medium', arrival: 4 },
        { text: 'y', priority: 'low', arrival: 5 },
    ] },
    { title: 'WIP', notes: [
        { text: 'J: d', priority: 'medium', arrival: 1 },
        { text: 'k: w', priority: 'medium', arrival: 2 },
        { text: 'z', priority: 'medium', arrival: 3 },
    ] },
    { title: 'Done', notes: [] },
];

(async () => {
    const app = await openApp([fakeClock('2028-11-15 12:00'), seedBoard({ id: 78, title: 'Groups', lists: LISTS })], { demo: false });
    const { page } = app;
    await page.setViewport({ width: 1280, height: 1000 });
    await sleep(300);

    // Each List's Cards on screen, top to bottom, by their Name.
    const shown = () => page.evaluate(() => $('.wrap .board .list').map((_, l) => [$(l).find('.card .text').map((_, t) => $(t).attr('_text')).get()]).get());
    const todo = async () => (await shown())[1];
    const undo = async () => { await page.evaluate(() => $('.wrap .board .undo-board').click()); await settle(page); };

    try {
        assert.deepStrictEqual(await todo(), ['k: a', 'k: b', 'x', 'j: c', 'y'], 'the k Group sits together at k: a\'s place; a lone j stays put');
        await app.reload();
        assert.deepStrictEqual(await todo(), ['k: a', 'k: b', 'x', 'j: c', 'y'], 'same after a reload');

        // A new Name saved in the Card editor regroups at once.
        await editCard(page, '.wrap .board .list:nth-child(2) .card:nth-child(3)');
        await page.evaluate(() => { const e = $('.wrap .board .card.editing .edit')[0]; e.value = 'K: x'; e.dispatchEvent(new Event('input')); });
        await clickAway(page);
        assert.deepStrictEqual(await todo(), ['k: a', 'K: x', 'k: b', 'j: c', 'y'], 'x joins the k Group in its Arrival place');

        // A Card moved with the card menu's arrows joins a Group in its new
        // List, and leaves the one in its old List.
        await moveCard(page, 2, 0, -1); // J: d from WIP into To-Do
        await settle(page);
        assert.deepStrictEqual(await todo(), ['k: a', 'K: x', 'k: b', 'j: c', 'J: d', 'y'], 'J: d joins j: c');
        assert.deepStrictEqual((await shown())[2], ['k: w', 'z'], 'k: w was alone in WIP');
        await moveCard(page, 1, 0, 1); // k: a into WIP
        await settle(page);
        const moved = await shown();
        assert.deepStrictEqual(moved[1], ['K: x', 'k: b', 'j: c', 'J: d', 'y'], "k: a leaves To-Do's k Group");
        assert.deepStrictEqual(moved[2], ['k: w', 'k: a', 'z'], 'and joins k: w in WIP, ahead of z, which arrived before it');

        // A Card left alone when its only partner moves away goes back to ordinary order.
        await moveCard(page, 2, 0, 1); // k: w into Done
        await settle(page);
        assert.deepStrictEqual((await shown())[2], ['z', 'k: a'], 'k: a is back below z, by Arrival');

        // Undo restores each old grouping in turn.
        await undo();
        assert.deepStrictEqual((await shown())[2], ['k: w', 'k: a', 'z'], 'undo brings k: w back to k: a');
        await undo();
        assert.deepStrictEqual(await todo(), ['k: a', 'K: x', 'k: b', 'j: c', 'J: d', 'y'], 'undo puts k: a back in its Group');
        await undo();
        assert.deepStrictEqual(await todo(), ['k: a', 'K: x', 'k: b', 'j: c', 'y'], 'and undo again takes J: d back out');
        await undo();
        assert.deepStrictEqual(await todo(), ['k: a', 'k: b', 'x', 'j: c', 'y'], 'and the rename');

        assert.deepStrictEqual(app.errors, [], 'no page errors');
    } finally {
        await app.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
