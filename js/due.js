/* The Due date module: decides every Due-date transition of a Card, from
 * plain values, and hands back a Decision for the caller to apply (see
 * applyDue in index.html). It never touches the page or reads the clock.
 * Needs Priority and Schedule.
 *
 *   card   = { priority, due, schedule, arrival, criticalSince }  a Card's saved fields, never changed
 *   where  = { role: 'backlog'|'todo'|'wip'|'done'|'other', hasTodo }  the List the Card is in
 *   moment = { today: 'YYYY-MM-DD', now: ms }  read off the clock by the caller
 *
 * Due.edited(card, where, moment, picked)  saved in the Card editor, where
 *   picked = { priority, schedule|null, due|null (as typed), isNew, on }
 *   → Decision { to, due, schedule, criticalSince, changed }
 * Due.shows(card, where, moment)  the Due-date part of what a Card shows:
 *   { dueLine: { value, min } }, what the Card editor's Due line starts
 *   from (a Critical Card's Due date, or empty) and the earliest day it takes
 *
 * A Decision is the whole state: every key is present, null deletes the
 * field, and an unchanged value comes back as the very one passed in (so a
 * saved Card's keys only change order on a real delete). `to` is where the
 * Card moves ('todo' or 'backlog'), null when it stays; a move restarts its
 * Critical timer (criticalSince null). `changed`: the Schedule or Due date
 * picked differs from the Card's.
 *
 * Arrival stays with the callers: they stamp it on every move and Priority
 * change. It's a List-order concept (docs/adr/0002), read here, not written.
 */
(function () {
  function need(moment) {
    if (! moment || ! moment.today || moment.now == null)
      throw new TypeError('Due: moment needs today and now');
  }

  function orNull(v) { return v == null ? null : v; }

  function edited(card, where, moment, picked) {
    need(moment);
    var priority = Priority.of(picked), priorityChanged = priority != Priority.of(card);
    var d = { to: null, due: orNull(card.due), schedule: orNull(card.schedule), criticalSince: orNull(card.criticalSince), changed: false };

    if (Priority.isRecurring(picked)) {
      var s = picked.schedule;
      var scheduleChanged = JSON.stringify(s) != JSON.stringify(card.schedule);
      if (scheduleChanged || priorityChanged || picked.isNew) {
        d.schedule = scheduleChanged ? s : card.schedule;
        d.due = Schedule.onOrAfter(s, moment.today);
      }
      d.changed = scheduleChanged;
      if (priorityChanged || picked.isNew) waitInBacklog(d, where, moment);
      return d;
    }

    // Only a Recurring Card has a Schedule; another Priority drops its Due
    // date too, though a Critical Card may be given one below.
    if (priorityChanged) { d.schedule = null; d.due = null; }

    if (Priority.isCritical(picked)) {
      var was = Priority.isCritical(card) && card.due || '';
      var typed = typedDue(picked.due, picked.on, was);
      d.due = typed || null;
      d.changed = typed != was;
      if (typed && d.changed) waitInBacklog(d, where, moment);
    }

    return d;
  }

  // A Critical Card's Due date as typed in the Card editor: a day after the
  // one it was picked on, or none. Any other day keeps the one it had.
  function typedDue(typed, on, was) {
    if (! typed) return '';
    return /^\d{4}-\d\d-\d\d$/.test(typed) && typed > on ? typed : was;
  }

  // A Card just saved with a Due date still to come waits for it in Backlog;
  // one in Done stays, and so does one in Backlog already.
  function waitInBacklog(d, where, moment) {
    if (d.due <= moment.today || where.role == 'done' || where.role == 'backlog')
      return;
    d.to = 'backlog';
    d.criticalSince = null;
  }

  function shows(card, where, moment) {
    need(moment);
    return {
      dueLine: { value: Priority.isCritical(card) && card.due || '', min: dayAfter(moment.today) }
    };
  }

  function dayAfter(day) { return Schedule.after({ every: 1, start: day, unit: 'days' }, day); }

  window.Due = { edited: edited, shows: shows };
})();
