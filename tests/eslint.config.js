// Catches a name the app uses that nothing defines, e.g. a caller left behind
// when a function is deleted. Only `no-undef`: the app's scripts share one
// global scope, so each file is checked against the names the others define
// (a js/ module's `window.X = ...` export, index.html's top-level functions
// and variables). `bash lint.sh` runs it.
const fs = require('fs');
const path = require('path');
const globals = require('globals');
const html = require('eslint-plugin-html');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const modules = fs.readdirSync(path.join(root, 'js')).map((f) => 'js/' + f);

const defined = {};
for (const f of modules)
    for (const [, name] of read(f).matchAll(/window\.(\w+)\s*=/g)) defined[name] = 'writable';
for (const m of read('index.html').matchAll(/^\t?(?:function\s+(\w+)|(?:var|let|const)\s+(\w+))/gm))
    defined[m[1] || m[2]] = 'writable';

module.exports = [{
    files: ['index.html', 'js/*.js'],
    plugins: { html },
    languageOptions: {
        ecmaVersion: 'latest',
        sourceType: 'script',
        // firebase: the SDK js/sync.js loads from gstatic at sign-in
        globals: { ...globals.browser, ...globals.jquery, ...defined, firebase: 'readonly' },
    },
    rules: { 'no-undef': 'error' },
}];
