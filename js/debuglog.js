/*
 *	Temporary debug log, for a phone-only bug: tags (Due dates, WIP and
 *	Critical timers) not showing, and the board snapping back to Backlog.
 *	Remove this file, its <script> tag and the debug rule in
 *	firebase/firestore.rules once that bug is fixed.
 *
 *	- On by default, since a Home Screen icon has no address bar to add a
 *	  flag to: open the page with ?debug=off to turn it off for this device
 *	  (it stays off across reloads), ?debug to turn it back on.
 *	- On, it records page errors, failed script loads, console warnings and
 *	  errors, the [sync] trace (it turns that on too), every board redraw
 *	  with its caller, changes in how many tags show, jumps of the List
 *	  scroll back to the start, and page show/hide events.
 *	- Signed in, each page load's log goes up as its own document,
 *	  users/{uid}/debug/{device}-{load time}, through Firestore's REST API
 *	  rather than the SDK, so it gets there even if the SDK is stuck.
 *	- A "dbg" badge in the bottom left corner shows the last lines on the
 *	  page, in case the upload itself fails.
 */
(function () {

	var KEY = 'nullboard.debug';
	var flag = new URLSearchParams(location.search).get('debug');

	try
	{
		if (flag === 'off') localStorage.setItem(KEY, 'off');
		else if (flag !== null) localStorage.removeItem(KEY);
		if (localStorage.getItem(KEY) == 'off') return;
		localStorage.setItem('nullboard.syncTrace', 'true');
	}
	catch (e) { return; }

	var t0 = Date.now();
	var lines = [];
	var dirty = false;

	function stamp()
	{
		var d = new Date();
		var p = function (n, w) { return String(n).padStart(w || 2, '0'); };
		return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()) + '.' + p(d.getMilliseconds(), 3);
	}

	function str(x)
	{
		if (x instanceof Error) return x.name + ': ' + x.message;
		if (typeof x == 'string') return x;
		try { return JSON.stringify(x); } catch (e) { return String(x); }
	}

	function log()
	{
		var text = Array.prototype.map.call(arguments, str).join(' ').slice(0, 400);
		lines.push(stamp() + ' ' + text);
		if (lines.length > 600) lines.splice(0, lines.length - 600);
		dirty = true;
		if (panelOpen) renderPanel();
	}

	function caller(skip)
	{
		var s = (new Error().stack || '').split('\n').slice(skip, skip + 4);
		return s.map(function (l) { return l.trim().replace(/https?:\/\/[^/]+\//, ''); }).join(' < ');
	}

	window.debugLog = log;

	/*
	 *	what this page is
	 */
	log('load', location.href,
		'| ua', navigator.userAgent,
		'| standalone', !! navigator.standalone,
		'| display-mode standalone', !! (window.matchMedia && matchMedia('(display-mode: standalone)').matches),
		'| online', navigator.onLine);

	/*
	 *	errors
	 */
	window.addEventListener('error', function (e) {
		var t = e.target;
		if (t && t !== window && (t.src || t.href)) // a script or stylesheet that failed to load
			return log('LOAD FAILED', t.tagName, t.src || t.href);
		log('ERROR', e.message, '@', (e.filename || '').replace(/https?:\/\/[^/]+\//, '') + ':' + e.lineno + ':' + e.colno,
			e.error && e.error.stack ? '| ' + e.error.stack.split('\n').slice(0, 4).join(' < ') : '');
	}, true);

	window.addEventListener('unhandledrejection', function (e) { log('UNHANDLED REJECTION', e.reason && (e.reason.stack || e.reason.message) || e.reason); });

	/*
	 *	console: warnings, errors and [sync] lines
	 */
	['log', 'warn', 'error'].forEach(function (k) {
		var orig = console[k];
		console[k] = function () {
			var first = arguments[0];
			if (k != 'log' || (typeof first == 'string' && first.indexOf('[sync]') == 0))
				log.apply(null, [k == 'log' ? '' : k.toUpperCase()].concat([].slice.call(arguments)));
			return orig.apply(console, arguments);
		};
	});

	/*
	 *	page lifecycle
	 */
	window.addEventListener('pageshow', function (e) { log('pageshow persisted=' + e.persisted); });
	window.addEventListener('pagehide', function (e) { log('pagehide persisted=' + e.persisted); upload(true); });
	document.addEventListener('visibilitychange', function () { log('visibility ' + document.visibilityState); if (document.hidden) upload(true); });
	window.addEventListener('online',  function () { log('online'); });
	window.addEventListener('offline', function () { log('offline'); });

	/*
	 *	the board: redraws, tags, scroll
	 */
	document.addEventListener('DOMContentLoaded', function () {
		var scripts = [].map.call(document.scripts, function (s) { return s.src.replace(/https?:\/\/[^/]+\//, ''); }).filter(Boolean);
		log('scripts', scripts.join(' '));

		['showBoard', 'openBoard'].forEach(function (name) {
			var f = window[name];
			if (typeof f != 'function') return;
			window[name] = function () {
				log(name, '| from', caller(2));
				return f.apply(this, arguments);
			};
		});

		var last = {};
		setInterval(function () {
			var $ = window.jQuery;
			if (! $) return log('no jQuery');
			var $lists = $('.wrap .board .lists');
			var now = {
				board: $('.wrap .board').length,
				cards: $('.wrap .board .card').length,
				tags:  $('.wrap .board .wip-timer').filter(function () { return this.textContent; }).length,
				editing: $('.wrap .board .editing').length,
				scrollX: $lists.length ? Math.round($lists[0].scrollLeft) : null,
				scrollY: Math.round(window.scrollY)
			};
			if (now.board != last.board || now.cards != last.cards || now.tags != last.tags || now.editing != last.editing)
				log('state', now);
			else if ((last.scrollX > 30 && now.scrollX < 10) || (last.scrollY > 30 && now.scrollY < 10))
				log('SCROLL JUMPED BACK', last, '->', now);
			last = now;
		}, 500);
	});

	/*
	 *	upload, signed in
	 */
	var device;
	try
	{
		device = localStorage.getItem('nullboard.debugDevice');
		if (! device) localStorage.setItem('nullboard.debugDevice', device = Math.random().toString(36).slice(2, 8));
	}
	catch (e) { device = 'unknown'; }

	var docId = device + '-' + new Date(t0).toISOString().replace(/[:.]/g, '-');
	var LIVE = location.hostname == 'jmadkins99.github.io';
	var BASE = LIVE ? 'https://firestore.googleapis.com/v1/projects/jmadkins-kanban/databases/(default)/documents/'
	                : 'http://127.0.0.1:8080/v1/projects/demo-kanban/databases/(default)/documents/';
	var busy = false;

	function upload(leaving)
	{
		var user = window.firebase && firebase.apps && firebase.apps.length && firebase.auth().currentUser;
		if (! dirty || busy || ! user) return;
		busy = true;
		dirty = false;
		var body = JSON.stringify({ fields: {
			device: { stringValue: device },
			ua:     { stringValue: navigator.userAgent },
			at:     { timestampValue: new Date().toISOString() },
			lines:  { arrayValue: { values: lines.map(function (l) { return { stringValue: l }; }) } }
		} });
		user.getIdToken().then(function (tok) {
			return fetch(BASE + 'users/' + user.uid + '/debug/' + docId, {
				method: 'PATCH', keepalive: leaving && body.length < 60000, body: body,
				headers: { 'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json' }
			});
		}).then(function (r) {
			if (! r.ok) { dirty = true; lines.push(stamp() + ' debug upload failed: HTTP ' + r.status); }
		}, function (e) {
			dirty = true;
			lines.push(stamp() + ' debug upload failed: ' + (e && e.message));
		}).then(function () { busy = false; });
	}

	setInterval(upload, 5000);

	/*
	 *	on-page panel
	 */
	var panelOpen = false, $panel = null;

	function renderPanel()
	{
		if ($panel) $panel.textContent = lines.slice(-80).join('\n');
	}

	document.addEventListener('DOMContentLoaded', function () {
		var badge = document.createElement('div');
		badge.textContent = 'dbg';
		badge.style.cssText = 'position:fixed;left:4px;bottom:4px;z-index:99999;font:11px monospace;padding:2px 5px;background:#c00;color:#fff;border-radius:3px;opacity:.7';
		$panel = document.createElement('pre');
		$panel.style.cssText = 'display:none;position:fixed;left:0;right:0;bottom:24px;max-height:60vh;overflow:auto;z-index:99999;margin:0;padding:6px;font:10px/1.3 monospace;white-space:pre-wrap;word-break:break-all;background:rgba(0,0,0,.88);color:#0f0';
		badge.addEventListener('click', function () {
			panelOpen = ! panelOpen;
			$panel.style.display = panelOpen ? 'block' : 'none';
			renderPanel();
			if (panelOpen) $panel.scrollTop = $panel.scrollHeight;
		});
		document.body.appendChild($panel);
		document.body.appendChild(badge);
	});

})();
