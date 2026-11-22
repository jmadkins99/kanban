/* A Recurring Card's Schedule and Due date, stored on the Card as
 *   schedule: { every: N, start: 'YYYY-MM-DD', unit: 'days' | 'weeks' | 'months' }
 *             (keys in this order: sync compares Cards as JSON, and Firestore
 *             hands maps back with sorted keys)
 *   due:      'YYYY-MM-DD', the next Schedule date
 * Days are local calendar dates written as 'YYYY-MM-DD'.
 *
 * Every occurrence is counted from the start, never from the one before:
 * days are start + k·N, weeks start + k·7N (so the start's weekday), and
 * months the start's month + k·N on the start's day of the month, clamped to
 * shorter months (Jan 31 gives Feb 28 or 29, then Mar 31).
 *
 * Schedule.onOrAfter(s, day) the first Schedule date on or after `day`
 * Schedule.after(s, day)     the first Schedule date strictly after `day`
 * Schedule.firstDue(s)       the Due date a Card saved today gets: onOrAfter today
 * Schedule.today()           today, local
 * Schedule.make(every, unit, start) a tidy Schedule from what was typed
 * Schedule.label(day)        a short date for "Next: <date>", e.g. "Mar 6"
 * Schedule.startOf(day)      the moment `day` starts: local midnight before it, in ms
 * Schedule.endOf(day)        the moment `day` ends: local midnight after it, in ms
 */
(function () {
  var UNITS = ['days', 'weeks', 'months'];
  var DAY_MS = 86400000;

  function pad(n) { return String(n).padStart(2, '0'); }

  function key(y, m, d) // m from 0; overflowing values roll over, as Date does
  {
    var t = new Date(Date.UTC(y, m, d));
    return t.getUTCFullYear() + '-' + pad(t.getUTCMonth() + 1) + '-' + pad(t.getUTCDate());
  }

  function parts(day) { var p = day.split('-'); return { y: +p[0], m: p[1] - 1, d: +p[2] }; }

  // whole days from a to b; UTC, so clock changes don't count
  function daysBetween(a, b)
  {
    a = parts(a); b = parts(b);
    return Math.round((Date.UTC(b.y, b.m, b.d) - Date.UTC(a.y, a.m, a.d)) / DAY_MS);
  }

  function daysInMonth(y, m) { return new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); }

  function onOrAfter(s, day)
  {
    var start = s.start, every = Math.max(1, Math.floor(s.every) || 1);
    if (day <= start) return start;

    var st = parts(start);

    if (s.unit == 'months')
    {
      var dy = parts(day);
      var k = Math.floor(((dy.y - st.y) * 12 + dy.m - st.m) / every);
      for (;; k++)
      {
        var m = st.m + k * every, y = st.y + Math.floor(m / 12);
        m = ((m % 12) + 12) % 12;
        var at = key(y, m, Math.min(st.d, daysInMonth(y, m)));
        if (at >= day) return at;
      }
    }

    var step = s.unit == 'weeks' ? 7 * every : every;
    return key(st.y, st.m, st.d + Math.ceil(daysBetween(start, day) / step) * step);
  }

  function after(s, day)
  {
    var d = parts(day);
    return onOrAfter(s, key(d.y, d.m, d.d + 1));
  }

  function today()
  {
    var t = new Date();
    return t.getFullYear() + '-' + pad(t.getMonth() + 1) + '-' + pad(t.getDate());
  }

  function firstDue(s) { return onOrAfter(s, today()); }

  function make(every, unit, start)
  {
    every = Math.floor(+every);
    return {
      every: every >= 1 ? every : 1,
      start: /^\d{4}-\d\d-\d\d$/.test(start || '') ? start : today(),
      unit:  UNITS.indexOf(unit) >= 0 ? unit : 'days'
    };
  }

  function label(day)
  {
    var p = parts(day), d = new Date(p.y, p.m, p.d);
    var opts = { month: 'short', day: 'numeric' };
    if (p.y != new Date().getFullYear()) opts.year = 'numeric';
    return d.toLocaleDateString(undefined, opts);
  }

  function startOf(day)
  {
    var p = parts(day);
    return new Date(p.y, p.m, p.d).getTime();
  }

  function endOf(day)
  {
    var p = parts(day);
    return new Date(p.y, p.m, p.d + 1).getTime();
  }

  window.Schedule = { onOrAfter: onOrAfter, after: after, firstDue: firstDue, today: today, make: make, label: label, startOf: startOf, endOf: endOf };
})();
