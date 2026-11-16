/* CardMenu: hover/tap options panel for kanban notes. Needs jQuery.
 * CardMenu.attach(containerSelector, { onMove(noteEl, dir), onEdit(noteEl), onDelete(noteEl) })
 */
(function ($) {
  var CSS = [
    '.note > .ops { display: none !important; }',
    ':where(.note) { position: relative; }',

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

    '.cm-main, .cm-arrows { position: absolute; inset: 0; display: flex; flex-direction: column;',
    '  justify-content: center; gap: 2px; padding: 6px; transition: opacity .2s, visibility .2s; }',
    '.cm-arrows { flex-direction: row; opacity: 0; visibility: hidden; }',
    '.cm-moving .cm-main { opacity: 0; visibility: hidden; }',
    '.cm-moving .cm-arrows { opacity: 1; visibility: visible; }',

    '.cm-panel button { flex: 1 1 0; min-width: 0; min-height: 0; max-height: 40px; margin: 0; border: 0; border-radius: 6px;',
    '  padding: 0 .4em 0 calc(.4em + .26em); background: transparent; color: #b8b8d0; cursor: pointer;',
    "  font: 500 11px/1 'Jost', 'Century Gothic', 'Segoe UI', sans-serif; letter-spacing: .26em; text-transform: uppercase;",
    '  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; position: relative;',
    '  opacity: 0; transform: translateY(-4px); transition: color .18s, background-color .18s, opacity .3s, transform .3s; }',
    '.cm-open .cm-panel button { opacity: 1; transform: none; }',
    '.cm-open .cm-main button:nth-child(1) { transition-delay: 0s, 0s, .08s, .08s; }',
    '.cm-open .cm-main button:nth-child(2) { transition-delay: 0s, 0s, .13s, .13s; }',
    '.cm-open .cm-main button:nth-child(3) { transition-delay: 0s, 0s, .18s, .18s; }',
    /* hairline under each label that widens on hover */
    '.cm-main button::after { content: ""; position: absolute; left: 50%; bottom: max(22%, 6px); width: 0; height: 1px;',
    '  background: var(--accent-hi); transition: width .22s, left .22s; }',
    '.cm-panel button:hover:not(:disabled), .cm-panel button:focus-visible { color: var(--accent-pale);',
    '  background: rgba(var(--accent-rgb), .55); outline: none; }',
    '.cm-main button:hover::after, .cm-main button:focus-visible::after { left: calc(50% - 1.1em); width: 2.2em; }',
    '.cm-main button[data-cm=delete]:hover { background: rgba(140, 40, 60, .45); color: #f2d4dc; }',
    '.cm-main button[data-cm=delete]:hover::after { background: #e08a9c; }',
    '.cm-arrows { align-items: center; }',
    '.cm-arrows button { height: 100%; max-height: 44px; font-size: 20px; letter-spacing: 0; padding: 0; }',
    '.cm-arrows button:disabled { filter: grayscale(1); opacity: .22; cursor: not-allowed; }',

    /* short cards: options can't stack, so lay them out in a row sized to the card */
    '@container (max-height: 96px) {',
    '  .cm-main { flex-direction: row; padding: 3px; }',
    '  .cm-main button { max-height: none; font-size: clamp(10px, 34cqh, 11px); letter-spacing: .18em;',
    '    padding: 0 .3em 0 calc(.3em + .18em); }',
    '  .cm-main button::after { bottom: 14%; }',
    '  .cm-arrows button { max-height: none; }',
    '  .cm-arrows { padding: 3px; }',
    '  .cm-arrows button { font-size: clamp(13px, 55cqh, 20px); }',
    '}'
  ].join('\n');

  var PANEL = '<div class="cm-panel"><div class="cm-sheet">' +
    '<div class="cm-main">' +
    '<button type="button" data-cm="move">Move</button>' +
    '<button type="button" data-cm="edit">Edit</button>' +
    '<button type="button" data-cm="delete">Delete</button></div>' +
    '<div class="cm-arrows">' +
    '<button type="button" data-cm="left" aria-label="Move left">⬅️</button>' +
    '<button type="button" data-cm="right" aria-label="Move right">➡️</button></div>' +
    '</div></div>';

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
      $('.note.cm-open').each(function () { if (!this.contains(e.target)) close(this); });
    }, true);
  }

  function open(note) {
    if ($(note).hasClass('cm-open')) return;
    $('.note.cm-open').not(note).each(function () { close(this); });
    if (!$(note).children('.cm-panel').length) {
      var $p = $(PANEL).appendTo(note);
      // Mousedown anywhere on the panel, buttons included, may start the host's
      // drag: it only starts after a hold, so a click stays a click.
      void $p[0].offsetHeight; // commit the closed state so the first open animates
    }
    $(note).removeClass('cm-moving').addClass('cm-open');
  }

  function close(note) { $(note).removeClass('cm-open'); }

  function attach(containerSelector, cb) {
    setup();
    $(containerSelector)
      // A click (a tap on a phone) opens the menu; on desktop, moving off the card closes it.
      .on('mouseleave', '.note', function () { close(this); })
      .on('click', '.note', function (e) { if (!$(e.target).closest('.cm-panel').length) open(this); })
      .on('click', '.cm-panel button', function (e) {
        e.preventDefault();
        var note = $(this).closest('.note')[0], act = $(this).data('cm');
        // The click a drag ends with is not a choice (dropping onto Delete must not delete).
        if (note.cmDragEnd && Date.now() - note.cmDragEnd < 400) return;
        if (act === 'move') {
          var $list = $(note).closest('.list');
          $(note).find('[data-cm=left]').prop('disabled', !$list.prevAll('.list').length);
          $(note).find('[data-cm=right]').prop('disabled', !$list.nextAll('.list').length);
          $(note).addClass('cm-moving');
          return;
        }
        close(note);
        if (act === 'edit') cb.onEdit && cb.onEdit(note);
        else if (act === 'delete') cb.onDelete && cb.onDelete(note);
        else cb.onMove && cb.onMove(note, act === 'left' ? -1 : 1);
      });
  }

  window.CardMenu = { attach: attach };
})(jQuery);
