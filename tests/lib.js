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

// Opens the app. `seed` (optional) runs before the app's own scripts on every
// load, e.g. to put History entries into localStorage. confirm() dialogs are
// accepted, as a user clicking OK would.
async function openApp(seed) {
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
    if (seed) await page.evaluateOnNewDocument(seed);
    const url = `http://127.0.0.1:${server.address().port}/index.html`;
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForSelector('.wrap .board');
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

module.exports = { openApp, settle };
