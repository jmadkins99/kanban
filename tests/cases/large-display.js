// Big screens scale everything up from a 1080p baseline, by the screen's
// height, not the window's: a half-screen window on a 3440x1440 ultrawide
// gets the same 1.33 as a full-screen one. A 1080p screen stays at 1, and a
// font size set in UI preferences wins.
const assert = require('assert');
const { openApp } = require('../lib');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
    const app = await openApp(() => {});
    const { page } = app;
    const cdp = await page.target().createCDPSession();

    // A window of width x height on a screen of screenWidth x screenHeight.
    const screen = async (width, height, screenWidth, screenHeight) => {
        await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false, screenWidth, screenHeight });
        await sleep(300);
    };
    const sizes = () => page.evaluate(() => ({
        ui: +$('html').css('--ui'), fs: getFontSize(),
        bar: Math.round($('.xp-bar')[0].getBoundingClientRect().height),
    }));

    try {
        await screen(1920, 950, 1920, 1080);
        assert.deepStrictEqual(await sizes(), { ui: 1, fs: 11, bar: 16 }, '1080p stays as it was');

        await screen(3440, 1300, 3440, 1440);
        const full = await sizes();
        assert.ok(Math.abs(full.ui - 1.333) < 0.01 && Math.abs(full.fs - 14.67) < 0.05 && full.bar == 21, 'ultrawide scales up: ' + JSON.stringify(full));

        await screen(1720, 1300, 3440, 1440);
        assert.deepStrictEqual(await sizes(), full, 'a half-screen window scales the same');

        // A font size chosen in UI preferences is kept on any screen.
        await page.evaluate(() => { setFontSize(12); saveUiPrefs(); });
        await screen(3440, 1300, 3440, 1440);
        assert.strictEqual((await sizes()).fs, 12, 'the chosen font size wins');

        assert.deepStrictEqual(app.errors, [], 'no page errors');
    } finally {
        await app.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
