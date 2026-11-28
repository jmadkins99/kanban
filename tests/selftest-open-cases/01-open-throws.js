// Made-up case for check-runner.sh (TEST_SLOT_CHROME=1): when openApp throws,
// the Chrome it opened for this case must not be left running.
//
// Two ways to run a case. Under the runner, TEST_CHROME_WS names the slot's
// Chrome and openApp works in a browser context on it: that context (and its
// page) must be gone afterwards, and the slot's Chrome must still be alive.
// Run by hand there is no TEST_CHROME_WS and openApp launches a Chrome of its
// own: that Chrome must have exited. The case checks both.
const puppeteer = require('puppeteer-core');

// Records every Chrome launched through puppeteer.launch, which is how lib.js
// starts one. The module's exports can't be patched in place, so lib.js is
// handed a stand-in that does the same and keeps the browsers it returns.
const launched = [];
require.cache[require.resolve('puppeteer-core')].exports = new Proxy(puppeteer, {
    get: (target, key) => key === 'launch'
        ? async (...args) => { const b = await target.launch(...args); launched.push(b); return b; }
        : target[key],
});
const { openApp } = require('../lib');

// A seed whose conversion to text throws: openApp fails after it has launched
// (or connected to) a Chrome and opened a page.
const badSeed = { toString() { throw new Error('SELFTEST-OPEN-BOOM'); } };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(what, ok) {
    for (let i = 0; i < 100; i++) {
        if (await ok()) return;
        await sleep(100);
    }
    throw new Error('SELFTEST-OPEN-LEAK ' + what);
}
async function fails() {
    try { await openApp(badSeed, { demo: false }); } catch (e) {
        if (!String(e.message).includes('SELFTEST-OPEN-BOOM')) throw e;
        return;
    }
    throw new Error('openApp did not throw');
}

(async () => {
    const ws = process.env.TEST_CHROME_WS;
    if (!ws) throw new Error('TEST_CHROME_WS not set: run this case through run.sh with TEST_SLOT_CHROME=1');

    // On the slot's Chrome: no browser context and no page left behind.
    const probe = await puppeteer.connect({ browserWSEndpoint: ws });
    try {
        const contexts = probe.browserContexts().length, pages = (await probe.pages()).length;
        await fails();
        await until('a browser context is left on the slot Chrome', () => probe.browserContexts().length === contexts);
        await until('a page is left on the slot Chrome', async () => (await probe.pages()).length === pages);
        console.log('slot Chrome: nothing left behind, Chrome still alive');
    } finally {
        await probe.disconnect();
    }

    // By hand: the Chrome openApp launched has exited.
    delete process.env.TEST_CHROME_WS;
    await fails();
    if (launched.length !== 1) throw new Error('expected one launched Chrome, saw ' + launched.length);
    // The browser being disconnected is not enough (disconnect() leaves the
    // Chrome running): its process must be gone.
    const pid = launched[0].process().pid;
    const alive = () => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
    await until('the Chrome openApp launched is still running (pid ' + pid + ')', () => !alive());
    console.log('own Chrome: exited');
})().catch((e) => { console.error(e); process.exit(1); });
