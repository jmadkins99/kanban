/* Priority: every Card has exactly one, stored on the Card as `priority`.
 * Priority.LEVELS   the four, from the top of a List down
 * Priority.of(card) the Card's Priority; a missing or unknown one is Low
 * Priority.label(p) "Recurring", "Critical", "Medium" or "Low"
 * Priority.icon(p)  its icon as inline SVG markup, coloured by CSS through
 *                   the classes "prio-icon prio-<p>" (stroke is currentColor)
 * The icons are drawn here in Jira's style, not taken from Atlassian.
 */
(function () {
  var LEVELS = ['recurring', 'critical', 'medium', 'low'];

  var LABELS = { recurring: 'Recurring', critical: 'Critical', medium: 'Medium', low: 'Low' };

  var LINE = ' fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
  var SHAPES = {
    // two chevrons pointing up
    critical: '<path d="M3.5 8.5L8 4l4.5 4.5M3.5 12.5L8 8l4.5 4.5"' + LINE + '/>',
    // two equal bars
    medium: '<path d="M3 6h10M3 10.5h10"' + LINE + '/>',
    // one chevron pointing down
    low: '<path d="M3.5 6L8 10.5 12.5 6"' + LINE + '/>',
    // most of a circle, clockwise, with an arrowhead at its end
    recurring: '<path d="M13 8a5 5 0 1 1-2.5-4.33"' + LINE + '/>' +
      '<path d="M12.7 4.9L9.4 5.6l2.2-3.8z" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/>'
  };

  function of(card) {
    var p = card && card.priority;
    return LABELS.hasOwnProperty(p) ? p : 'low';
  }

  function label(p) { return LABELS[of({ priority: p })]; }

  function icon(p) {
    p = of({ priority: p });
    return '<svg class="prio-icon prio-' + p + '" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">' +
      SHAPES[p] + '</svg>';
  }

  window.Priority = { LEVELS: LEVELS, of: of, label: label, icon: icon };
})();
