// On an iPhone, the first tap on a Priority in the Card editor of a new Card
// picks it. "+ Card" lives in the List's ≡ menu, which opens on :hover, and
// iOS keeps :hover on "+ Card" while the editor is open. The first tap in the
// editor moves :hover off the menu; if that brings the ≡ back into view, iOS
// takes the tap as a hover only: the tapped Priority looked shaded next to
// Low, still picked, and it took a second tap. So while the editor is open
// the menu stays shut, and moving :hover off it changes nothing.
const assert = require('assert');
const { openApp, settle, sleep, iosTapper } = require('../lib');

const EDITOR = '[role=dialog][aria-label="Card editor"]';
const LIST = '.wrap .board .list:nth-child(1)';

(async () => {
    const app = await openApp(() => {});
    const { page } = app;
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await app.reload();
    await sleep(300);
    const tap = await iosTapper(page);

    // Each Priority button: its name, * if picked, # if shaded.
    const choices = () => page.evaluate((sel) => $(sel).find('[role=radio]').map((_, b) =>
        $(b).attr('aria-label').replace('Priority: ', '')
        + (b.getAttribute('aria-checked') == 'true' ? '*' : '')
        + (getComputedStyle(b).backgroundColor != 'rgba(0, 0, 0, 0)' ? '#' : '')).get().join(' '), EDITOR);
    const saved = (text) => page.evaluate((text) => NB.board.lists.flatMap((l) => l.notes).filter((n) => n.text == text).map((n) => n.priority), text);

    try {
        // The ≡ opens the menu on the first tap (a hover, as on any iPhone),
        // and "+ Card" then opens the editor.
        assert.strictEqual(await tap(LIST + ' .teaser'), 'hover', 'the ≡ opens the menu');
        assert.strictEqual(await tap(LIST + ' .add-card'), 'click', '"+ Card" is tapped');
        await sleep(150);
        assert.strictEqual(await page.evaluate((sel) => $(sel).length, EDITOR), 1, 'the Card editor is open');
        assert.strictEqual(await choices(), 'Recurring Critical Medium Low*#', 'Low is picked');

        // One tap on each other Priority picks it, and only it is shaded.
        await page.keyboard.type('buy milk');
        for (const p of ['Medium', 'Critical', 'Recurring', 'Low']) {
            assert.strictEqual(await tap(`${EDITOR} [role=radio][aria-label="Priority: ${p}"]`), 'click', `the first tap on ${p} is a click, not a hover`);
            await sleep(100);
            const want = ['Recurring', 'Critical', 'Medium', 'Low'].map((q) => q == p ? q + '*#' : q).join(' ');
            assert.strictEqual(await choices(), want, `one tap picks ${p}`);
        }

        // A second new Card, Critical in one tap, is saved Critical.
        await tap('.card-editor-backdrop');
        await sleep(150);
        await settle(page);
        await tap(LIST + ' .teaser');
        await tap(LIST + ' .add-card');
        await sleep(150);
        await page.keyboard.type('pay rent');
        await tap(`${EDITOR} [role=radio][aria-label="Priority: Critical"]`);
        await sleep(100);
        await tap('.card-editor-backdrop');
        await sleep(150);
        await settle(page);
        assert.deepStrictEqual(await saved('pay rent'), ['critical'], 'saved Critical after one tap');
        assert.deepStrictEqual(await saved('buy milk'), ['low'], 'and the first Card as last picked');

        // Once the editor is closed, the menu opens on the ≡ again.
        assert.strictEqual(await tap(LIST + ' .teaser'), 'hover', 'the ≡ still opens the menu');
        assert.strictEqual(await page.evaluate((sel) => $(sel).is(':visible'), LIST + ' .add-card'), true, '"+ Card" is showing');

        assert.deepStrictEqual(app.errors, [], 'no page errors');
    } finally {
        await app.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
