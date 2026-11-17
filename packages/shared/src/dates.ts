/**
 * All business dates are shown in India Standard Time (Asia/Kolkata, UTC+05:30, no DST).
 * Timestamps are stored in UTC; calendar dates (flight day, wedding day) are stored as "YYYY-MM-DD".
 */

export const IST_TIME_ZONE = 'Asia/Kolkata';
const IST_OFFSET_MINUTES = 330;
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** A calendar date in "YYYY-MM-DD" form. */
export type IsoDate = string;

interface IstParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
}

/** Break a UTC instant into IST wall-clock parts (fixed offset, so no Intl dependency). */
export function istParts(instant: Date): IstParts {
  if (Number.isNaN(instant.getTime())) throw new RangeError('Invalid date');
  const shifted = new Date(instant.getTime() + IST_OFFSET_MINUTES * 60_000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** The IST calendar date of an instant, e.g. 2026-12-11T20:00Z → "2026-12-12". */
export function toIstDate(instant: Date): IsoDate {
  const p = istParts(instant);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

export function parseIsoDate(value: IsoDate): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new RangeError(`Not a YYYY-MM-DD date: ${value}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    throw new RangeError(`Not a real date: ${value}`);
  }
  return { year, month, day };
}

/** The UTC instant of an IST wall-clock time, e.g. ("2026-12-12", "09:30") → 2026-12-12T04:00Z. */
export function istToInstant(date: IsoDate, time = '00:00'): Date {
  const { year, month, day } = parseIsoDate(date);
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) throw new RangeError(`Not an HH:MM time: ${time}`);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new RangeError(`Not a real time: ${time}`);
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - IST_OFFSET_MINUTES * 60_000);
}

function asDateParts(value: Date | IsoDate) {
  return typeof value === 'string' ? parseIsoDate(value) : istParts(value);
}

/** "12 Dec 2026" */
export function formatDate(value: Date | IsoDate): string {
  const p = asDateParts(value);
  return `${p.day} ${MONTHS[p.month - 1]} ${p.year}`;
}

/** "12 Dec" (no year) for compact cards. */
export function formatDayMonth(value: Date | IsoDate): string {
  const p = asDateParts(value);
  return `${p.day} ${MONTHS[p.month - 1]}`;
}

/** "9:05 am" */
export function formatTime(instant: Date): string {
  const p = istParts(instant);
  const h12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  return `${h12}:${pad2(p.minute)} ${p.hour < 12 ? 'am' : 'pm'}`;
}

/** "12 Dec 2026, 9:05 am IST" */
export function formatDateTime(instant: Date): string {
  return `${formatDate(instant)}, ${formatTime(instant)} IST`;
}

/** Indian financial year (1 April – 31 March) of a date, e.g. 2027-03-31 → "2026-27". */
export function financialYear(value: Date | IsoDate): string {
  const p = asDateParts(value);
  const start = p.month >= 4 ? p.year : p.year - 1;
  return `${start}-${pad2((start + 1) % 100)}`;
}

/** Add whole days to a calendar date. */
export function addDays(date: IsoDate, days: number): IsoDate {
  const { year, month, day } = parseIsoDate(date);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** Whole calendar days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  const a = parseIsoDate(from);
  const b = parseIsoDate(to);
  return Math.round(
    (Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86_400_000,
  );
}
