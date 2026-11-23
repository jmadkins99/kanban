/* CardMenu: tap options panel for kanban cards, one row of ⬅️ Edit ➡️. Needs jQuery.
 * CardMenu.attach(containerSelector, { onMove(cardEl, dir), onEdit(cardEl) })
 */
(function ($) {
  var CSS = [
    ':where(.card) { position: relative; }',

    /* panel = clipping frame over the card; sheet = the part that slides down */
    '.cm-panel { position: absolute; inset: 0; z-index: 5; overflow: hidden; border-radius: inherit;',
    '  container-type: size; pointer-events: none; visibility: hidden; transition: visibility 0s .34s; }',
    '.cm-open > .cm-panel { pointer-events: auto; visibility: visible; transition-delay: 0s; }',
    '.cm-sheet { position: absolute; inset: 0; transform: translateY(-101%);',
    '  transition: transform .34s cubic-bezier(.22,.8,.24,1);',
    '  background: radial-gradient(120% 90% at 50% 0%, rgba(var(--accent-rgb), .55), transparent 70%), linear-gradient(180deg, rgba(var(--accent-rgb), .18), rgba(var(--accent-rgb), .08) 60%, rgba(var(--accent-rgb), .28)), rgba(10, 10, 22, .92);',
    '  -webkit-backdrop-filter: blur(8px) saturate(1.3); backdrop-filter: blur(8px) saturate(1.3);',
    '  box-shadow: inset 0 -1px 0 rgba(var(--accent-rgb), .9), inset 0 1px 0 rgba(255,255,255,.04), 0 6px 18px rgba(0,0,0,.45); }',
    '.cm-open > .cm-panel > .cm-sheet { transform: none; }',

    /* one row: ⬅️ Edit ➡️, the arrows narrow and Edit taking the rest */
    '.cm-row { position: absolute; inset: 0; display: flex; flex-direction: row; align-items: center;',
    '  gap: 2px; padding: 6px; }',

    '.cm-panel button { flex: 1 1 0; min-width: 0; height: 100%; max-height: 44px; margin: 0; border: 0; border-radius: 6px;',
    '  padding: 0 .4em 0 calc(.4em + .26em); background: transparent; color: #b8b8d0; cursor: pointer;',
    "  font: 500 calc(11px * var(--ui, 1))/1 'Jost', 'Century Gothic', 'Segoe UI', sans-serif; letter-spacing: .26em; text-transform: uppercase;",
    '  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; position: relative;',
    '  opacity: 0; transform: translateY(-4px); transition: color .18s, background-color .18s, opacity .3s, transform .3s; }',
    '.cm-open .cm-panel button { opacity: 1; transform: none; }',
    '.cm-open .cm-row button:nth-child(1) { transition-delay: 0s, 0s, .08s, .08s; }',
    '.cm-open .cm-row button:nth-child(2) { transition-delay: 0s, 0s, .13s, .13s; }',
    '.cm-open .cm-row button:nth-child(3) { transition-delay: 0s, 0s, .18s, .18s; }',
    '.cm-panel button[data-cm=edit] { flex-grow: 2; }',
    /* hairline under Edit that widens on hover */
    '.cm-panel button[data-cm=edit]::after { content: ""; position: absolute; left: 50%; bottom: max(22%, 6px); width: 0; height: 1px;',
    '  background: var(--accent-hi); transition: width .22s, left .22s; }',
    '.cm-panel button:hover:not(:disabled), .cm-panel button:focus-visible { color: var(--accent-pale);',
    '  background: rgba(var(--accent-rgb), .55); outline: none; }',
    '.cm-panel button[data-cm=edit]:hover::after, .cm-panel button[data-cm=edit]:focus-visible::after { left: calc(50% - 1.1em); width: 2.2em; }',
    '.cm-panel button[data-cm=left], .cm-panel button[data-cm=right] { font-size: 20px; letter-spacing: 0; padding: 0; }',
    '.cm-panel button:disabled { filter: grayscale(1); opacity: .22; cursor: not-allowed; }',

    /* short cards: size the row to the card */
    '@container (max-height: 96px) {',
    '  .cm-row { padding: 3px; }',
    '  .cm-panel button { max-height: none; }',
    '  .cm-panel button[data-cm=edit] { font-size: clamp(10px, 34cqh, calc(11px * var(--ui, 1))); letter-spacing: .18em;',
    '    padding: 0 .3em 0 calc(.3em + .18em); }',
    '  .cm-panel button[data-cm=edit]::after { bottom: 14%; }',
    '  .cm-panel button[data-cm=left], .cm-panel button[data-cm=right] { font-size: clamp(13px, 55cqh, calc(20px * var(--ui, 1))); }',
    '}'
  ].join('\n');

  var PANEL = '<div class="cm-panel"><div class="cm-sheet"><div class="cm-row">' +
    '<button type="button" data-cm="left" aria-label="Move left">⬅️</button>' +
    '<button type="button" data-cm="edit">Edit</button>' +
    '<button type="button" data-cm="right" aria-label="Move right">➡️</button>' +
    '</div></div></div>';

  var injected = false;

  function setup() {
    if (injected) return;
    injected = true;
    $('head').append(
      '<link rel="preconnect" href="https://fonts.googleapis.com">' +
      '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Jost:wght@400;500&display=swap">',
      $('<style id="cardmenu-css">').text(CSS));
    // Tapping elsewhere (or on another card) hides open panels.
    document.addEventListener('pointerdown', function (e) {
      $('.card.cm-open').each(function () { if (!this.contains(e.target)) close(this); });
    }, true);
  }

  function open(card) {
    if ($(card).hasClass('cm-open')) return;
    $('.card.cm-open').not(card).each(function () { close(this); });
    if (!$(card).children('.cm-panel').length) {
      $(PANEL).appendTo(card);
      void card.offsetHeight; // commit the closed state so the first open animates
    }
    // Nowhere to go past the first and last List.
    var $list = $(card).closest('.list');
    $(card).find('[data-cm=left]').prop('disabled', !$list.prevAll('.list').length);
    $(card).find('[data-cm=right]').prop('disabled', !$list.nextAll('.list').length);
    $(card).addClass('cm-open');
  }

  function close(card) { $(card).removeClass('cm-open'); }

  function attach(containerSelector, cb) {
    setup();
    $(containerSelector)
      // A click (a tap on a phone) opens the menu; on desktop, moving off the card closes it.
      .on('mouseleave', '.card', function () { close(this); })
      // Not while the Card is being edited: the menu would show once the edit ends.
      .on('click', '.card', function (e) { if (!$(e.target).closest('.cm-panel').length && !$(this).hasClass('editing')) open(this); })
      .on('click', '.cm-panel button', function (e) {
        e.preventDefault();
        if (this.disabled) return;
        var card = $(this).closest('.card')[0], act = $(this).data('cm');
        close(card);
        if (act === 'edit') cb.onEdit && cb.onEdit(card);
        else cb.onMove && cb.onMove(card, act === 'left' ? -1 : 1);
      });
  }

  window.CardMenu = { attach: attach };
})(jQuery);
