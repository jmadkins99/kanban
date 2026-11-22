/* "Card moved to Done" celebration: a port of gym-tracker's PR celebration
   (css/styles.css .card.pr-celebrating + prLegendaryAura/prHaloLine/prShimmer/
   prBadgePop/prBadgeGlow), plus a full-screen gold flash gym-tracker lacks.
   Usage: Celebrate.done(cardEl, 2500). Leaves nothing behind after ~2 s. */
(function () {
    var MS = 2000; // gym-tracker's PR_CELEBRATION_MS
    var FLASH_MS = 450;

    // Gold is fixed, deliberately not themed, as in gym-tracker. Unlike there,
    // nothing stays after the 2 s, so 100% keyframes leave out border-color,
    // box-shadow and filter: the card eases back to its own values, whatever
    // the theme gives it. The gold background sits on an injected overlay
    // (the card can't be given overflow:hidden without clipping its .ops menu).
    var css = `
.celebrate-done {
    animation: celebrateAura 2s cubic-bezier(0.16, 1, 0.3, 1) both;
}
.celebrate-fx {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    overflow: hidden;
    pointer-events: none;
    mix-blend-mode: screen;
    background:
        radial-gradient(92% 62% at 50% -12%, rgba(255, 243, 176, 0.28) 0%, rgba(212, 175, 55, 0.10) 40%, rgba(212, 175, 55, 0) 68%),
        radial-gradient(66% 48% at 50% 24%, rgba(242, 207, 102, 0.12) 0%, rgba(242, 207, 102, 0) 72%);
    animation: celebrateFxFade 2s ease-out both;
}
.celebrate-fx::before {
    content: '';
    position: absolute;
    top: 0; left: 6%; right: 6%;
    height: 2px;
    background: linear-gradient(90deg, transparent, #fff4b0 18%, #f2cf66 50%, #fff4b0 82%, transparent);
    box-shadow:
        0 0 18px rgba(255, 244, 176, 0.72),
        0 0 34px rgba(212, 175, 55, 0.34);
    animation: prHaloLine 2s ease-in-out both;
}
.celebrate-fx::after {
    content: '';
    position: absolute;
    inset: -42% -108%;
    background: linear-gradient(
        105deg,
        transparent 30%,
        rgba(255, 255, 255, 0.00) 40%,
        rgba(255, 244, 176, 0.58) 47%,
        rgba(255, 255, 255, 0.24) 50%,
        rgba(242, 207, 102, 0.18) 55%,
        transparent 66%
    );
    transform: translateX(-48%) rotate(8deg);
    animation: prShimmer 1.55s 0.22s cubic-bezier(0.2, 1, 0.3, 1) both;
}
.celebrate-badge {
    position: absolute;
    top: -10px; /* on the top edge, like a tag, so it never covers the text */
    right: 22px;
    z-index: 1;
    display: inline-flex;
    align-items: center;
    padding: 3px 8px;
    border-radius: 999px;
    background: rgba(14, 13, 24, 0.88);
    border: 1px solid #d4af37;
    box-shadow: 0 0 10px rgba(212, 175, 55, 0.16);
    color: #f2cf66;
    font: 700 11px/1 system-ui, sans-serif;
    letter-spacing: 0.02em;
    white-space: nowrap;
    text-shadow: none;
    pointer-events: none;
    animation:
        prBadgePop 1.05s cubic-bezier(0.16, 1, 0.3, 1) both,
        prBadgeGlow 2s ease-in-out both,
        celebrateFloat 0.7s 1.3s ease-in forwards;
}
.celebrate-flash {
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    pointer-events: none;
    mix-blend-mode: screen;
    background: radial-gradient(circle at var(--x, 50%) var(--y, 50%),
        rgba(255, 255, 255, 0.60) 0%,
        rgba(255, 236, 150, 0.45) 16%,
        rgba(242, 200, 80, 0.26) 42%,
        rgba(212, 165, 40, 0.16) 100%);
    animation: celebrateFlash 0.45s ease-out forwards;
}

@keyframes celebrateAura {
    0% {
        transform: scale(1);
        border-color: rgba(212, 175, 55, 0.56);
        box-shadow:
            0 1px 3px rgba(0, 0, 0, 0.67),
            0 0 0 0 rgba(212, 175, 55, 0),
            0 0 0 rgba(255, 231, 134, 0),
            0 0 0 rgba(212, 175, 55, 0),
            inset 0 0 0 rgba(255, 231, 134, 0);
        filter: saturate(1);
    }
    16% {
        transform: scale(1.018);
        border-color: rgba(255, 244, 176, 1);
        box-shadow:
            0 6px 16px rgba(0, 0, 0, 0.60),
            0 0 0 1px rgba(255, 244, 176, 0.78),
            0 0 34px rgba(255, 231, 134, 0.44),
            0 0 76px rgba(212, 175, 55, 0.22),
            inset 0 0 28px rgba(255, 231, 134, 0.18);
        filter: saturate(1.18);
    }
    44% {
        transform: scale(1.008);
        border-color: rgba(242, 207, 102, 0.96);
        box-shadow:
            0 4px 12px rgba(0, 0, 0, 0.58),
            0 0 0 5px rgba(212, 175, 55, 0.06),
            0 0 48px rgba(255, 231, 134, 0.28),
            0 0 100px rgba(212, 175, 55, 0.12),
            inset 0 0 22px rgba(255, 231, 134, 0.13);
        filter: saturate(1.1);
    }
    70% {
        transform: scale(1.012);
        border-color: rgba(255, 238, 154, 0.98);
        box-shadow:
            0 5px 14px rgba(0, 0, 0, 0.59),
            0 0 0 2px rgba(255, 244, 176, 0.34),
            0 0 44px rgba(255, 231, 134, 0.32),
            0 0 92px rgba(212, 175, 55, 0.16),
            inset 0 0 26px rgba(255, 231, 134, 0.16);
        filter: saturate(1.14);
    }
    100% {
        transform: scale(1);
    }
}
@keyframes celebrateFxFade {
    0%   { opacity: 0; }
    6%   { opacity: 1; }
    72%  { opacity: 1; }
    100% { opacity: 0; }
}
@keyframes prHaloLine {
    0%   { opacity: 0.35; transform: scaleX(0.72); }
    18%  { opacity: 1;    transform: scaleX(1); }
    58%  { opacity: 0.74; transform: scaleX(0.88); }
    78%  { opacity: 0.96; transform: scaleX(0.98); }
    100% { opacity: 0.66; transform: scaleX(0.84); }
}
@keyframes prShimmer {
    0%   { opacity: 0; transform: translateX(-48%) rotate(8deg); }
    18%  { opacity: 0.98; }
    100% { opacity: 0; transform: translateX(48%) rotate(8deg); }
}
@keyframes prBadgePop {
    0%   { transform: scale(0.88); opacity: 0; }
    38%  { transform: scale(1.08); opacity: 1; }
    100% { transform: scale(1); opacity: 1; }
}
@keyframes prBadgeGlow {
    0%   { box-shadow: 0 0 10px rgba(212, 175, 55, 0.16); }
    22%  { box-shadow: 0 0 0 1px rgba(255, 244, 176, 0.50), 0 0 22px rgba(255, 231, 134, 0.38); }
    62%  { box-shadow: 0 0 0 2px rgba(212, 175, 55, 0.18), 0 0 16px rgba(242, 207, 102, 0.28); }
    100% { box-shadow: 0 0 12px rgba(212, 175, 55, 0.22); }
}
/* Its own translate property, so it composes with prBadgePop's transform. */
@keyframes celebrateFloat {
    to { opacity: 0; translate: 0 -16px; }
}
@keyframes celebrateFlash {
    0%   { opacity: 0; }
    14%  { opacity: 1; }
    100% { opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
    .celebrate-done,
    .celebrate-fx,
    .celebrate-fx::before,
    .celebrate-fx::after,
    .celebrate-badge {
        animation: none;
    }
    .celebrate-done { border-color: rgba(255, 231, 134, 0.95); }
    .celebrate-flash { display: none; }
}
`;

    var style = document.createElement('style');
    style.id = 'celebrate-css';
    style.textContent = css;
    document.head.appendChild(style);

    var timers = new WeakMap();
    var flash = null, flashTimer = null;

    function clear(el) {
        clearTimeout(timers.get(el));
        timers.delete(el);
        el.querySelectorAll(':scope > .celebrate-fx, :scope > .celebrate-badge')
            .forEach(function (n) { n.remove(); });
        el.classList.remove('celebrate-done');
    }

    function done(el, xp) {
        clear(el);
        void el.offsetWidth; // reflow, so re-adding the class replays the animation
        el.classList.add('celebrate-done');

        var fx = document.createElement('div');
        fx.className = 'celebrate-fx';
        var badge = document.createElement('div');
        badge.className = 'celebrate-badge';
        badge.textContent = '+' + Math.round(xp) + ' XP';
        el.append(fx, badge);
        timers.set(el, setTimeout(function () { clear(el); }, MS));

        // One flash for the whole screen; a new call replaces it with a fresh node.
        if (flash) flash.remove();
        clearTimeout(flashTimer);
        var r = el.getBoundingClientRect();
        flash = document.createElement('div');
        flash.className = 'celebrate-flash';
        flash.style.setProperty('--x', (r.left + r.width / 2) + 'px');
        flash.style.setProperty('--y', (r.top + r.height / 2) + 'px');
        document.body.appendChild(flash);
        flashTimer = setTimeout(function () { flash.remove(); flash = null; }, FLASH_MS);
    }

    window.Celebrate = { done: done };
})();
