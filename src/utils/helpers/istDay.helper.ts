// "Days" on the admin candidates screen are Indian calendar days (IST, UTC+05:30, no daylight saving),
// no matter where the server runs or how the database stores timestamps (UTC).
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** YYYY-MM-DD of the IST calendar day that `date` falls in. */
export const istDayKey = (date: Date): string => new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);

/** True for a real calendar date written as YYYY-MM-DD. */
export const isValidDayKey = (value: unknown): value is string => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false;
    }
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

/** [from, to) in real time for one IST calendar day: IST midnight to the next IST midnight. */
export const istDayRange = (dayKey: string): { from: Date; to: Date } => {
    const from = new Date(new Date(`${dayKey}T00:00:00.000Z`).getTime() - IST_OFFSET_MS);
    return { from, to: new Date(from.getTime() + DAY_MS) };
};

/** The last `days` IST calendar days as YYYY-MM-DD, newest first (today is first). */
export const lastDayKeys = (days: number, now: Date = new Date()): string[] => {
    const todayStart = istDayRange(istDayKey(now)).from.getTime();
    return Array.from({ length: days }, (_, i) => istDayKey(new Date(todayStart - i * DAY_MS + 1)));
};
