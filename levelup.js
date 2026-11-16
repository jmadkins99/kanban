/* LevelUp: a self-contained level-up celebration.
 * window.LevelUp.play({ level, rankName, insigniaSvg, sound = true }) -> Promise
 * No dependencies. Injects its CSS (and a Google Fonts link) once, on load.
 */
(function () {
  'use strict';

  // Beat sheet in ms. The CSS delays below are written to match these.
  var T = { burst: 600, slam: 1230, shine: 2300, out: 4450, fade: 750 };

  var CSS = [
    '.lu-ov{position:fixed;inset:0;z-index:2147483600;overflow:hidden;cursor:pointer;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;',
    '  --ac:var(--accent-hi,#a48bff);--acr:var(--accent-rgb,58,42,90);--g1:#fff7dc;--g2:#ffd66b;--g3:#f0a92c;--g4:#8a520b;',
    '  font-family:Cinzel,"Trajan Pro","Palatino Linotype",Georgia,serif;color:#e6e6f2;line-height:1}',
    '.lu-ov *{box-sizing:border-box}',
    '.lu-ov .lu-l{position:absolute;pointer-events:none}',
    '.lu-dim{inset:0;opacity:0;background:radial-gradient(ellipse 80% 70% at 50% 50%,rgba(var(--acr),.5),rgba(5,5,16,.6) 75%),linear-gradient(rgba(5,5,16,.62),rgba(5,5,16,.62));animation:lu-in .45s ease-out forwards}',
    '.lu-shake{inset:0;animation:lu-shake .55s 1.23s linear both}',
    // the column of light, rising out of the XP bar
    '.lu-pillar{left:50%;bottom:0;width:clamp(450px,108vmin,1320px);height:100%;transform:translateX(-50%) scaleY(0);transform-origin:50% 100%;mix-blend-mode:screen;',
    '  -webkit-mask:linear-gradient(to top,#000,#000 30%,transparent 97%);mask:linear-gradient(to top,#000,#000 30%,transparent 97%);',
    '  animation:lu-rise .8s cubic-bezier(.16,.9,.25,1) .12s forwards,lu-dimto 1.8s ease-in-out 2.1s forwards}',
    '.lu-haze{inset:0;background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--ac) 22%,transparent) 30%,color-mix(in srgb,var(--ac) 45%,transparent) 50%,color-mix(in srgb,var(--ac) 22%,transparent) 70%,transparent)}',
    '.lu-beam{top:0;bottom:0;left:33.3%;right:33.3%;background:linear-gradient(90deg,transparent,rgba(255,190,70,.12) 16%,rgba(255,200,90,.5) 35%,rgba(255,246,216,.95) 46%,#fff 50%,rgba(255,246,216,.95) 54%,rgba(255,200,90,.5) 65%,rgba(255,190,70,.12) 84%,transparent)}',
    '.lu-flow{left:37%;right:37%;top:0;height:calc(100% + 420px);opacity:.9;',
    '  background:radial-gradient(1.5px 26px at 50% 50%,rgba(255,250,230,.95),transparent) 0 0/37px 140px,radial-gradient(1px 40px at 50% 50%,rgba(255,220,140,.8),transparent) 11px 60px/53px 210px;',
    '  animation:lu-flow .8s linear infinite}',
    '.lu-ground{left:50%;bottom:-18vmin;width:130vmin;height:44vmin;margin-left:-65vmin;opacity:0;transform:scaleX(.15);mix-blend-mode:screen;',
    '  background:radial-gradient(closest-side,#fff,rgba(255,214,107,.75) 22%,color-mix(in srgb,var(--ac) 40%,transparent) 50%,transparent);animation:lu-ground 1s cubic-bezier(.2,.8,.2,1) .05s forwards,lu-dimto 1.8s ease-in-out 2.1s forwards}',
    '.lu-xpflare{left:0;right:0;bottom:0;height:5px;opacity:0;transform:scaleX(0);background:linear-gradient(90deg,transparent,var(--g3),#fff,var(--g3),transparent);',
    '  box-shadow:0 0 18px 5px rgba(255,200,90,.8);animation:lu-xp .7s ease-out forwards}',
    '.lu-cv{inset:0;width:100%;height:100%;mix-blend-mode:screen}',
    '.lu-halo{left:50%;top:var(--cy);width:110vmin;height:110vmin;margin:-55vmin 0 0 -55vmin;opacity:0;mix-blend-mode:screen;',
    '  background:radial-gradient(closest-side,rgba(255,244,214,.55),rgba(255,200,90,.28) 30%,color-mix(in srgb,var(--ac) 28%,transparent) 55%,transparent);',
    '  animation:lu-halo 1.2s ease-out .55s forwards,lu-breathe 2.4s ease-in-out 1.8s infinite alternate}',
    '.lu-ring{left:50%;top:var(--cy);width:56vmin;height:56vmin;margin:-28vmin 0 0 -28vmin;border-radius:50%;opacity:0;mix-blend-mode:screen;',
    '  background:radial-gradient(closest-side,transparent 72%,rgba(255,240,200,.95) 86%,rgba(255,196,80,.6) 92%,transparent)}',
    '.lu-r1{background:radial-gradient(closest-side,transparent 74%,color-mix(in srgb,var(--ac) 90%,#fff) 88%,transparent);animation:lu-ring .8s cubic-bezier(.1,.7,.3,1) .6s forwards}',
    '.lu-r2{animation:lu-ring 1s cubic-bezier(.1,.7,.3,1) 1.23s forwards}',
    '.lu-r3{animation:lu-ring 1.3s cubic-bezier(.1,.7,.3,1) 1.33s forwards}',
    '.lu-flash{inset:0;opacity:0;mix-blend-mode:screen;background:radial-gradient(circle at 50% 85%,#fff,rgba(255,225,150,.85) 35%,rgba(255,200,90,0) 80%);animation:lu-flash .5s ease-out forwards}',
    '.lu-flash2{inset:0;opacity:0;mix-blend-mode:screen;background:radial-gradient(circle at 50% var(--cy),#fff,rgba(255,225,150,.6) 25%,transparent 65%);animation:lu-flash .45s ease-out 1.23s forwards}',
    // the title stack
    '.lu-stage{inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 16px 9vh;text-align:center}',
    '.lu-gold{color:var(--g2);background:linear-gradient(180deg,var(--g1) 0%,#ffe9a6 28%,var(--g3) 52%,var(--g4) 56%,#e6a93a 70%,#ffe6a0 92%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}',
    '.lu-kicker{position:relative;font-weight:700;font-size:clamp(22px,6.4vmin,64px);letter-spacing:.32em;margin-right:-.32em;opacity:0;',
    '  filter:drop-shadow(0 0 .25em rgba(255,190,70,.65)) drop-shadow(0 .06em 0 #3a2205);animation:lu-kick .5s cubic-bezier(.2,.9,.25,1.15) .82s forwards}',
    '.lu-numwrap{position:relative;margin:.04em 0 .02em}',
    '.lu-num,.lu-chroma{font-weight:900;font-size:clamp(96px,30vmin,280px);letter-spacing:-.02em;line-height:.95}',
    '.lu-num{display:block;opacity:0;filter:drop-shadow(0 0 .06em rgba(255,214,107,.9)) drop-shadow(0 0 .22em color-mix(in srgb,var(--ac) 80%,transparent)) drop-shadow(0 .03em 0 #2a1704);',
    '  animation:lu-slam .44s cubic-bezier(.5,0,.6,1) 1s forwards}',
    '.lu-chroma{position:absolute;inset:0;opacity:0;mix-blend-mode:screen}',
    '.lu-cr{color:#ff3050;animation:lu-chr .4s ease-out 1.23s}',
    '.lu-cb{color:#30d8ff;animation:lu-chb .4s ease-out 1.23s}',
    '.lu-rule{display:flex;align-items:center;gap:1.4vmin;width:min(62vmin,520px);height:2.4vmin;opacity:0;transform:scaleX(0);animation:lu-rule .7s cubic-bezier(.2,.8,.2,1) 1.7s forwards}',
    '.lu-rule i{flex:1;height:2px;background:linear-gradient(90deg,transparent,var(--g3) 40%,var(--g1))}',
    '.lu-rule i+b+i{background:linear-gradient(270deg,transparent,var(--g3) 40%,var(--g1))}',
    '.lu-rule b{width:1.5vmin;height:1.5vmin;min-width:9px;min-height:9px;transform:rotate(45deg);background:var(--g2);box-shadow:0 0 10px var(--g2),0 0 22px var(--ac)}',
    '.lu-medal{position:relative;width:clamp(96px,19vmin,180px);height:clamp(96px,19vmin,180px);margin-top:2.6vmin;border-radius:50%;opacity:0;',
    '  background:radial-gradient(circle at 50% 30%,color-mix(in srgb,var(--ac) 55%,#000),rgba(var(--acr),.95) 55%,#07070f);',
    '  box-shadow:0 0 0 .5vmin #f3c45a,0 0 0 1vmin #6b3f08,0 0 0 1.35vmin #ffe08a,0 0 5vmin 1vmin rgba(255,196,80,.55),0 0 10vmin 2vmin color-mix(in srgb,var(--ac) 55%,transparent),inset 0 0 3vmin rgba(0,0,0,.7);',
    '  animation:lu-medal .75s cubic-bezier(.2,.9,.3,1.25) 1.85s forwards}',
    '.lu-medal:before{content:"";position:absolute;inset:-3.4vmin;border-radius:50%;opacity:.8;',
    '  background:repeating-conic-gradient(rgba(255,214,107,.85) 0 2deg,transparent 2deg 10deg);',
    '  -webkit-mask:radial-gradient(closest-side,transparent 82%,#000 84%,#000 92%,transparent 94%);mask:radial-gradient(closest-side,transparent 82%,#000 84%,#000 92%,transparent 94%);animation:lu-spin 18s linear infinite}',
    '.lu-ins,.lu-shine{position:absolute;inset:16%}',
    '.lu-ins svg{display:block;width:100%;height:100%;filter:drop-shadow(0 .4vmin .3vmin rgba(0,0,0,.6))}',
    '.lu-shine{overflow:hidden;-webkit-mask:var(--mask) center/contain no-repeat;mask:var(--mask) center/contain no-repeat}',
    '.lu-shine:before{content:"";position:absolute;top:-30%;bottom:-30%;left:-60%;width:60%;transform:translateX(-50%) skewX(-20deg);',
    '  background:linear-gradient(90deg,transparent,rgba(255,255,255,.95) 50%,transparent);animation:lu-sweep .85s ease-in-out 2.3s forwards}',
    '.lu-glint{right:4%;top:6%;width:34%;height:34%;opacity:0;transform:scale(0);mix-blend-mode:screen;',
    '  background:radial-gradient(closest-side,#fff,transparent 40%),linear-gradient(transparent 47%,#fff 50%,transparent 53%),linear-gradient(90deg,transparent 47%,#fff 50%,transparent 53%);',
    '  -webkit-mask:radial-gradient(closest-side,#000 30%,transparent);mask:radial-gradient(closest-side,#000 30%,transparent);animation:lu-glint .6s ease-out 2.85s}',
    '.lu-rank{margin-top:3.4vmin;font-weight:700;font-size:clamp(18px,4.6vmin,42px);letter-spacing:.16em;margin-right:-.16em;text-transform:uppercase;color:#ffe7ae;opacity:0;',
    '  text-shadow:0 0 .4em rgba(255,190,70,.6),0 0 1.2em var(--ac),0 .06em 0 #2a1704;animation:lu-up .7s cubic-bezier(.2,.8,.2,1) 2.05s forwards}',
    '.lu-congrats{margin-top:1.6vmin;font-weight:600;font-size:clamp(13px,2.5vmin,21px);letter-spacing:.04em;color:#ffd23f;opacity:0;text-shadow:0 1px 2px #000,0 0 12px rgba(0,0,0,.8);',
    '  animation:lu-up .7s ease-out 2.45s forwards}',
    '.lu-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}',
    // reduced motion: no flash, shake, slam or shockwave; soft fades instead
    '.lu-calm .lu-flash,.lu-calm .lu-flash2,.lu-calm .lu-ring,.lu-calm .lu-chroma,.lu-calm .lu-xpflare,.lu-calm .lu-glint{display:none}',
    '.lu-calm .lu-shake,.lu-calm .lu-flow,.lu-calm .lu-medal:before{animation:none}',
    '.lu-calm .lu-pillar{transform:translateX(-50%);opacity:0;animation:lu-soft 1.4s ease .1s forwards,lu-dimto 1.8s ease-in-out 2.1s forwards}',
    '.lu-calm .lu-ground{transform:none;animation:lu-soft 1.4s ease forwards}',
    '.lu-calm .lu-halo{animation:lu-soft 1.4s ease .5s forwards}',
    '.lu-calm .lu-kicker,.lu-calm .lu-num,.lu-calm .lu-rule,.lu-calm .lu-medal,.lu-calm .lu-rank,.lu-calm .lu-congrats{transform:none;animation-name:lu-soft;animation-duration:.9s;animation-timing-function:ease}',
    '.lu-calm .lu-shine:before{animation-duration:1.6s}',
    '@keyframes lu-in{to{opacity:1}}',
    '@keyframes lu-soft{from{opacity:0}to{opacity:1}}',
    '@keyframes lu-dimto{to{opacity:.32}}',
    '@keyframes lu-rise{0%{transform:translateX(-50%) scale(.25,0)}60%{transform:translateX(-50%) scale(1.15,1)}100%{transform:translateX(-50%) scale(1,1)}}',
    '@keyframes lu-flow{to{transform:translateY(-420px)}}',
    '@keyframes lu-ground{to{opacity:1;transform:scaleX(1)}}',
    '@keyframes lu-xp{0%{opacity:1;transform:scaleX(0)}45%{opacity:1;transform:scaleX(1)}100%{opacity:0;transform:scaleX(1)}}',
    '@keyframes lu-flash{0%{opacity:0}18%{opacity:.95}100%{opacity:0}}',
    '@keyframes lu-halo{0%{opacity:0;transform:scale(.3)}100%{opacity:1;transform:scale(1)}}',
    '@keyframes lu-breathe{from{opacity:1}to{opacity:.7}}',
    '@keyframes lu-ring{0%{opacity:1;transform:scale(.12)}100%{opacity:0;transform:scale(3.4)}}',
    '@keyframes lu-kick{0%{opacity:0;transform:scale(2.4)}60%{opacity:1;transform:scale(.95)}100%{opacity:1;transform:scale(1)}}',
    '@keyframes lu-slam{0%{opacity:0;transform:scale(5)}55%{opacity:1;transform:scale(.88)}75%{transform:scale(1.06)}100%{opacity:1;transform:scale(1)}}',
    '@keyframes lu-chr{0%{opacity:.85;transform:translate(-2.2vmin,.4vmin)}100%{opacity:0;transform:none}}',
    '@keyframes lu-chb{0%{opacity:.85;transform:translate(2.2vmin,-.4vmin)}100%{opacity:0;transform:none}}',
    '@keyframes lu-shake{0%,100%{transform:none}10%{transform:translate(-1.4vmin,1vmin)}20%{transform:translate(1.2vmin,-1.2vmin)}32%{transform:translate(-.9vmin,-.6vmin)}46%{transform:translate(.7vmin,.7vmin)}62%{transform:translate(-.4vmin,.3vmin)}80%{transform:translate(.2vmin,-.2vmin)}}',
    '@keyframes lu-rule{to{opacity:1;transform:scaleX(1)}}',
    '@keyframes lu-medal{0%{opacity:0;transform:scale(.3) rotate(-40deg)}100%{opacity:1;transform:none}}',
    '@keyframes lu-spin{to{transform:rotate(360deg)}}',
    '@keyframes lu-sweep{to{transform:translateX(330%) skewX(-20deg)}}',
    '@keyframes lu-glint{0%{opacity:0;transform:scale(0) rotate(0)}40%{opacity:1;transform:scale(1) rotate(45deg)}100%{opacity:0;transform:scale(.2) rotate(90deg)}}',
    '@keyframes lu-up{0%{opacity:0;transform:translateY(1.6vmin) scale(.94)}100%{opacity:1;transform:none}}'
  ].join('\n');

  function inject() {
    if (document.getElementById('lu-style')) return;
    var font = document.createElement('link');
    font.rel = 'stylesheet';
    font.href = 'https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;900&display=swap';
    var st = document.createElement('style');
    st.id = 'lu-style';
    st.textContent = CSS;
    document.head.append(font, st);
  }

  // ---------- sound: synthesised, no files ----------
  var ac, verb, noise;
  function makeSound() {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    ac = ac || new Ctx();
    if (ac.state === 'suspended') ac.resume();
    var sr = ac.sampleRate, i, c;
    if (!verb) {
      // shared reverb: decaying stereo noise impulse
      var len = sr * 2.6 | 0, ir = ac.createBuffer(2, len, sr);
      for (c = 0; c < 2; c++) {
        var d = ir.getChannelData(c);
        for (i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.4);
      }
      noise = ac.createBuffer(1, sr, sr);
      var nd = noise.getChannelData(0);
      for (i = 0; i < sr; i++) nd[i] = Math.random() * 2 - 1;
      var comp = ac.createDynamicsCompressor();
      comp.connect(ac.destination);
      verb = ac.createConvolver();
      verb.buffer = ir;
      var wet = ac.createGain();
      wet.gain.value = 0.4;
      verb.connect(wet).connect(comp);
      verb._out = comp;
    }
    var master = ac.createGain();
    master.gain.value = 0.5;
    master.connect(verb._out);
    master.connect(verb);
    var t0 = ac.currentTime + 0.03;

    function osc(type, f, t, dur, dest) {
      var o = ac.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f, t);
      o.connect(dest);
      o.start(t);
      o.stop(t + dur + 0.1);
      return o;
    }
    function env(t, peak, a, d) {
      var g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
      g.connect(master);
      return g;
    }
    // celesta-like bell: fundamental plus soft, slightly stretched overtones
    function bell(f, t, v, d) {
      [[1, 1, 1], [2, 0.3, 0.6], [3.98, 0.12, 0.3]].forEach(function (p) {
        osc('sine', f * p[0], t, d * p[2], env(t, v * p[1], 0.005, d * p[2]));
      });
    }
    // brassy swell: detuned saws through an opening low-pass
    function brass(f, t, dur, v) {
      var lp = ac.createBiquadFilter(), g = ac.createGain();
      lp.type = 'lowpass';
      lp.Q.value = 1.4;
      lp.frequency.setValueAtTime(260, t);
      lp.frequency.exponentialRampToValueAtTime(2800, t + 0.14);
      lp.frequency.exponentialRampToValueAtTime(900, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v, t + 0.05);
      g.gain.setTargetAtTime(v * 0.5, t + 0.15, 0.35);
      g.gain.setTargetAtTime(0.0001, t + dur - 0.7, 0.25);
      lp.connect(g).connect(master);
      [-8, 8].forEach(function (dt) { osc('sawtooth', f, t, dur, lp).detune.value = dt; });
    }

    // beat 1: whoosh rising with the pillar
    var ns = ac.createBufferSource(), bp = ac.createBiquadFilter();
    ns.buffer = noise;
    bp.type = 'bandpass';
    bp.Q.value = 2;
    bp.frequency.setValueAtTime(300, t0);
    bp.frequency.exponentialRampToValueAtTime(5000, t0 + 0.65);
    ns.connect(bp).connect(env(t0, 0.25, 0.4, 0.45));
    ns.start(t0);
    ns.stop(t0 + 1);
    // beat 2: rising C-major arpeggio into the burst
    [392, 523.25, 659.25, 783.99, 1046.5, 1318.5].forEach(function (f, k) { bell(f, t0 + 0.05 + k * 0.085, 0.16, 1.4); });
    bell(1567.98, t0 + T.burst / 1000, 0.12, 2);
    bell(2093, t0 + T.burst / 1000 + 0.04, 0.08, 2);
    // beat 3: the slam: boom + brass chord + bell triad
    var s = t0 + T.slam / 1000;
    var boom = osc('sine', 150, s, 1.2, env(s, 0.7, 0.01, 1.1));
    boom.frequency.exponentialRampToValueAtTime(38, s + 0.6);
    [130.81, 261.63, 329.63, 392, 523.25].forEach(function (f, k) { brass(f, s, 3.4, k ? 0.07 : 0.1); });
    [1046.5, 1318.5, 1567.98].forEach(function (f) { bell(f, s, 0.1, 2.4); });
    // beat 4: sparkle glissando with the insignia shine
    [2093, 2637, 3136, 4186].forEach(function (f, k) { bell(f, t0 + T.shine / 1000 + k * 0.055, 0.05, 1.2); });

    return function stop() {
      master.gain.setTargetAtTime(0.0001, ac.currentTime, 0.08);
      setTimeout(function () { master.disconnect(); }, 600);
    };
  }

  // ---------- canvas: god-rays, embers, sparks, gold flakes ----------
  function sprite(rgb) {
    var c = document.createElement('canvas');
    c.width = c.height = 64;
    var g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.18, 'rgba(' + rgb + ',.95)');
    gr.addColorStop(0.45, 'rgba(' + rgb + ',.3)');
    gr.addColorStop(1, 'rgba(' + rgb + ',0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    return c;
  }

  function particles(cv, cx, cy, accRgb, calm) {
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var W = innerWidth, H = innerHeight;
    cv.width = W * dpr | 0;
    cv.height = H * dpr | 0;
    var ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);
    var small = W * H < 600000;
    var cap = calm ? 50 : small ? 150 : 320;
    var sGold = sprite('255,200,90'), sWhite = sprite('255,240,205'), sAcc = sprite(accRgb);
    var P = [], start = performance.now(), last = start, raf, carry = 0, fired = {};
    var pw = Math.min(Math.max(150, Math.min(W, H) * 0.36), 440);
    var u = Math.min(W, H) / 800; // speeds scale with screen size
    function rnd(a, b) { return a + Math.random() * (b - a); }
    function gauss() { return (Math.random() + Math.random() + Math.random() - 1.5) / 1.5; }
    function add(p) { if (P.length < cap) P.push(p); }
    function ember(x, y, vx, vy, life) {
      var r = Math.random();
      add({ k: 0, x: x, y: y, vx: vx, vy: vy, t: 0, life: life, s: rnd(2, 5.5), ph: rnd(0, 6), img: r < 0.25 ? sAcc : r < 0.45 ? sWhite : sGold });
    }
    function burst(n, sp) {
      for (var i = 0; i < n; i++) {
        var a = rnd(0, 6.283), v = rnd(0.3, 1) * sp * u;
        add({ k: 1, x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: rnd(0.5, 1.1), acc: Math.random() < 0.3 });
      }
    }
    function rays(t, a) {
      if (a <= 0) return;
      var R = Math.hypot(W, H) * 0.6, rot = calm ? 0 : t * 0.00012;
      [[20, '255,206,110', rot, 0.045], [14, accRgb, -rot * 1.4 + 0.11, 0.06]].forEach(function (set) {
        var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
        g.addColorStop(0, 'rgba(' + set[1] + ',' + 0.3 * a + ')');
        g.addColorStop(0.25, 'rgba(' + set[1] + ',' + 0.1 * a + ')');
        g.addColorStop(1, 'rgba(' + set[1] + ',0)');
        ctx.fillStyle = g;
        [1, 0.55, 0.22].forEach(function (k) {
          ctx.beginPath();
          for (var i = 0; i < set[0]; i++) {
            var th = set[2] + i * 6.283 / set[0] + (i * 2.4 % 1) * 0.08, w = set[3] * k * (i % 3 ? 0.7 : 1.4);
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.cos(th - w) * R, cy + Math.sin(th - w) * R);
            ctx.lineTo(cx + Math.cos(th + w) * R, cy + Math.sin(th + w) * R);
          }
          ctx.fill();
        });
      });
    }
    function frame(now) {
      var dt = Math.min(0.05, (now - last) / 1000), t = now - start;
      last = now;
      // emit embers from the pillar base: heavy while it rises, then a steady trickle
      carry += dt * (t < 1700 ? 150 : t < T.out ? 40 : 0) * (calm ? 0.25 : 1);
      while (carry >= 1) {
        carry--;
        ember(W / 2 + gauss() * pw * 0.35, H + 8, gauss() * 20 * u, -rnd(160, 520) * u * (calm ? 0.4 : 1), rnd(1.6, 3.2));
      }
      if (!calm) {
        if (t > T.burst && !fired.b) { fired.b = 1; burst(70, 900); }
        if (t > T.slam && !fired.s) {
          fired.s = 1;
          burst(130, 1300);
          for (var i = 0; i < 40; i++) { var a = rnd(0, 6.283); ember(cx + Math.cos(a) * 60 * u, cy + Math.sin(a) * 40 * u, Math.cos(a) * rnd(60, 200) * u, Math.sin(a) * rnd(60, 160) * u - 60 * u, rnd(1.5, 3)); }
        }
        if (t > T.slam && t < 3700 && Math.random() < dt * 28) {
          add({ k: 2, x: rnd(0, W), y: -10, vx: rnd(-20, 20), vy: rnd(50, 120) * u, t: 0, life: 5, s: rnd(3, 7) * Math.max(u, 0.7), ph: rnd(0, 6), sp: rnd(4, 9), acc: Math.random() < 0.3 });
        }
      }
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      var ra = t < 550 ? 0 : t < 900 ? (t - 550) / 350 : 1;
      if (t > T.slam) ra += 0.9 * Math.exp(-(t - T.slam) / 350);
      rays(t, ra * (calm ? 0.45 : 0.75));
      for (var j = P.length - 1; j >= 0; j--) {
        var p = P[j];
        p.t += dt;
        if (p.t > p.life || p.y > H + 40) { P[j] = P[P.length - 1]; P.pop(); continue; }
        var f = 1 - p.t / p.life;
        if (p.k === 0) {
          p.vy *= 1 - dt * 0.4;
          p.x += (p.vx + Math.sin(p.ph + p.t * 3) * 25 * u) * dt;
          p.y += p.vy * dt;
          var s = p.s * (0.6 + f) * 2.6;
          ctx.globalAlpha = Math.min(1, f * 1.6) * (0.7 + 0.3 * Math.sin(p.ph + p.t * 18));
          ctx.drawImage(p.img, p.x - s, p.y - s, s * 2, s * 2);
        } else if (p.k === 1) {
          var dr = Math.exp(-dt * 3.2);
          p.vx *= dr; p.vy = p.vy * dr + 140 * u * dt;
          p.x += p.vx * dt; p.y += p.vy * dt;
          ctx.globalAlpha = f;
          ctx.strokeStyle = p.acc ? 'rgb(' + accRgb + ')' : '#ffe2a0';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.045, p.y - p.vy * 0.045);
          ctx.stroke();
        } else {
          // gold flake: flutters, glints as it turns
          p.x += (p.vx + Math.sin(p.ph + p.t * 2) * 30) * dt;
          p.y += p.vy * dt;
          var turn = Math.cos(p.ph + p.t * p.sp);
          ctx.globalAlpha = 0.35 + 0.65 * Math.abs(turn);
          ctx.fillStyle = p.acc ? 'rgb(' + accRgb + ')' : Math.abs(turn) > 0.85 ? '#fff4cc' : '#e8a83a';
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.ph + p.t);
          ctx.scale(1, turn);
          ctx.fillRect(-p.s / 2, -p.s * 0.3, p.s, p.s * 0.6);
          ctx.restore();
        }
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return function stop() { cancelAnimationFrame(raf); P.length = 0; };
  }

  // Reads a colour the browser resolves (any CSS syntax) as "r, g, b".
  function rgbOf(el, cssColor, fallback) {
    el.style.color = cssColor;
    var m = getComputedStyle(el).color.match(/[\d.]+/g);
    el.style.color = '';
    return m && m.length >= 3 ? m.slice(0, 3).join(',') : fallback;
  }

  function run(o) {
    return new Promise(function (resolve) {
      var level = o.level, calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
      var ov = document.createElement('div');
      ov.className = 'lu-ov' + (calm ? ' lu-calm' : '');
      ov.setAttribute('role', 'alert');
      ov.innerHTML =
        '<div class="lu-l lu-dim"></div>' +
        '<div class="lu-l lu-shake">' +
          '<div class="lu-l lu-pillar"><div class="lu-l lu-haze"></div><div class="lu-l lu-beam"></div><div class="lu-l lu-flow"></div></div>' +
          '<div class="lu-l lu-ground"></div><div class="lu-l lu-xpflare"></div>' +
          '<div class="lu-l lu-halo"></div>' +
          '<canvas class="lu-l lu-cv"></canvas>' +
          '<div class="lu-l lu-ring lu-r1"></div><div class="lu-l lu-ring lu-r2"></div><div class="lu-l lu-ring lu-r3"></div>' +
          '<div class="lu-l lu-stage" aria-hidden="true">' +
            '<div class="lu-kicker lu-gold">Level Up</div>' +
            '<div class="lu-numwrap"><span class="lu-chroma lu-cr"></span><span class="lu-chroma lu-cb"></span><span class="lu-num lu-gold"></span></div>' +
            '<div class="lu-rule"><i></i><b></b><i></i></div>' +
            '<div class="lu-medal"><div class="lu-ins"></div><div class="lu-shine"></div><div class="lu-l lu-glint"></div></div>' +
            '<div class="lu-rank"></div>' +
            '<div class="lu-congrats"></div>' +
          '</div>' +
        '</div>' +
        '<div class="lu-l lu-flash"></div><div class="lu-l lu-flash2"></div>' +
        '<span class="lu-sr"></span>';
      var q = function (s) { return ov.querySelector(s); };
      q('.lu-num').textContent = q('.lu-cr').textContent = q('.lu-cb').textContent = level;
      q('.lu-rank').textContent = o.rankName || '';
      q('.lu-congrats').textContent = 'Congratulations, you have reached level ' + level + '!';
      q('.lu-sr').textContent = 'Level up! You reached level ' + level + (o.rankName ? ', rank ' + o.rankName : '') + '.';
      var svg = String(o.insigniaSvg || '');
      if (svg) {
        q('.lu-ins').innerHTML = svg; // trusted markup from the app (insignia)
        if (!/xmlns=/.test(svg)) svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
        q('.lu-shine').style.setProperty('--mask', 'url("data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg) + '")');
      } else q('.lu-medal').style.display = 'none';
      document.body.appendChild(ov);

      // one layout read: where the number sits, so rays, rings and bursts radiate from it
      var r = q('.lu-numwrap').getBoundingClientRect();
      var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      ov.style.setProperty('--cy', cy + 'px');
      var stopParticles = particles(q('.lu-cv'), cx, cy, rgbOf(ov, 'var(--accent-hi, #a48bff)', '164,139,255'), calm);
      var stopSound = null;
      if (o.sound !== false) try { stopSound = makeSound(); } catch (e) { /* audio unavailable: stay silent */ }
      if (navigator.vibrate) try { navigator.vibrate(calm ? 60 : [40, 80, 40, 1060, 180]); } catch (e) { /* ignore */ }

      var born = performance.now(), ending = false, timer = setTimeout(function () { end(T.fade); }, T.out);
      function end(ms) {
        if (ending) return;
        ending = true;
        clearTimeout(timer);
        // jump every finite animation to its final frame, so a skip still shows the full result
        ov.getAnimations({ subtree: true }).forEach(function (a) {
          try { if (a.effect.getComputedTiming().endTime !== Infinity) a.finish(); } catch (e) { /* ignore */ }
        });
        ov.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(1.04)' }], { duration: ms, easing: 'ease-in', fill: 'forwards' })
          .finished.then(cleanup, cleanup);
      }
      function skip(e) {
        if (e.type === 'keydown' && !/^(Escape|Enter| )$/.test(e.key)) return;
        if (performance.now() - born < 250) return;
        e.preventDefault();
        if (stopSound) stopSound();
        if (navigator.vibrate) try { navigator.vibrate(0); } catch (x) { /* ignore */ }
        end(450);
      }
      function cleanup() {
        stopParticles();
        removeEventListener('keydown', skip, true);
        ov.remove();
        resolve();
      }
      ov.addEventListener('pointerdown', skip);
      addEventListener('keydown', skip, true);
    });
  }

  inject();
  var queue = Promise.resolve();
  window.LevelUp = {
    play: function (opts) {
      // back-to-back level-ups play one after another
      var p = queue.then(function () { return run(opts || {}); });
      queue = p.catch(function () {});
      return p;
    }
  };
})();
