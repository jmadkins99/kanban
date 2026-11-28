// Cards that share a Group name sit together, where the highest-ranked of
// them would sit (docs/adr/0004). The order is the Group module's (its rules
// are in group-rules.js); this checks only that the page draws it, keeps it
// across a reload, and regroups at once on a rename, a move and an undo. Each
// Card also carries its place in its Group as a class (group-first,
// group-middle, group-last), which draws the Group's outline; the look itself
// is checked by screenshots.
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
    // Each List's Cards' places in their Group, top to bottom: f, m, l, or - for none.
    const places = () => page.evaluate(() => $('.wrap .board .list').map((_, l) => [$(l).find('.card').map((_, c) => {
        const p = ['first', 'middle', 'last'].filter((k) => $(c).hasClass('group-' + k));
        return p.length > 1 ? 'many' : p.length ? p[0][0] : '-';
    }).get().join('')]).get());
    const undo = async () => { await page.evaluate(() => $('.wrap .board .undo-board').click()); await settle(page); };

    try {
        assert.deepStrictEqual(await todo(), ['k: a', 'k: b', 'x', 'j: c', 'y'], 'the k Group sits together at k: a\'s place; a lone j stays put');
        assert.deepStrictEqual(await places(), ['', 'fl---', '---', ''], 'the k Group is first and last; ungrouped Cards carry no place');
        await app.reload();
        assert.deepStrictEqual(await todo(), ['k: a', 'k: b', 'x', 'j: c', 'y'], 'same after a reload');
        assert.deepStrictEqual(await places(), ['', 'fl---', '---', ''], 'and so do the places');

        // A new Name saved in the Card editor regroups at once.
        await editCard(page, '.wrap .board .list:nth-child(2) .card:nth-child(3)');
        await page.evaluate(() => { const e = $('.wrap .board .card.editing .edit')[0]; e.value = 'K: x'; e.dispatchEvent(new Event('input')); });
        await clickAway(page);
        assert.deepStrictEqual(await todo(), ['k: a', 'K: x', 'k: b', 'j: c', 'y'], 'x joins the k Group in its Arrival place');
        assert.deepStrictEqual((await places())[1], 'fml--', 'and is its middle');

        // A Card moved with the card menu's arrows joins a Group in its new
        // List, and leaves the one in its old List.
        await moveCard(page, 2, 0, -1); // J: d from WIP into To-Do
        await settle(page);
        assert.deepStrictEqual(await todo(), ['k: a', 'K: x', 'k: b', 'j: c', 'J: d', 'y'], 'J: d joins j: c');
        assert.deepStrictEqual((await shown())[2], ['k: w', 'z'], 'k: w was alone in WIP');
        assert.deepStrictEqual((await places()).slice(1, 3), ['fmlfl-', '--'], 'two Groups next to each other each have their own first and last');
        await moveCard(page, 1, 0, 1); // k: a into WIP
        await settle(page);
        const moved = await shown();
        assert.deepStrictEqual(moved[1], ['K: x', 'k: b', 'j: c', 'J: d', 'y'], "k: a leaves To-Do's k Group");
        assert.deepStrictEqual(moved[2], ['k: w', 'k: a', 'z'], 'and joins k: w in WIP, ahead of z, which arrived before it');
        assert.deepStrictEqual((await places()).slice(1, 3), ['flfl-', 'fl-'], "the k Group in To-Do loses its middle; WIP gains a Group");

        // A Card left alone when its only partner moves away goes back to ordinary order.
        await moveCard(page, 2, 0, 1); // k: w into Done
        await settle(page);
        assert.deepStrictEqual((await shown())[2], ['z', 'k: a'], 'k: a is back below z, by Arrival');
        assert.deepStrictEqual((await places()).slice(2), ['--', '-'], 'with no place, nor k: w in Done');

        // Undo restores each old grouping in turn.
        await undo();
        assert.deepStrictEqual((await shown())[2], ['k: w', 'k: a', 'z'], 'undo brings k: w back to k: a');
        assert.deepStrictEqual((await places())[2], 'fl-', 'and their places');
        await undo();
        assert.deepStrictEqual(await todo(), ['k: a', 'K: x', 'k: b', 'j: c', 'J: d', 'y'], 'undo puts k: a back in its Group');
        await undo();
        assert.deepStrictEqual(await todo(), ['k: a', 'K: x', 'k: b', 'j: c', 'y'], 'and undo again takes J: d back out');
        await undo();
        assert.deepStrictEqual(await todo(), ['k: a', 'k: b', 'x', 'j: c', 'y'], 'and the rename');
        assert.deepStrictEqual((await places())[1], 'fl---', 'places and all');

        assert.deepStrictEqual(app.errors, [], 'no page errors');
    } finally {
        await app.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
