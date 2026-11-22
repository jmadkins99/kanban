// A link in a Card's text looks like a link and opens in a new tab with a
// plain click, without holding Ctrl or Caps Lock. Clicking it doesn't open
// the card menu.
// Cards are saved as `notes`, Nullboard's name, so old boards, History days and export files load without a migration.
const assert = require('assert');
const { openApp } = require('../lib');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const URL = 'http://127.0.0.1:9/a-link';

(async () => {
    const app = await openApp(() => {});
    const { page } = app;
    await page.setViewport({ width: 1280, height: 1000 });
    await sleep(300);
    const card = '.wrap .board .list:nth-child(1) .card:nth-child(1)';

    try {
        await page.evaluate((card, url) => { setText($(card).find('.text'), 'read ' + url + ' first'); saveBoard(); }, card, URL);

        // It's coloured unlike the text around it, and points like a link.
        const look = await page.evaluate((card) => {
            const t = getComputedStyle($(card).find('.text')[0]), a = getComputedStyle($(card).find('.text a')[0]);
            return { recoloured: a.color != t.color, cursor: a.cursor };
        }, card);
        assert.deepStrictEqual(look, { recoloured: true, cursor: 'pointer' }, 'the link looks like a link');

        // A plain click opens it in a new tab, and the card menu stays shut.
        const opened = new Promise((r) => page.browser().once('targetcreated', (t) => r(t.url())));
        await page.click(card + ' .text a');
        assert.strictEqual(await Promise.race([opened, sleep(3000).then(() => 'nothing opened')]), URL);
        await sleep(450);
        assert.strictEqual(await page.evaluate((card) => $(card).hasClass('cm-open'), card), false, 'the card menu stays shut');

        assert.deepStrictEqual(app.errors, [], 'no page errors');
    } finally {
        await app.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
