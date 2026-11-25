/* The Recurring cycle's rules, worked out from a Card's saved fields: its
 * Priority, its Arrival (`arrival`, in ms) and its Schedule and Due date (see
 * js/schedule.js). Days are 'YYYY-MM-DD'; `today` defaults to today, local.
 * Needs Priority and Schedule.
 *
 * Recurring.isLate(card, today)    a Recurring Card is Late once its Due date
 *                                  has ended; never stored, not a Priority.
 *                                  (A Card in Done is never Late: don't ask.)
 * Recurring.nextDue(card, day, today) the Due date a Card finished on `day`
 *                                  comes back with: the first Schedule date
 *                                  after its current one, after `day` and
 *                                  after yesterday, so missed dates don't pile
 *                                  up and it's never due on a day gone by
 * Recurring.movesOn(card, today)   whether a Card in Backlog moves on to To-Do
 *                                  by itself: it has a Due date (Recurring, or
 *                                  Critical waiting for a day), the day has
 *                                  come, and it was waiting there before that
 *                                  day began. One put back by hand, or saved
 *                                  there due today, stays.
 */
(function () {
  function isLate(card, today) {
    return Priority.isRecurring(card) && !! card.due && card.due < (today || Schedule.today());
  }

  function nextDue(card, day, today) {
    var s = card.schedule;
    return [Schedule.after(s, card.due || day), Schedule.after(s, day), Schedule.onOrAfter(s, today || Schedule.today())].sort().pop();
  }

  function movesOn(card, today) {
    return !! card.due && card.due <= (today || Schedule.today()) &&
      (card.arrival || 0) < Schedule.startOf(card.due);
  }

  window.Recurring = { isLate: isLate, nextDue: nextDue, movesOn: movesOn };
})();
