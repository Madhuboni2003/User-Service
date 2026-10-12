// India has no daylight saving, so IST is a fixed +05:30 and plain arithmetic is enough.
const IST_OFFSET_MS = 330 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const istMidnightMs = (date: Date): number => Math.floor((date.getTime() + IST_OFFSET_MS) / DAY_MS) * DAY_MS;

export const istHour = (date: Date): number => new Date(date.getTime() + IST_OFFSET_MS).getUTCHours();

/** `sendHour`:00 IST, `day` calendar days (IST) after the day `signedUpAt` falls on. Day 2 after a Monday 23:50 signup is Wednesday 11:00. */
export const dueAtForDay = (signedUpAt: Date, day: number, sendHour: number): Date => {
    return new Date(istMidnightMs(signedUpAt) + day * DAY_MS + sendHour * HOUR_MS - IST_OFFSET_MS);
};

/** Tomorrow (IST) at `sendHour`:00. Used so a user who has fallen behind still gets at most one message per day. */
export const nextDaySendSlot = (now: Date, sendHour: number): Date => {
    return new Date(istMidnightMs(now) + DAY_MS + sendHour * HOUR_MS - IST_OFFSET_MS);
};

/** Whether `now` is inside [startHour, endHour) IST. */
export const isWithinSendWindow = (now: Date, startHour: number, endHour: number): boolean => {
    const hour = istHour(now);
    return hour >= startHour && hour < endHour;
};
