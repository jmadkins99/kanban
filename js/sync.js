/*
 *	Cloud sync: the board and History in Firestore, per Google account.
 *	Follows gym-tracker's js/firebaseInit.js + js/storageRepo.js pattern.
 *
 *	- Only the live site talks to the real Firebase project. Anywhere else
 *	  (localhost, tests, a tunnel) Firebase stays off, unless a developer
 *	  opts in, and then it talks to the local emulators, never production:
 *	    bash tests/emulators.sh                                (Java 21+)
 *	    localStorage.setItem('nullboard.firebaseDev', 'true')  (then reload)
 *	- Signed out, nothing changes: the app runs on localStorage alone.
 *	- Signed in, localStorage stays a full mirror, the board is one document
 *	  and each History day is its own document. A change on one device shows
 *	  up live on the others. Two devices editing at once: the last save wins,
 *	  and an incoming board lands as a new revision, so Undo gets back what
 *	  this device had.
 *	- Signing in or out reloads the page, like gym-tracker.
 */
(function () {

	var CONFIG = {
		apiKey:            "AIzaSyDKNPzpJuu5FNkzZ_7quLXknHNJqUkG3D4", // not a secret: the rules guard the data
		authDomain:        "jmadkins-kanban.firebaseapp.com",
		projectId:         "jmadkins-kanban",
		storageBucket:     "jmadkins-kanban.firebasestorage.app",
		messagingSenderId: "575206734941",
		appId:             "1:575206734941:web:dcdb8e05609d32d8c061b4"
	};

	var SDK  = 'https://www.gstatic.com/firebasejs/10.14.1/';
	var LIVE = location.hostname == 'jmadkins99.github.io';
	var DEV  = ! LIVE && localStorage.getItem('nullboard.firebaseDev') == 'true';

	var IMPORTED = 'nullboard.historyImportedFor'; // uid whose cloud History this device mirrors

	function noop() {}
	function warn(what) { return function (e) { console.warn('[sync] ' + what + ' failed:', e && (e.code || e.message)); }; }
	function plain(x) { return JSON.parse(JSON.stringify(x)); } // Firestore takes plain objects only

	var sync = window.cloudSync = { boardChanged: noop, dayChanged: noop, dayDeleted: noop, bankXp: noop };

	// Resolves to 'off', 'signed-out' or 'signed-in'.
	sync.ready = (LIVE || DEV) ? init() : Promise.resolve('off');

	function load(name)
	{
		return new Promise(function (resolve, reject) {
			var s = document.createElement('script');
			s.src = SDK + name;
			s.onload = resolve;
			s.onerror = function () { reject(new Error('SDK script failed to load: ' + name)); };
			document.head.appendChild(s);
		});
	}

	function init()
	{
		// app-compat must run before the feature SDKs.
		return load('firebase-app-compat.js')
			.then(function () { return Promise.all([ load('firebase-auth-compat.js'), load('firebase-firestore-compat.js') ]); })
			.then(function () {
				firebase.initializeApp(DEV ? Object.assign({}, CONFIG, { projectId: 'demo-kanban' }) : CONFIG);
				var db = firebase.firestore();

				if (DEV)
				{
					// No "Running in emulator mode" banner: it covers the XP bar, and
					// these are fake accounts on this PC, never production ones.
					firebase.auth().useEmulator('http://127.0.0.1:9099', { disableWarnings: true });
					db.useEmulator('127.0.0.1', 8080);
				}

				db.enablePersistence({ synchronizeTabs: true }).catch(warn('offline persistence'));

				// The first auth callback decides, from cached credentials, so it works offline too.
				return new Promise(function (resolve) {
					var off = firebase.auth().onAuthStateChanged(function (user) { off(); resolve(user); });
				});
			})
			.then(function (user) {
				showMenu(user);
				if (! user)
					return 'signed-out';
				start(user);
				return 'signed-in';
			})
			.catch(function (e) {
				console.warn('[sync] unavailable, staying local-only:', e && e.message);
				return 'off';
			});
	}

	function showMenu(user)
	{
		// Popup, not redirect: redirect breaks on browsers that partition
		// third-party storage when authDomain isn't the app's own domain.
		$('.config .sync-in').toggle(! user).on('click', function () {
			firebase.auth().signInWithPopup(new firebase.auth.GoogleAuthProvider())
				.then(function () { location.reload(); })
				.catch(function (e) {
					if (e && e.code == 'auth/popup-closed-by-user') return;
					alert('Sign-in failed: ' + ((e && e.message) || 'unknown error'));
				});
			return false;
		});

		$('.config .sync-out').toggle(!! user).on('click', function () {
			localStorage.removeItem(IMPORTED);
			firebase.auth().signOut().then(function () { location.reload(); });
			return false;
		});

		if (user && user.email)
			$('.config .sync-out').attr('title', 'Signed in as ' + user.email);
	}

	/*
	 *	signed in
	 */
	function start(user)
	{
		var db      = firebase.firestore();
		var userDoc = db.collection('users').doc(user.uid);
		var boardRef = userDoc.collection('kanban').doc('board');
		var daysCol  = userDoc.collection('history');

		/*
		 *	board
		 */
		var synced = null;  // canon() of the board as the cloud last had it
		var known  = false; // whether the cloud's board is known yet (never push blind)
		var timer  = null;
		var fresh;          // resolves sync.boardFresh: the server's board has been seen
		sync.boardFresh = new Promise(function (r) { fresh = r; });

		// Firestore hands maps back with sorted keys, so compare a fixed shape.
		function canon(b)
		{
			return JSON.stringify({
				title: b.title || '',
				lists: (b.lists || []).map(function (l) {
					return {
						title: l.title || '',
						// Cards are saved as `notes`, Nullboard's name, so old boards, History days and export files load without a migration.
						notes: (l.notes || []).map(function (n) {
							var o = { text: n.text || '' };
							// plus every other per-Card field (Priority, Arrival, WIP and Critical timers, XP,
							// Schedule and Due date), in a fixed key order. Nullboard's raw and
							// collapsed flags are no longer shown, so they're left out.
							Object.keys(n).sort().forEach(function (k) { if (! (k in o) && k != 'raw' && k != 'min' && n[k] != null) o[k] = n[k]; });
							return o;
						})
					};
				})
			});
		}

		function pushBoard()
		{
			clearTimeout(timer);
			timer = null;

			if (! known || ! NB.board)
				return;

			var c = canon(NB.board);
			if (c == synced)
				return;

			synced = c;
			var data = JSON.parse(c);
			data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
			boardRef.set(data).catch(warn('board write'));
		}

		function applyBoard(c)
		{
			if (synced != c || ! NB.board || canon(NB.board) == c)
				return;

			if ($('.wrap .board .editing').length) // don't yank a card out from under the cursor
				return setTimeout(function () { applyBoard(c); }, 1000);

			var b = JSON.parse(c);
			b.format   = NB.blobVersion;
			b.id       = NB.board.id;
			b.revision = NB.board.revision; // saved as the next revision, so Undo steps back
			NB.storage.saveBoard(b);
			openBoard(b.id);
		}

		// Batched a little: the board saves after every edit.
		sync.boardChanged = function () { clearTimeout(timer); timer = setTimeout(pushBoard, 1000); };

		// Don't lose the last second of edits when the tab goes away; with
		// offline persistence the write is queued even if it can't send yet.
		window.addEventListener('pagehide', function () { if (timer) pushBoard(); });
		document.addEventListener('visibilitychange', function () { if (document.hidden && timer) pushBoard(); });

		boardRef.onSnapshot({ includeMetadataChanges: true }, function (snap) {
			if (! snap.metadata.fromCache) // its callbacks run after this one, once the board is applied
				fresh();

			if (snap.metadata.hasPendingWrites) // our own write, not news
				return;

			if (! snap.exists)
			{
				if (snap.metadata.fromCache) // a cold cache knows nothing yet
					return;

				// The cloud is empty: this device's board goes up, but only if
				// it's still empty when the write lands. Another device signing
				// in at the same moment may get there first; then its board
				// arrives through this listener instead of being overwritten.
				known = true;
				synced = canon(NB.board);
				var data = JSON.parse(synced);
				data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
				db.runTransaction(function (t) {
					return t.get(boardRef).then(function (d) { if (! d.exists) t.set(boardRef, data); });
				}).catch(warn('first board upload'));
				return;
			}

			known = true;
			var c = canon(snap.data());
			if (c == synced)
				return;
			synced = c;
			applyBoard(c);
		}, warn('board listener'));

		/*
		 *	XP bank (xpId -> XP, see xp.js): a merge both ways, so repeating
		 *	it is harmless and two devices' banks simply add up.
		 */
		var xpRef = userDoc.collection('kanban').doc('xp');

		sync.bankXp = function (add) { xpRef.set({ bank: add }, { merge: true }).catch(warn('XP write')); };

		if (window.XP && Object.keys(XP.bank()).length)
			sync.bankXp(XP.bank());

		xpRef.onSnapshot(function (snap) {
			if (snap.exists && window.XP) XP.mergeBank(snap.data().bank);
		}, warn('XP listener'));

		/*
		 *	History
		 */
		sync.dayChanged = function (entry) { daysCol.doc(entry.day).set(plain(entry)).catch(warn('day write')); };
		sync.dayDeleted = function (day)   { daysCol.doc(day).delete().catch(warn('day delete')); };

		// Each device's first sign-in imports its History: days the cloud
		// already has win, this device's other days go up. After that the
		// cloud's History is the source of truth and this device mirrors it.
		// The marker is per device, and sign-out clears it, so days logged
		// while signed out still go up on the next sign-in.
		Promise.resolve()
			.then(function () {
				if (localStorage.getItem(IMPORTED) == user.uid)
					return;

				return daysCol.get({ source: 'server' }).then(function (snap) {
					var have = {};
					snap.forEach(function (d) { have[d.id] = true; });

					var ups = loadHistory().filter(function (e) { return ! have[e.day]; });
					var commits = [];

					for (var i = 0; i < ups.length; i += 400) // a batch takes at most 500 writes
					{
						var batch = db.batch();
						ups.slice(i, i + 400).forEach(function (e) { batch.set(daysCol.doc(e.day), plain(e)); });
						commits.push(batch.commit());
					}

					return Promise.all(commits).then(function () {
						localStorage.setItem(IMPORTED, user.uid);
					});
				});
			})
			.then(function () {
				daysCol.onSnapshot(function (snap) {
					if (snap.metadata.fromCache && snap.empty) // a cold cache, not an empty History
						return;

					var days = [];
					snap.forEach(function (d) { days.push(d.data()); });
					NB.storage.setJson('history', days);

					if ($('body').hasClass('view-history'))
						renderHistory();
				}, warn('History listener'));
			})
			.catch(function (e) { console.warn('[sync] History import postponed to the next load:', e && (e.code || e.message)); });
	}

})();
