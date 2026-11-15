// The board takes gym-tracker's color for the day, in the dark theme only.
// accentColor.js is a straight copy of gym-tracker's; the pinned dates below
// were computed from gym-tracker's own file, so a drifted copy fails here.
const assert = require('assert');
const { openApp } = require('../lib');

(async () => {
    const app = await openApp();
    const { page } = app;
    try {
        const r = await page.evaluate(() => ({
            dark: document.documentElement.classList.contains('theme-dark'),
            accent: document.documentElement.style.getPropertyValue('--accent'),
            today: window.accentColor.paletteFor(new Date()).accent,
            pinned: [new Date(2026, 10, 15), new Date(2026, 0, 1), new Date(2027, 5, 30)]
                .map((d) => window.accentColor.paletteFor(d).name),
            themeToggle: $('.switch-theme').length,
            fontPicker: $('.switch-font').length,
        }));

        assert.ok(r.dark, 'dark theme always on');
        assert.strictEqual(r.accent, r.today, "today's palette is applied");
        assert.deepStrictEqual(r.pinned, ['Teal', 'Steel', 'Indigo'], 'same rotation as gym-tracker');
        assert.strictEqual(r.themeToggle, 0, 'no light/dark toggle');
        assert.strictEqual(r.fontPicker, 0, 'no font picker');
        assert.deepStrictEqual(app.errors, [], 'no page errors');
    } finally {
        await app.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
