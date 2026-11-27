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
 *   on: the day the Due date was picked, today if it wasn't in this edit.
 *   A date picked before today whose day has come by the save (the editor
 *   left open past midnight) acts as if saved on `on` and moved on by
 *   dayBegins: to To-Do (or Backlog with no To-Do; Done stays)
 *   → Decision { to, due, schedule, criticalSince, changed }
 * Due.moved(card, where, moment)  moved by hand (the card menu); `where` is
 *   the List it landed in, and it stays there (to null)
 * Due.dayBegins(card, where, moment)  the minute tick: a Card in Backlog
 *   moves on to To-Do once its day has come
 * Due.finished(card, where, moment, day)  the midnight Auto-submit, on a Card
 *   in Done finished on `day`; null: it doesn't come back
 * Due.settle(card, where, moment)  every save: starts or ends a Card's
 *   Critical timer where it is; never moves it (to null)
 * Due.shows(card, where, moment)  the Due-date part of what a Card shows:
 *   { late, from, next, nextCritical, dueLine: { value, min } }. late: a
 *   Recurring Card past the end of its Due date, outside Done; it's a state,
 *   never stored, not a Priority. from: when its red Critical timer started
 *   (a Late Card's, the end of its Due date); null for a Card that isn't
 *   waiting. A dated one whose day has come shows it from that midnight
 *   before a save stores it, as settle would; an undated one shows none
 *   until saved.
 *   next: the day it waits for in Backlog, for "Next: <date>", in red when
 *   nextCritical. dueLine: what the Card editor's Due line starts from (a
 *   Critical Card's Due date, or empty) and the earliest day it takes
 * Due.order(role, moment)  a comparator of saved Cards for a List: Late
 *   first, then Priority (Priority.LEVELS), then Arrival (docs/adr/0002).
 *   Done goes by Arrival alone. Backlog (docs/adr/0003): Late; dated
 *   Critical and Recurring together, earliest Due date first, Critical
 *   above Recurring on the same day (a Recurring Card without one after
 *   every dated Card); then Critical without one, Medium and Low; ties by
 *   Arrival.
 *
 * A Decision is the whole state: every key is present, null deletes the
 * field, and an unchanged value comes back as the very one passed in (so a
 * saved Card's keys only change order on a real delete). `to` is where the
 * Card moves ('todo' or 'backlog'), null when it stays; a move restarts its
 * Critical timer (criticalSince null), unless it's a Critical Card whose day
 * has come, whose timer counts from that midnight. `changed` (edited only):
 * the Schedule or Due date picked differs from the Card's.
 *
 * Arrival stays with the callers: they stamp it on every move and Priority
 * change. It's a List-order concept (docs/adr/0002), read here, not written:
 * dayBegins moves on only a Card that arrived before its day began, so one
 * put back by hand, or saved there due today, stays (unless its date was
 * picked before today: edited moves that one on itself).
 */
(function () {
  function requireMoment(moment) {
    if (! moment || ! moment.today || moment.now == null)
      throw new TypeError('Due: moment needs today and now');
  }

  function orNull(v) { return v == null ? null : v; }

  function edited(card, where, moment, picked) {
    requireMoment(moment);
    var priority = Priority.of(picked), priorityChanged = priority != Priority.of(card);
    var d = unchanged(card);
    d.changed = false;

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
      if (typed && d.changed)
        (typed <= moment.today ? dayHasCome : waitInBacklog)(d, where, moment);
    }

    return d;
  }

  // A Due date picked before today (the Card editor open across midnight)
  // whose day has come by the save: the Card acts as one saved that day that
  // waited in Backlog until its day began (dayBegins). It moves on to To-Do,
  // losing its Due date, its Critical timer counting from that midnight; with
  // no To-Do it waits in Backlog, keeping it. One in Done stays. Composed
  // here, not with dayBegins, since the save's move stamps a new Arrival.
  function dayHasCome(d, where) {
    if (where.role == 'done') return;
    if (where.hasTodo) {
      d.to = where.role == 'todo' ? null : 'todo';
      d.criticalSince = Schedule.startOf(d.due);
      d.due = null;
    } else {
      d.to = where.role == 'backlog' ? null : 'backlog';
      d.criticalSince = null;
    }
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

  // Moved by hand: it stays where it landed, its Critical timer starting
  // over, and a Critical Card stops waiting for its day.
  function moved(card, where, moment) {
    requireMoment(moment);
    var d = unchanged(card);
    if (Priority.isCritical(card)) d.due = null;
    d.criticalSince = null;
    return d;
  }

  // The minute tick: a Card in Backlog whose Due date has come moves on to
  // To-Do, if there is one, unless it arrived on or after that day began.
  function dayBegins(card, where, moment) {
    requireMoment(moment);
    var d = unchanged(card);
    if (where.role != 'backlog' || ! where.hasTodo || ! card.due || card.due > moment.today ||
        (card.arrival || 0) >= Schedule.startOf(card.due))
      return d;
    // A Critical one loses its Due date, its Critical timer counting from the
    // start of that day, so every device agrees.
    var critical = Priority.isCritical(card);
    d.to = 'todo';
    d.criticalSince = critical ? Schedule.startOf(card.due) : null;
    if (critical) d.due = null;
    return d;
  }

  // The midnight Auto-submit, on a Card in Done finished on `day`: a
  // Recurring Card goes back to wait for its next Due date, the first
  // Schedule date after its current one, after `day` and on or after today,
  // so missed dates don't pile up and it's never due on a day gone by. Due
  // today, it goes straight to To-Do, if there is one; otherwise to Backlog.
  // Any other Card doesn't come back: null.
  function finished(card, where, moment, day) {
    requireMoment(moment);
    if (! Priority.isRecurring(card) || ! card.schedule)
      return null;
    var s = card.schedule, d = unchanged(card);
    d.due = [Schedule.after(s, card.due || day), Schedule.after(s, day), Schedule.onOrAfter(s, moment.today)].sort().pop();
    d.to = d.due <= moment.today && where.hasTodo ? 'todo' : 'backlog';
    d.criticalSince = null;
    return d;
  }

  function unchanged(card) {
    return { to: null, due: orNull(card.due), schedule: orNull(card.schedule), criticalSince: orNull(card.criticalSince) };
  }

  // Every save: a Critical Card outside WIP and Done is waiting, its
  // Critical timer counting from when it began, unless its Due date is still
  // to come. One whose day has come, still in Backlog (no To-Do to move on
  // to), counts from the start of that day; any other, from now.
  function settle(card, where, moment) {
    requireMoment(moment);
    var d = unchanged(card);
    d.criticalSince = waiting(card, where, moment) ? criticalStart(card) || moment.now : null;
    return d;
  }

  // When a waiting Critical Card's timer started: its criticalSince, or,
  // before a save has stored one, the start of its Due date; null if neither.
  function criticalStart(card) {
    return card.criticalSince || (card.due ? Schedule.startOf(card.due) : null);
  }

  function waiting(card, where, moment) {
    return ! pastWaiting(where.role) && Priority.isCritical(card) && ! waitsForDue(card, moment);
  }

  // WIP and Done: a Card there no longer waits, so it has no Critical timer.
  function pastWaiting(role) { return role == 'wip' || role == 'done'; }

  function waitsForDue(card, moment) { return !! card.due && card.due > moment.today; }

  function isLate(card, role, moment) {
    return role != 'done' && Priority.isRecurring(card) && !! card.due && card.due < moment.today;
  }

  function shows(card, where, moment) {
    requireMoment(moment);
    var late = isLate(card, where.role, moment);
    var next = where.role == 'backlog' && waitsForDue(card, moment) ? card.due : null;
    var from = late && ! pastWaiting(where.role) ? Schedule.endOf(card.due) :
      waiting(card, where, moment) ? criticalStart(card) : null;
    return {
      late: late,
      from: from,
      next: next,
      nextCritical: !! next && Priority.isCritical(card),
      dueLine: { value: Priority.isCritical(card) && card.due || '', min: dayAfter(moment.today) }
    };
  }

  function dayAfter(day) { return Schedule.after({ every: 1, start: day, unit: 'days' }, day); }

  function order(role, moment) {
    requireMoment(moment);
    var backlog = role == 'backlog';
    // Where a Card sorts before Arrival: its tier, then (in Backlog's dated
    // tier) its Due date, none after any date, and Critical before Recurring
    // on one day. See the header.
    var rank = function (card) {
      if (isLate(card, role, moment)) return [-2, '', 0];
      if (backlog && Priority.isCritical(card) && card.due) return [-1, card.due, 0];
      if (backlog && Priority.isRecurring(card)) return [-1, card.due || '~', 1];
      return [Priority.LEVELS.indexOf(Priority.of(card)), '', 0];
    };
    return function (a, b) {
      var arrival = (a.arrival || 0) - (b.arrival || 0);
      if (role == 'done') return arrival;
      var ra = rank(a), rb = rank(b);
      return ra[0] - rb[0] || (ra[1] < rb[1] ? -1 : ra[1] > rb[1] ? 1 : 0) || ra[2] - rb[2] || arrival;
    };
  }

  window.Due = { edited: edited, moved: moved, dayBegins: dayBegins, finished: finished, settle: settle, shows: shows, order: order };
})();
