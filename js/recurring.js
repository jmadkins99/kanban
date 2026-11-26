/* The Due-date rules not yet in the Due date module (js/due.js), worked out
 * from a Card's saved fields: its Priority and its Schedule and Due date (see
 * js/schedule.js). Days are 'YYYY-MM-DD'; `today` defaults to today, local.
 * A Recurring Card's Due date is its next Schedule date; a Critical Card may
 * have one too, once, to wait for a day still to come (see GLOSSARY.md).
 * Needs Priority and Schedule.
 *
 * Recurring.isLate(card, today)    a Recurring Card is Late once its Due date
 *                                  has ended; never stored, not a Priority.
 *                                  (A Card in Done is never Late: don't ask.)
 * Recurring.waitsForDue(card, today) whether a Card's Due date is still to
 *                                  come: in Backlog it shows "Next: <date>",
 *                                  and a Critical one has no Critical timer
 */
(function () {
  function isLate(card, today) {
    return Priority.isRecurring(card) && !! card.due && card.due < (today || Schedule.today());
  }

  function waitsForDue(card, today) {
    return !! card.due && card.due > (today || Schedule.today());
  }

  window.Recurring = { isLate: isLate, waitsForDue: waitsForDue };
})();
