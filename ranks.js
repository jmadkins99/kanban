// Military ranks for levels 1-70, names as in Call of Duty: Modern Warfare 2 (2009) multiplayer.
// Insignia are original SVG drawings modelled on public US Army rank insignia (no game art).
(function () {
  'use strict';
  var uid = 0;

  var METALS = {
    gold: { stops: ['#fff4c4', '#f2c75c', '#a8741c', '#ebbb4c', '#7a4f10'], edge: '#3b2706' },
    silver: { stops: ['#ffffff', '#d9dde8', '#8b91a2', '#e4e8f0', '#666b7b'], edge: '#262a35' }
  };

  function star(cx, cy, r) {
    var p = [];
    for (var i = 0; i < 10; i++) {
      var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.4 : r;
      p.push((cx + rr * Math.cos(a)).toFixed(1) + ' ' + (cy + rr * Math.sin(a)).toFixed(1));
    }
    return 'M' + p.join('L') + 'Z';
  }

  // Enlisted: n chevrons (pointing up), m rockers, optional centre device.
  function enlisted(n, m, device) {
    return function () {
      var chevH = (n - 1) * 10 + 25, H = chevH + (m ? 1 + (m - 1) * 9 + 17 : 0);
      var y0 = (88 - H) / 2, d = '', i, y;
      for (i = 0; i < n; i++) {
        y = y0 + i * 10;
        d += 'M10 ' + (y + 18) + 'L50 ' + y + 'L90 ' + (y + 18) + 'L90 ' + (y + 25) + 'L50 ' + (y + 7) + 'L10 ' + (y + 25) + 'Z';
      }
      for (i = 0; i < m; i++) {
        y = y0 + chevH + 1 + i * 9;
        d += 'M10 ' + y + 'Q50 ' + (y + 20) + ' 90 ' + y + 'L90 ' + (y + 7) + 'Q50 ' + (y + 27) + ' 10 ' + (y + 7) + 'Z';
      }
      var cy = y0 + 43, extra = '';
      if (device === 'diamond') d += 'M50 ' + (cy - 10) + 'L59 ' + cy + 'L50 ' + (cy + 10) + 'L41 ' + cy + 'Z';
      if (device === 'star') d += star(50, cy, 10.5);
      if (device === 'wreath') {
        d += star(50, cy + 0.5, 7);
        // laurel wreath: two dashed arcs read as leaves
        extra = '<path d="M41 ' + (cy - 7) + 'A11 11 0 0 0 49 ' + (cy + 11) + 'M59 ' + (cy - 7) + 'A11 11 0 0 1 51 ' + (cy + 11) +
          '" fill="none" stroke="FILL" stroke-width="3.2" stroke-dasharray="3 1.4" stroke-linecap="round"/>';
      }
      return { metal: 'gold', d: d, extra: extra };
    };
  }

  function specialist() {
    var d = 'M12 34Q50 6 88 34L88 52Q50 82 12 52Z' + // shield, inner cut-out below
      'M19 38L19 49Q50 72 81 49L81 38Q50 16 19 38Z';
    // simplified eagle with spread wings inside the shield
    var e = 'M50 30C46 30 45 34 46 37L30 31L36 39L25 38L33 44L44 44L45 52L41 58L50 55L59 58L55 52L56 44L67 44L75 38L64 39L70 31L54 37C55 34 54 30 50 30Z';
    return { metal: 'gold', d: d, fillRule: 'evenodd', extra: '<path d="' + e + '" fill="FILL" stroke="EDGE" stroke-width="0.8" stroke-linejoin="round"/>' };
  }

  function bars(count, metal) {
    return function () {
      var d = '', x0 = count === 1 ? 41 : 28;
      for (var i = 0; i < count; i++) {
        var x = x0 + i * 26;
        d += 'M' + (x + 3) + ' 18H' + (x + 15) + 'Q' + (x + 18) + ' 18 ' + (x + 18) + ' 21V71Q' + (x + 18) + ' 74 ' + (x + 15) + ' 74H' + (x + 3) + 'Q' + x + ' 74 ' + x + ' 71V21Q' + x + ' 18 ' + (x + 3) + ' 18Z';
      }
      var lines = '';
      for (i = 0; i < count; i++) lines += '<path d="M' + (x0 + i * 26 + 9) + ' 24V68" stroke="EDGE" stroke-opacity=".35" stroke-width="1.2"/>';
      return { metal: metal, d: d, extra: lines };
    };
  }

  function oakLeaf(metal) {
    return function () {
      // right half: notches and lobe tips (x offset from the midline); lobes are rounded with Q curves
      var notch = [[0, 6], [7, 22], [11, 38], [11, 55], [6, 70], [3, 76]];
      var lobe = [[13, 13], [22, 29], [25, 47], [20, 64], [9, 75]];
      function side(sign, rev) {
        var s = '', idx = [0, 1, 2, 3, 4];
        if (rev) idx.reverse();
        idx.forEach(function (i) {
          var a = notch[rev ? i + 1 : i], b = notch[rev ? i : i + 1], o = lobe[i];
          var cx = 2 * o[0] - (a[0] + b[0]) / 2, cy = 2 * o[1] - (a[1] + b[1]) / 2;
          s += 'Q' + (50 + sign * cx) + ' ' + cy + ' ' + (50 + sign * b[0]) + ' ' + b[1];
        });
        return s;
      }
      var d = 'M50 6' + side(1, false) + 'L52 86L48 86L' + 47 + ' 76' + side(-1, true) + 'Z';
      var veins = '<path d="M50 14V80M50 30L60 24M50 44L66 40M50 58L64 58M50 30L40 24M50 44L34 40M50 58L36 58" fill="none" stroke="EDGE" stroke-opacity=".45" stroke-width="1.3" stroke-linecap="round"/>';
      return { metal: metal, d: d, extra: veins };
    };
  }

  function eagle() {
    var L = [[46, 40], [4, 14], [12, 26], [8, 31], [18, 34], [14, 40], [24, 42], [22, 48], [32, 48], [32, 54], [42, 52], [45, 57]];
    var pts = L.concat(L.slice().reverse().map(function (p) { return [100 - p[0], p[1]]; }));
    var wings = 'M' + pts.map(function (p) { return p.join(' '); }).join('L') + 'Z';
    var tail = 'M44 58L56 58L61 76L55 72L50 78L45 72L39 76Z';
    var body = 'M50 34C57 34 58 44 57 50C56 58 52 62 50 62C48 62 44 58 43 50C42 44 43 34 50 34Z';
    // head faces the eagle's right (viewer's left), hooked beak
    var head = 'M51 22C56 22 58 26 57 30C56 33 54 35 52 36L48 36C46 34 45 32 44 31L39 32Q40 28 44 27C45 24 48 22 51 22Z';
    var part = '" fill="FILL" stroke="EDGE" stroke-width="1" stroke-linejoin="round"/>';
    return {
      metal: 'silver', d: wings,
      extra: '<path d="M14 18Q30 22 44 38M86 18Q70 22 56 38" fill="none" stroke="EDGE" stroke-opacity=".4" stroke-width="1.2"/>' +
        '<path d="' + tail + part + '<path d="' + body + part + '<path d="' + head + part +
        '<circle cx="50" cy="27" r="1.3" fill="EDGE"/>'
    };
  }

  function stars(n) {
    return function () {
      var d = '';
      if (n === 5) {
        for (var k = 0; k < 5; k++) {
          var a = -Math.PI / 2 + k * 2 * Math.PI / 5;
          d += star(50 + 25 * Math.cos(a), 47 + 25 * Math.sin(a), 13);
        }
      } else {
        var r = [0, 22, 18, 13.5, 10.5][n], gap = [0, 0, 38, 30, 23][n];
        for (var i = 0; i < n; i++) d += star(50 + (i - (n - 1) / 2) * gap, 46, r);
      }
      return { metal: 'silver', d: d, extra: '' };
    };
  }

  // [base name, number of tiers (base, I, II, III), drawer]; source: Call of Duty Wiki MW2 ranks page
  var BASES = [
    ['Private', 3, enlisted(1, 0)],
    ['Private First Class', 3, enlisted(1, 1)],
    ['Specialist', 3, specialist],
    ['Corporal', 3, enlisted(2, 0)],
    ['Sergeant', 3, enlisted(3, 0)],
    ['Staff Sergeant', 3, enlisted(3, 1)],
    ['Sergeant First Class', 3, enlisted(3, 2)],
    ['Master Sergeant', 3, enlisted(3, 3)],
    ['First Sergeant', 3, enlisted(3, 3, 'diamond')],
    ['Sergeant Major', 3, enlisted(3, 3, 'star')],
    ['Command Sergeant Major', 3, enlisted(3, 3, 'wreath')],
    ['2nd Lieutenant', 3, bars(1, 'gold')],
    ['1st Lieutenant', 3, bars(1, 'silver')],
    ['Captain', 3, bars(2, 'silver')],
    ['Major', 3, oakLeaf('gold')],
    ['Lieutenant Colonel', 4, oakLeaf('silver')],
    ['Colonel', 4, eagle],
    ['Brigadier General', 4, stars(1)],
    ['Major General', 4, stars(2)],
    ['Lieutenant General', 4, stars(3)],
    ['General', 4, stars(4)],
    ['Commander', 1, stars(5)]
  ];
  var TIER = ['', ' I', ' II', ' III'];
  var LEVELS = [];
  BASES.forEach(function (b) {
    for (var t = 0; t < b[1]; t++) LEVELS.push({ name: b[0] + TIER[t], tier: t, draw: b[2] });
  });

  function svgFor(entry) {
    var id = 'rk' + (++uid), art = entry.draw(), m = METALS[art.metal];
    var fill = 'url(#' + id + 'g)';
    var stops = m.stops.map(function (c, i) { return '<stop offset="' + [0, .3, .55, .78, 1][i] + '" stop-color="' + c + '"/>'; }).join('');
    var pips = '';
    for (var i = 0; i < entry.tier; i++) pips += '<circle cx="' + (50 + (i - (entry.tier - 1) / 2) * 10) + '" cy="94" r="3.6"/>';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="' + entry.name + '">' +
      '<title>' + entry.name + '</title>' +
      '<defs><linearGradient id="' + id + 'g" x1="0" y1="0" x2=".35" y2="1">' + stops + '</linearGradient></defs>' +
      '<path d="' + art.d + '" fill="' + fill + '" fill-rule="' + (art.fillRule || 'nonzero') + '" stroke="' + m.edge + '" stroke-width="1" stroke-linejoin="round"/>' +
      art.extra.replace(/FILL/g, fill).replace(/EDGE/g, m.edge) +
      (pips ? '<g fill="' + fill + '" stroke="' + m.edge + '" stroke-width=".8">' + pips + '</g>' : '') +
      '</svg>';
  }

  window.Ranks = {
    count: LEVELS.length,
    forLevel: function (level) {
      var lv = Math.max(1, Math.floor(Number(level)) || 1);
      var e = LEVELS[Math.min(lv, LEVELS.length) - 1]; // levels above 70 keep the last rank
      return { level: lv, name: e.name, svg: svgFor(e) };
    }
  };
})();
