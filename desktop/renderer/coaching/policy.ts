/** Version stored with each booking when the student accepts the cancellation terms. */
export const CANCELLATION_POLICY = "24h-v1";
export const CANCELLATION_NOTICE = 24 * 60 * 60_000;
export const CANCELLATION_TERMS = "Cancellations must be made more than 24 hours before the session starts. No cancellation is available in the final 24 hours, including for bookings made during that period. This does not affect your statutory rights.";
export const cancellationOpen = (startsAt: number, now = Date.now()) => startsAt - now > CANCELLATION_NOTICE;
