/*
 *	Cloud sync: the board and History in Firestore, per Google account.
 *	Follows gym-tracker's js/firebaseInit.js + js/storageRepo.js pattern.
 *
 *	- Only the live site talks to the real Firebase project. Anywhere else
 *	  (localhost, tests, a tunnel) Firebase stays off, unless a developer
 *	  opts in, and then it talks to the local emulators, never production:
 *	    bash tests/emulators.sh                                (Java 21+)
 *	    localStorage.setItem('nullboard.firebaseDev', 'true')  (then reload)
 *	  To see the board listener's order of events, turn on its trace (the
 *	  sync tests do): a `[sync] trace` line in the console per board
 *	  snapshot and per refusal of a board save this page sent.
 *	    localStorage.setItem('nullboard.syncTrace', 'true')    (no reload)
 *	- Signed out, nothing changes: the app runs on localStorage alone.
 *	- Signed in, localStorage stays a full mirror, the board is one document
 *	  and each History day is its own document. A change on one device shows
 *	  up live on the others.
 *	- Each board write carries a new rev, and as its base the rev of the
 *	  board this device's board was made from: the cloud's, once it's on
 *	  this device, or this device's own last write. The rules refuse it
 *	  unless that base is the cloud's current rev (a cloud board from
 *	  before revs takes any write), so a device whose board is behind (a
 *	  frozen tab, no signal, a write queued offline in an earlier session)
 *	  can't overwrite a newer one. After a refusal nothing goes up until
 *	  the cloud's board is on this device, even a save made since.
 *	- So when two devices edit at once, a save made on an older board than
 *	  the cloud's loses, even when it's the later save: the cloud's board
 *	  lands over it once any Card edit ends, and its push, if still
 *	  batched, never goes up. The cloud's board lands as a new revision,
 *	  so Undo gets back what this device had.
 *	- "Made on" goes by content, not by rev: a cloud board whose content
 *	  matches the board this device's board was made from counts as its
 *	  base, whichever device wrote it. So when two devices save the same
 *	  board and one's write is refused, a save it made since goes up if
 *	  its push is still batched: the other device's save is already
 *	  inside it. One whose push already went carries the refused write's
 *	  rev as its base, so it's refused too and kept only in Undo.
 *	- A History day is only created, never replaced: the rules refuse a
 *	  write to a day the cloud already has, so a device that filed a day
 *	  offline (asleep across midnight, say) can't overwrite the one another
 *	  device filed. After a refusal this device takes the cloud's History
 *	  from the server, never the stale copy in its cache.
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
	function trace(line) { if (localStorage.getItem('nullboard.syncTrace') == 'true') console.log('[sync] trace ' + line()); } // line: built only when tracing
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
		var made   = null;  // the rev this device's board was made from, its next write's base (see firestore.rules): the cloud board's once on this device, or its own last write's
		var origin = null;  // canon() of that board: a cloud board with the same content, under any rev, is one this device's board was made from too
		var seen   = null;  // the rev of the cloud board it last saw
		var stale  = false; // a write was refused: nothing goes up until the cloud's board is on this device
		var known  = false; // whether the cloud's board is known yet (never push blind)
		var timer  = null;
		var fresh;          // resolves sync.boardFresh: the server's board has been seen
		sync.boardFresh = new Promise(function (r) { fresh = r; });

		// Firestore hands maps back with sorted keys, so compare a fixed shape.
		// It leaves out rev and base, so boards compare, and an echo is
		// spotted, by content alone.
		// It includes the day the board last changed: without it a board from
		// another device arrives undated, and Auto-submit (rollDay) skips it,
		// so Done never clears at midnight.
		function canon(b)
		{
			return JSON.stringify({
				title: b.title || '',
				day:   b.day || null,
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

		// The board as it goes up: a new rev, and the rev it was made from.
		// The new rev is the base of this device's next write.
		function nextWrite(c)
		{
			var data = JSON.parse(c);
			data.rev  = boardRef.parent.doc().id; // a random id, no write
			data.base = made;
			data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
			made   = data.rev;
			origin = c;
			return data;
		}

		function pushBoard()
		{
			clearTimeout(timer);
			timer = null;

			if (! known || stale || ! NB.board)
				return;

			var c = canon(NB.board);
			if (c == synced)
				return;

			synced = c;
			boardRef.set(nextWrite(c)).catch(function (e) {
				if (! e || e.code != 'permission-denied')
					return warn('board write')(e);

				// The server refused it: Firestore rolls back its copy and the
				// listener brings in the cloud's board, which applyBoard takes.
				// Unless the cloud's board got here before the refusal did, and
				// is already on this device.
				console.warn("[sync] board write refused: this device's board was stale, so it takes the cloud's");
				stale = made != seen;
				trace(function () { return 'refused: made=' + made + ' seen=' + seen + ' stale=' + stale; });
			});
		}

		function applyBoard(c)
		{
			if (synced != c || ! NB.board)
				return;

			// Compared as this device sorts it: a board from a device that
			// sorts another way (a tab still on an older version) can hold
			// this one's content in another order. That isn't news, so it's
			// not redrawn (a redraw throws a phone back to Backlog), nor its
			// order sent back, which that device would sort and send again,
			// without end.
			var sorted = JSON.parse(c);
			orderBoard(sorted);

			if (canon(NB.board) != canon(sorted))
			{
				if ($('.wrap .board .editing').length) // don't yank a card out from under the cursor
					return setTimeout(function () { applyBoard(c); }, 1000);

				// A save since (often the very edit it waited for) whose push
				// is still batched was made on an older board than the
				// cloud's, so the rules would refuse it: it's overwritten
				// here, kept only in Undo.
				clearTimeout(timer);
				timer = null;

				var b = JSON.parse(c);
				b.format   = NB.blobVersion;
				b.id       = NB.board.id;
				b.revision = NB.board.revision; // saved as the next revision, so Undo steps back
				NB.storage.saveBoard(b);
				openBoard(b.id);
			}

			made   = seen;
			origin = c;
			stale  = false;
		}

		// Batched a little: the board saves after every edit.
		sync.boardChanged = function () { clearTimeout(timer); timer = setTimeout(pushBoard, 1000); };

		// Don't lose the last second of edits when the tab goes away; with
		// offline persistence the write is queued even if it can't send yet.
		window.addEventListener('pagehide', function () { if (timer) pushBoard(); });
		document.addEventListener('visibilitychange', function () { if (document.hidden && timer) pushBoard(); });

		boardRef.onSnapshot({ includeMetadataChanges: true }, function (snap) {
			trace(function () {
				return 'snapshot: hasPendingWrites=' + snap.metadata.hasPendingWrites + ' fromCache=' + snap.metadata.fromCache +
					' rev=' + (snap.exists ? snap.data().rev || null : 'none') + ' stale=' + stale + ' batched=' + (timer != null);
			});

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
				var data = nextWrite(synced);
				db.runTransaction(function (t) {
					return t.get(boardRef).then(function (d) { if (! d.exists) t.set(boardRef, data); });
				}).catch(warn('first board upload'));
				return;
			}

			// The board a refused write rolls back to is the one this device
			// last saw, which the refusal proves the cloud has moved on from:
			// wait for the server's. It can come from the cache or, while the
			// cloud's newer board is still on its way, from the server.
			// The refusal's handler runs first: Firestore settles the write
			// before it delivers the rolled-back board.
			var rev = snap.data().rev || null;
			if (stale && (snap.metadata.fromCache || rev == seen))
				return;

			known = true;
			seen = rev;
			var c = canon(snap.data());
			if (c == origin) // our own write's echo, or the same board under another rev
				made = seen;
			if (c == synced)
			{
				// A refused write that matched the cloud's board anyway: any
				// save since was made on the cloud's board, so it goes up.
				if (stale && made == seen)
				{
					stale = false;
					if (canon(NB.board) != c)
						sync.boardChanged();
				}
				return;
			}
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
		var daysStale = false; // a day write was refused: the cache's History is stale until the server's arrives

		function mirrorHistory(snap)
		{
			if (snap.metadata.fromCache && (snap.empty || daysStale)) // a cold cache, not an empty History; or the old one a refused write rolls back to
				return;

			daysStale = false;
			var days = [];
			snap.forEach(function (d) { days.push(d.data()); });
			NB.storage.setJson('history', days);

			if ($('body').hasClass('view-history'))
				renderHistory();
		}

		sync.dayChanged = function (entry) {
			daysCol.doc(entry.day).set(plain(entry)).catch(function (e) {
				if (! e || e.code != 'permission-denied')
					return warn('day write')(e);

				// Until the server's History is here, this device keeps the day
				// it filed, so Auto-submit doesn't take the day as unfiled and
				// send it again.
				console.warn('[sync] day write refused: ' + entry.day + " was already filed, so this device takes the cloud's");
				daysStale = true;
				daysCol.get({ source: 'server' }).then(mirrorHistory, warn('History reload'));
			});
		};
		sync.dayDeleted = function (day) { daysCol.doc(day).delete().catch(warn('day delete')); };

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
				// With metadata changes, so the server's History is noticed even
				// when it matches the cache, and a refusal's wait ends.
				daysCol.onSnapshot({ includeMetadataChanges: true }, mirrorHistory, warn('History listener'));
			})
			.catch(function (e) { console.warn('[sync] History import postponed to the next load:', e && (e.code || e.message)); });
	}

})();
