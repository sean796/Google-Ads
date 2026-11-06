/**
 * Get the next available start date (today or tomorrow) based on current time and posting time
 *
 * @param postingTime - Time of day to post (HH:MM format)
 * @returns Date object for the next available posting time
 */
export function getNextAvailableStartDate(postingTime: string): Date {
  const now = new Date();
  const [hours, minutes] = postingTime.split(':').map(Number);

  // Create date with posting time today
  const todayWithTime = new Date(now);
  todayWithTime.setHours(hours || 0, minutes || 0, 0, 0);

  // If posting time has already passed today, use tomorrow
  if (todayWithTime <= now) {
    todayWithTime.setDate(todayWithTime.getDate() + 1);
  }

  return todayWithTime;
}

/**
 * The 1st of the **current** calendar month at the given posting time (local), even if that moment is already in the past.
 */
export function getFirstOfThisMonthDate(postingTime = '09:00'): Date {
  const now = new Date();
  const [hours, minutes] = postingTime.split(':').map(Number);
  const h = hours || 0;
  const m = minutes || 0;
  return new Date(now.getFullYear(), now.getMonth(), 1, h, m, 0, 0);
}

/**
 * Anchor for times-per-month schedules.
 * - custom: calendar day of customStartDate (1st this/next month presets use day 1).
 * - immediate: next month's 1st when this month's 1st has passed.
 * Returns a UTC instant whose UTC Y/M/D match the picked local calendar day at startTime.
 */
export function resolveTimesPerMonthAnchorStart(
  startDateOption: 'immediate' | 'custom',
  customStartDate: Date,
  startTime: string,
): Date {
  const [h, m] = startTime.split(':').map(Number);
  const hour = h || 0;
  const minute = m || 0;
  if (startDateOption === 'custom' && customStartDate) {
    return new Date(
      Date.UTC(
        customStartDate.getFullYear(),
        customStartDate.getMonth(),
        customStartDate.getDate(),
        hour,
        minute,
        0,
        0,
      ),
    );
  }
  const next = getNextFirstOfMonthDate(startTime);
  return new Date(
    Date.UTC(next.getFullYear(), next.getMonth(), next.getDate(), hour, minute, 0, 0),
  );
}

/**
 * Next calendar 1st at the given posting time (local). If this month's 1st at that time is still in the future, use it; otherwise the 1st of next month.
 */
export function getNextFirstOfMonthDate(postingTime = '09:00'): Date {
  const now = new Date();
  const [hours, minutes] = postingTime.split(':').map(Number);
  const h = hours || 0;
  const m = minutes || 0;

  const firstThisMonth = new Date(now.getFullYear(), now.getMonth(), 1, h, m, 0, 0);
  if (firstThisMonth > now) {
    return firstThisMonth;
  }
  return new Date(now.getFullYear(), now.getMonth() + 1, 1, h, m, 0, 0);
}

/** True if both dates fall on the same local calendar day. */
export function isSameLocalCalendarDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * Start date when the user explicitly chooses "Pick a date" in the UI.
 * Must not fall on the 1st-of-month anchors; otherwise derived UI state collapses to "First of this/next month"
 * and the calendar row never appears.
 */
export function dateForPickDatePreset(postingTime = '09:00'): Date {
  let d = getNextAvailableStartDate(postingTime);
  const thisMonth = getFirstOfThisMonthDate(postingTime);
  const nextFirst = getNextFirstOfMonthDate(postingTime);
  let guard = 0;
  while (
    (isSameLocalCalendarDay(d, thisMonth) || isSameLocalCalendarDay(d, nextFirst)) &&
    guard < 40
  ) {
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    const [hours, minutes] = postingTime.split(':').map(Number);
    next.setHours(hours || 0, minutes || 0, 0, 0);
    d = next;
    guard++;
  }
  return d;
}

/** True when `a` and `b` share the same UTC calendar year and month (0–11). */
export function isSameUtcYearMonth(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth();
}
