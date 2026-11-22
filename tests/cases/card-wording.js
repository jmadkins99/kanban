// The app says Card: a List's menu adds a Card with "+ Card", and the prompts
// for deleting a List or clearing its Cards talk about Cards.
const assert = require('assert');
const { openApp, settle } = require('../lib');

(async () => {
    const app = await openApp();
    const { page } = app;
    const dialogs = [];
    page.on('dialog', (d) => dialogs.push(d.message().trim()));
    try {
        const menu = await page.evaluate(() => $('.wrap .list').first().find('.head .bulk a').map((_, a) => $(a).text()).get());
        assert.ok(menu.includes('+ Card'), 'the List menu offers "+ Card": ' + JSON.stringify(menu));

        // Clicked from a timer: a confirm() inside page.evaluate can stall it.
        const pick = async (list, label) => {
            const seen = dialogs.length;
            await page.evaluate((list, label) => setTimeout(() => $('.wrap .list').eq(list).find(`.head .bulk a:contains(${label})`).click()), list, label);
            for (let i = 0; dialogs.length == seen; i++) {
                assert.ok(i < 250, `no prompt after clicking ${label}`);
                await new Promise((r) => setTimeout(r, 20));
            }
        };
        await pick(0, 'Clear');
        await settle(page);
        const lists = await page.evaluate(() => $('.wrap .list').length);
        await pick(1, 'List');
        await page.waitForFunction((n) => $('.wrap .list').length == n - 1, {}, lists); // its fade never settles

        assert.deepStrictEqual(dialogs, [
            'Clear all Cards from this list? The list itself stays.',
            'Delete this list and all its Cards?',
        ]);
        assert.ok(dialogs.every((m) => !/note/i.test(m)), 'no prompt says note');

        assert.deepStrictEqual(app.errors, [], 'no page errors');
    } finally {
        await app.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
