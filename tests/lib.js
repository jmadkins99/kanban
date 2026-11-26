// Shared test plumbing: a static server for the repo, a headless Chrome, and
// a page opened on the app. Each case gets its own server port and its own
// fresh Chrome profile, so localStorage never leaks between cases.

const fs = require('fs');
const http = require('http');
const path = require('path');
const puppeteer = require('puppeteer-core');

const ROOT = path.join(__dirname, '..');

// puppeteer-core never downloads a browser, so one of these must exist.
// CI's ubuntu-latest ships /usr/bin/google-chrome. CHROME_PATH overrides.
const CHROME_CANDIDATES = [
    process.env.CHROME_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    process.env.ProgramFiles && process.env.ProgramFiles + '\\Google\\Chrome\\Application\\chrome.exe',
    process.env['ProgramFiles(x86)'] && process.env['ProgramFiles(x86)'] + '\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA && process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);

function findChrome() {
    const found = CHROME_CANDIDATES.find((p) => { try { return fs.statSync(p).isFile(); } catch (_) { return false; } });
    if (!found) throw new Error('No Chrome found. Set CHROME_PATH. Tried:\n  ' + CHROME_CANDIDATES.join('\n  '));
    return found;
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.css': 'text/css' };

function serve() {
    const server = http.createServer((req, res) => {
        const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        const file = path.join(ROOT, rel === '/' ? 'index.html' : rel);
        if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
        fs.readFile(file, (err, data) => {
            if (err) { res.writeHead(404); return res.end(); }
            res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
            res.end(data);
        });
    });
    return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

// Nullboard's old demo board (3 lists, 30 cards), which most cases are
// written against. A first visit now starts with 4 empty lists instead.
const DEMO = require('./fixtures/demo-board.json');

// Opens the app. `seed` (optional; a function, script text, or a list of them
// run in order) runs before the app's own scripts on every load, e.g. to put
// History entries into localStorage (see fakeClock, seedBoard). confirm() dialogs are
// accepted, as a user clicking OK would. Then the demo board replaces the
// first-visit board, unless `demo: false`.
async function openApp(seed, { demo = true } = {}) {
    const server = await serve();
    const browser = await puppeteer.launch({
        executablePath: findChrome(),
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('dialog', (d) => d.accept());
    for (const s of [].concat(seed || [])) await page.evaluateOnNewDocument(s);
    const url = `http://127.0.0.1:${server.address().port}/index.html`;
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForSelector('.wrap .board');
    if (demo) {
        await page.evaluate((b) => {
            b.id = NB.board.id;
            b.revision = NB.board.revision;
            NB.storage.saveBoard(b);
            openBoard(b.id);
        }, JSON.parse(JSON.stringify(DEMO)));
    }
    return {
        page,
        errors,
        async reload() {
            await page.reload({ waitUntil: 'load' });
            await page.waitForSelector('.wrap .board');
        },
        async close() {
            await browser.close();
            server.close();
        },
    };
}

// Lets jQuery animations (opacity fades before a removal) finish.
const settle = (page) => page.evaluate(() => new Promise((r) => $(':animated').promise().done(() => setTimeout(r, 50))));

// Moves Card `index` of List `list` (negative counts from the end) `steps`
// Lists over, negative to the left, the way a person does: a tap on the Card,
// then the left or right arrow in its menu, once per List.
const moveCard = (page, list, index, steps) => page.evaluate((list, index, steps) => {
    const card = $('.wrap .board .list').eq(list).find('.card').eq(index)[0];
    if (!card) throw new Error(`no Card ${index} in List ${list}`);
    for (let i = 0; i < Math.abs(steps); i++) {
        $(card).find('.text').trigger('click');
        $(card).find(steps < 0 ? '[data-cm=left]' : '[data-cm=right]').trigger('click');
    }
}, list, index, steps);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// '2028-11-15 10:00' (seconds optional) as Date's local-time arguments.
const localParts = (at) => {
    const m = /^(\d{4})-(\d\d)-(\d\d)(?: (\d\d):(\d\d)(?::(\d\d))?)?$/.exec(at);
    if (!m) throw new Error('not a local time: ' + at);
    return [+m[1], m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)];
};

// A seed for openApp that fakes the page's clock. It reads `start` (local,
// e.g. '2028-11-15 10:00'; omitted, the real time) when the page loads, or
// the time setClock last set, which a reload keeps, and runs on from there.
// The real Date stays reachable as window.RealDate.
const fakeClock = (start) => `{
    const Real = Date, start = ${JSON.stringify(start ? localParts(start) : null)};
    let at = null;
    try { at = +localStorage.getItem('test.clock') || null; } catch (e) {}
    window.clockSkew = (at || (start ? new Real(...start).getTime() : Real.now())) - Real.now();
    window.Date = class extends Real {
        constructor(...a) { super(...(a.length ? a : [Real.now() + window.clockSkew])); }
        static now() { return Real.now() + window.clockSkew; }
    };
    window.RealDate = Real;
}`;

// Sets the faked clock (see fakeClock) to `at`, local like '2028-11-16 00:00'
// or in ms, now and after a reload.
const setClock = (page, at) => page.evaluate((at) => {
    const t = Array.isArray(at) ? new RealDate(...at).getTime() : at;
    localStorage.setItem('test.clock', String(t));
    window.clockSkew = t - RealDate.now();
}, typeof at == 'string' ? localParts(at) : at);

// The tab coming back into view, as after a laptop wakes: the app runs its
// minute's tick (Auto-submit, Recurring Cards moving to To-Do) at once.
const wake = async (page) => {
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await sleep(100);
    await settle(page);
};

// A seed for openApp that saves `board` ({ id, title, lists, day? }) to
// localStorage as the board to open, and `history` (optional, a list of
// History days) as History, on the first load only.
const seedBoard = (board, history) => `(${(board, history) => {
    if (localStorage.getItem('nullboard.last_board')) return;
    board = Object.assign({ format: 20190412, revision: 1 }, board);
    localStorage.setItem('nullboard.board.' + board.id + '.' + board.revision, JSON.stringify(board));
    localStorage.setItem('nullboard.board.' + board.id + '.meta', JSON.stringify({ title: board.title, current: board.revision, history: [board.revision] }));
    localStorage.setItem('nullboard.board.' + board.id, String(board.revision));
    localStorage.setItem('nullboard.last_board', String(board.id));
    if (history) localStorage.setItem('nullboard.history', JSON.stringify(history));
}})(${JSON.stringify(board)}, ${JSON.stringify(history || null)})`;

// A click on empty page, which ends editing and saves.
const clickAway = async (page) => { await page.mouse.click(1270, 990); await sleep(50); await settle(page); };

// Picks `priority` ('Critical', any case) in the Card editor, open on the
// Card at selector `card`: a click on that Priority's button.
const pickPriority = async (page, card, priority) => {
    const button = `${card} .prio-pick button[data-priority=${priority.toLowerCase()}]`;
    await page.waitForSelector(button, { visible: true, timeout: 3000 });
    await page.click(button);
    await sleep(50);
};

// Waits until the Card at selector `card` has class `cls`: what each click
// in editCard leads to, so a slow machine (a busy CI runner, two suites at
// once) waits for it instead of clicking on.
const cardHas = (page, card, cls) =>
    page.waitForFunction((sel, cls) => $(sel).hasClass(cls), { timeout: 3000 }, card, cls);

// Opens the Card at selector `card` in the Card editor, the way a person
// does: a tap on it, then Edit in its menu, once the menu has slid in.
const editCard = async (page, card) => {
    await page.click(card + ' .text');
    await cardHas(page, card, 'cm-open');
    await sleep(450);
    await page.click(card + ' [data-cm=edit]');
    await cardHas(page, card, 'editing');
    await sleep(100);
};

// Changes the Priority of the Card at selector `card`: Edit, the Priority,
// then a click away to save.
const setPriority = async (page, card, priority) => {
    await editCard(page, card);
    await pickPriority(page, card, priority);
    await clickAway(page);
};

// Taps the way an iPhone does, which Chrome's touch emulation doesn't: iOS
// keeps :hover on the last element tapped until the next tap, even when the
// page changes under it, and each tap first moves :hover to its target. If
// that makes anything appear (a menu opening on :hover, say), the tap stops
// there and no click follows. Call after each load: it turns every :hover
// rule into [data-ios-hover], which it then sets on the tapped element and
// its ancestors. Returns tap(selector), which resolves to 'click' or 'hover'.
const iosTapper = async (page) => {
    await page.evaluate(() => {
        const walk = (rules) => [...rules].forEach((r) => {
            if (r.cssRules) walk(r.cssRules);
            if (r.selectorText && r.selectorText.includes(':hover')) r.selectorText = r.selectorText.replace(/:hover/g, '[data-ios-hover]');
        });
        [...document.styleSheets].forEach((s) => { try { walk(s.cssRules); } catch (e) {} }); // cross-origin fonts
    });
    const shown = () => page.evaluate(() => {
        window.iosIds = window.iosIds || 0;
        return [...document.querySelectorAll('body *')].map((e) => {
            e.iosId = e.iosId || ++window.iosIds;
            return e.getClientRects().length && getComputedStyle(e).visibility != 'hidden' ? e.iosId : 0;
        }).filter(Boolean);
    });
    return async (selector) => {
        const box = await (await page.$(selector)).boundingBox();
        const x = box.x + box.width / 2, y = box.y + box.height / 2;
        const before = new Set(await shown());
        await page.evaluate((x, y) => {
            const hit = document.elementFromPoint(x, y);
            document.querySelectorAll('[data-ios-hover]').forEach((e) => e.removeAttribute('data-ios-hover'));
            for (let e = hit; e; e = e.parentElement) e.setAttribute('data-ios-hover', '');
        }, x, y);
        if ((await shown()).some((id) => ! before.has(id)))
            return 'hover';
        await page.touchscreen.tap(x, y);
        return 'click';
    };
};

module.exports = { openApp, settle, moveCard, sleep, fakeClock, setClock, wake, seedBoard, clickAway, pickPriority, editCard, setPriority, iosTapper };
