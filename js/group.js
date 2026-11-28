/* The Group module: decides which Cards of a List form a Group, and the
 * List's final order (docs/adr/0004). It never touches the page or reads the
 * clock. Needs the Due date module (Due.order).
 *
 *   card   = { text, priority, due, schedule, arrival, ... }  a Card's saved fields, never changed
 *   role   = 'backlog'|'todo'|'wip'|'done'|'other'  the List's role, as Due.order takes it
 *   moment = { today: 'YYYY-MM-DD', now: ms }  read off the clock by the caller
 *
 * Group.nameOf(name)  a Name's Group name: the text before its first ": "
 *   (a colon followed by a space), trimmed and lower-cased; null when there
 *   is none or it's empty. So "9:15" never makes one.
 * Group.arrange(cards, role, moment)  a List's saved Cards in their final
 *   order, as [{ card, place }], each card the very one passed in. They're
 *   in Due.order(role, moment) order, then each Group (two or more Cards
 *   with equal Group names) is pulled together at the place of its first
 *   (highest-ranked) Card, keeping that order inside it. place is 'first',
 *   'middle' or 'last' in a Group, null outside one. Done never groups: its
 *   Cards come back in Due.order order, every place null.
 */
(function () {
  var SEP = ': ';

  function nameOf(name) {
    var at = name ? name.indexOf(SEP) : -1;
    if (at < 0) return null;
    return name.slice(0, at).trim().toLowerCase() || null;
  }

  function arrange(cards, role, moment) {
    var sorted = cards.slice().sort(Due.order(role, moment));
    var names = sorted.map(function (c) { return role == 'done' ? null : nameOf(c.text); });
    var count = {};
    names.forEach(function (g) { if (g != null) count[g] = (count[g] || 0) + 1; });

    var out = [], placed = {};
    sorted.forEach(function (c, i) {
      var g = names[i];
      if (g == null || count[g] < 2) return out.push({ card: c, place: null });
      if (placed[g]) return;
      placed[g] = true;
      var members = sorted.filter(function (_, j) { return names[j] == g; });
      members.forEach(function (m, k) {
        out.push({ card: m, place: k == 0 ? 'first' : k == members.length - 1 ? 'last' : 'middle' });
      });
    });
    return out;
  }

  window.Group = { nameOf: nameOf, arrange: arrange };
})();
