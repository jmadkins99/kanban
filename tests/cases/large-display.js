// Big screens scale everything up from a 1080p baseline: Nullboard's font
// size (and so lists and menus) plus --ui for the fixed-size parts. A
// 1080p window stays at 1, and a font size set in UI preferences wins.
const assert = require('assert');
const { openApp } = require('../lib');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
    const app = await openApp(() => {});
    const { page } = app;
    const sizes = () => page.evaluate(() => ({
        ui: +$('html').css('--ui'), fs: getFontSize(),
        bar: Math.round($('.xp-bar')[0].getBoundingClientRect().height),
    }));
    try {
        await page.setViewport({ width: 1920, height: 950 });
        await sleep(300);
        assert.deepStrictEqual(await sizes(), { ui: 1, fs: 11, bar: 16 }, '1080p stays as it was');

        await page.setViewport({ width: 3440, height: 1300 });
        await sleep(300);
        const big = await sizes();
        assert.ok(Math.abs(big.ui - 1.368) < 0.01 && Math.abs(big.fs - 15.05) < 0.05 && big.bar == 22, 'ultrawide scales up: ' + JSON.stringify(big));

        // A font size chosen in UI preferences is kept on any screen.
        await page.evaluate(() => { setFontSize(12); saveUiPrefs(); });
        await page.setViewport({ width: 3000, height: 1250 });
        await sleep(300);
        assert.strictEqual((await sizes()).fs, 12, 'the chosen font size wins');

        assert.deepStrictEqual(app.errors, [], 'no page errors');
    } finally {
        await app.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
