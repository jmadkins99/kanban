/*
 *	XP, and the experience bar along the bottom of the screen: a CSS
 *	recreation of World of Warcraft classic's (20 "bubbles", purple fill,
 *	grey bevelled frame, "Lvl 2, XP 290/900, 30%"), no Blizzard assets.
 *
 *	Total XP = banked XP + the XP of the notes sitting in Done lists.
 *	- A note moved into Done earns XP (stored on the note as xp + xpId).
 *	- Leaving Done any other way (moved out, deleted, Clear, Undo) drops it,
 *	  because the board no longer has it in Done.
 *	- Submit Day banks the Done notes' XP before clearing them. The bank is
 *	  keyed by xpId, so an Undo that brings banked notes back can't count
 *	  them twice, and syncing the bank is a plain merge.
 *	A level is 4.6 cards' worth: 2500 XP a card, 11500 a level. On top of
 *	that, each whole minute of the note's last visit to WIP adds 0.5% of a
 *	level (57.5 XP), up to 8 hours.
 */
(function () {

	var PER_CARD  = 2500;
	var PER_LEVEL = PER_CARD * 4.6;
	var PER_WIP_MINUTE = PER_LEVEL * 0.005;
	var WIP_CAP_MS = 8 * 3600 * 1000;

	function bank() { return NB.storage.getJson('xpBank') || {}; } // xpId -> XP

	function doneNotes()
	{
		var notes = [];
		(NB.board ? NB.board.lists : []).forEach(function (l) {
			if (isDoneTitle(l.title)) notes.push.apply(notes, l.notes);
		});
		return notes;
	}

	function total()
	{
		var b = bank(), sum = 0;
		for (var id in b) sum += b[id];
		doneNotes().forEach(function (n) { if (n.xp && ! (n.xpId in b)) sum += n.xp; });
		return sum;
	}

	function progress(xp)
	{
		var level = Math.floor(xp / PER_LEVEL) + 1;
		var into  = xp - (level - 1) * PER_LEVEL;
		return { xp: xp, level: level, into: into, pct: into / PER_LEVEL * 100 };
	}

	/*
	 *	the bar
	 */
	var BUBBLES = { min: 1, max: 40, def: 20 };
	var shown = null;    // what the bar last showed, to animate from
	var gaining = false; // the next render follows a note moved into Done here

	function bubbles()
	{
		var n = NB.storage.getJson('xpBubbles');
		return (n >= BUBBLES.min && n <= BUBBLES.max) ? n : BUBBLES.def;
	}

	function setBubbles(n)
	{
		n = Math.max(BUBBLES.min, Math.min(BUBBLES.max, n));
		NB.storage.setJson('xpBubbles', n);
		$('.xp-bar').css('--xp-bubbles', n);
		$('.config .f-prefs .ui-xp .val').text(n);
	}

	function fmt(n) { return Math.round(n).toLocaleString('en-US'); }

	function render()
	{
		var p = progress(total());
		var $bar = $('.xp-bar'), $fill = $bar.find('.xp-bar__fill');

		$bar.attr({ 'aria-valuenow': Math.round(p.into), 'aria-valuemax': PER_LEVEL,
		            'aria-valuetext': 'Level ' + p.level + ', ' + fmt(p.into) + ' of ' + fmt(PER_LEVEL) + ' XP' });
		$bar.find('.xp-bar__text').text('Lvl ' + p.level + ', XP ' + fmt(p.into) + '/' + fmt(PER_LEVEL) + ', ' + Math.floor(p.pct) + '%');

		var pct = p.pct + '%';
		if (shown && p.level > shown.level)
		{
			// Fill to the end, snap to empty, then grow: never animate backwards on a level-up.
			$bar.css('--xp-pct', '100%');
			$fill.one('transitionend', function () {
				$fill.css('transition', 'none');
				$bar.css('--xp-pct', '0%');
				$fill[0].offsetWidth;
				$fill.css('transition', '');
				$bar.css('--xp-pct', pct);
			});
		}
		else
			$bar.css('--xp-pct', pct);

		// The level badge beside Submit Day: insignia, level, rank (ranks.js).
		var rank = Ranks.forLevel(p.level);
		if (! shown || shown.level != p.level)
		{
			$('.level-badge .level-insignia').html(rank.svg);
			$('.level-badge .level-num').text('Lvl ' + p.level);
			$('.level-badge .level-rank').text(rank.name);
		}

		// A level reached by moving a note into Done gets the full show, just
		// after the card's +XP celebration has had a moment.
		if (gaining && shown && p.level > shown.level && window.LevelUp)
			setTimeout(function () { LevelUp.play({ level: p.level, rankName: rank.name, insigniaSvg: rank.svg }); }, 900);
		gaining = false;

		var was = shown;
		shown = p;
		return { before: was, now: p };
	}

	window.XP = {
		PER_CARD: PER_CARD,
		PER_LEVEL: PER_LEVEL,
		total: total,
		progress: progress,
		render: render,

		// A note just moved into Done: give it its XP, return the amount.
		// Its WIP time is the visit still running (straight from WIP) or the
		// last one it finished.
		award: function (meta)
		{
			gaining = true;
			var wipMs = meta.wip ? Date.now() - meta.wip : (meta.wipMs || 0);
			var minutes = Math.floor(Math.min(wipMs, WIP_CAP_MS) / 60000);
			meta.xp = Math.round(PER_CARD + minutes * PER_WIP_MINUTE);
			meta.xpId = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
			return meta.xp;
		},

		// Submit Day, before Done is cleared: keep these notes' XP for good.
		bankNotes: function (notes)
		{
			var add = {};
			notes.forEach(function (n) { if (n.xp && n.xpId) add[n.xpId] = n.xp; });
			if (! Object.keys(add).length) return;
			NB.storage.setJson('xpBank', Object.assign(bank(), add));
			if (window.cloudSync) cloudSync.bankXp(add);
		},

		// The bank as synced from another device: a union, so nothing is lost.
		mergeBank: function (other)
		{
			NB.storage.setJson('xpBank', Object.assign(bank(), other || {}));
			render();
		},

		bank: bank
	};

	/*
	 *	setup
	 */
	$('body').append(
		'<div class=xp-bar role=progressbar aria-label=Experience aria-valuemin=0>' +
			'<div class=xp-bar__fill></div><span class=xp-bar__text></span>' +
		'</div>');
	setBubbles(bubbles());

	$('.config .f-prefs .ui-xp .less').on('click', function () { setBubbles(bubbles() - 1); return false; });
	$('.config .f-prefs .ui-xp .more').on('click', function () { setBubbles(bubbles() + 1); return false; });
	$('.config .f-prefs .ui-xp .val').on('click', function () { setBubbles(BUBBLES.def); return false; });

	render();

})();
