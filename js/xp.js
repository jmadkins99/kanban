/*
 *	XP, and the experience bar along the bottom of the screen: a CSS
 *	recreation of World of Warcraft classic's (20 "bubbles", purple fill,
 *	grey bevelled frame, "Lvl 2, XP 290/900, 30%"), no Blizzard assets.
 *
 *	Total XP = banked XP + the XP of the cards sitting in Done lists.
 *	- A card moved into Done earns XP (stored on the card as xp + xpId).
 *	- Leaving Done any other way (moved out, deleted, Clear, Undo) drops it,
 *	  because the board no longer has it in Done.
 *	- Submit Day banks the Done cards' XP before clearing them. The bank is
 *	  keyed by xpId, so an Undo that brings banked cards back can't count
 *	  them twice, and syncing the bank is a plain merge.
 *	A card earns a flat amount by its Priority (AWARD), fixed when it enters
 *	Done: changing its Priority there doesn't change it, and time in WIP
 *	earns nothing. Level 1 takes 11500 XP and each level after costs 2% more
 *	than the one before, so 69 -> 70 takes 44209.
 */
(function () {

	var AWARD = { low: 2500, medium: 3500, critical: 5000, recurring: 5000 };

	// XP to go from `level` to level + 1, a whole number for the bar.
	function levelCost(level) { return Math.round(11500 * Math.pow(1.02, level - 1)); }

	function bank() { return NB.storage.getJson('xpBank') || {}; } // xpId -> XP

	function doneCards()
	{
		var cards = [];
		(NB.board ? NB.board.lists : []).forEach(function (l) {
			// Cards are saved as `notes`, Nullboard's name, so old boards, History days and export files load without a migration.
			if (isDoneTitle(l.title)) cards.push.apply(cards, l.notes);
		});
		return cards;
	}

	function total()
	{
		var b = bank(), sum = 0;
		for (var id in b) sum += b[id];
		doneCards().forEach(function (n) { if (n.xp && ! (n.xpId in b)) sum += n.xp; });
		return sum;
	}

	function progress(xp)
	{
		var level = 1, into = xp;
		while (into >= levelCost(level)) into -= levelCost(level++);
		var need = levelCost(level);
		return { xp: xp, level: level, into: into, need: need, pct: into / need * 100 };
	}

	/*
	 *	the bar
	 */
	var BUBBLES = { min: 1, max: 40, def: 20 };
	var shown = null;    // what the bar last showed, to animate from
	var gaining = false; // the next render follows a card moved into Done here

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

		$bar.attr({ 'aria-valuenow': Math.round(p.into), 'aria-valuemax': p.need,
		            'aria-valuetext': 'Level ' + p.level + ', ' + fmt(p.into) + ' of ' + fmt(p.need) + ' XP' });
		$bar.find('.xp-bar__text').text('Lvl ' + p.level + ', XP ' + fmt(p.into) + '/' + fmt(p.need) + ', ' + Math.floor(p.pct) + '%');

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

		// The level badge above the XP bar: insignia, level, rank (ranks.js).
		var rank = Ranks.forLevel(p.level);
		if (! shown || shown.level != p.level)
		{
			$('.level-badge .level-insignia').html(rank.svg);
			$('.level-badge .level-num').text('Lvl ' + p.level);
			$('.level-badge .level-rank').text(rank.name);
		}

		// A level reached by moving a card into Done gets the full show, just
		// after the card's +XP celebration has had a moment.
		if (gaining && shown && p.level > shown.level && window.LevelUp)
			setTimeout(function () { LevelUp.play({ level: p.level, rankName: rank.name, insigniaSvg: rank.svg }); }, 900);
		gaining = false;

		var was = shown;
		shown = p;
		return { before: was, now: p };
	}

	window.XP = {
		levelCost: levelCost,
		total: total,
		progress: progress,
		render: render,

		// A card just moved into Done: give it its Priority's XP, return the amount.
		award: function (meta)
		{
			gaining = true;
			meta.xp = AWARD[Priority.of(meta)];
			meta.xpId = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
			return meta.xp;
		},

		// Submit Day, before Done is cleared: keep these cards' XP for good.
		bankCards: function (cards)
		{
			var add = {};
			cards.forEach(function (n) { if (n.xp && n.xpId) add[n.xpId] = n.xp; });
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
