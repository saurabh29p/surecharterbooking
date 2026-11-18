/**
 * Cancellation schedules: "cancelled at least N days before departure → we keep X%".
 * Stored as tiers so our terms can be compared with each operator's terms by code.
 * Our terms are "looser" when, at some point before departure, we would keep less than the
 * operator keeps from us: the difference would come out of our pocket.
 */
import { formatBps } from './money.js';

export interface CancellationTier {
  /** Applies when the booking is cancelled at least this many days before departure. */
  minDays: number;
  /** Share of the charter price kept, in basis points (10000 = 100%). */
  chargeBps: number;
}

export type CancellationSchedule = CancellationTier[];

export class ScheduleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScheduleError';
  }
}

export const MAX_SCHEDULE_DAYS = 365;
export const MAX_SCHEDULE_TIERS = 8;

/**
 * Sorts tiers (furthest from departure first) and checks them. Throws a plain-language ScheduleError.
 * A schedule must say what happens right up to departure (a "0 days" tier), and charges must not
 * fall as departure gets closer.
 */
export function normaliseSchedule(tiers: readonly CancellationTier[]): CancellationSchedule {
  if (!tiers.length) throw new ScheduleError('Add at least one line');
  if (tiers.length > MAX_SCHEDULE_TIERS)
    throw new ScheduleError(`Use at most ${MAX_SCHEDULE_TIERS} lines`);
  for (const t of tiers) {
    if (!Number.isInteger(t.minDays) || t.minDays < 0 || t.minDays > MAX_SCHEDULE_DAYS)
      throw new ScheduleError(`Days must be a whole number from 0 to ${MAX_SCHEDULE_DAYS}`);
    if (!Number.isInteger(t.chargeBps) || t.chargeBps < 0 || t.chargeBps > 10_000)
      throw new ScheduleError('Charges must be between 0% and 100%');
  }
  const sorted = [...tiers]
    .map((t) => ({ minDays: t.minDays, chargeBps: t.chargeBps }))
    .sort((a, b) => b.minDays - a.minDays);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]!.minDays === sorted[i - 1]!.minDays)
      throw new ScheduleError(`Two lines both start at ${sorted[i]!.minDays} days`);
    if (sorted[i]!.chargeBps < sorted[i - 1]!.chargeBps)
      throw new ScheduleError('Charges should stay the same or rise as the flight gets closer');
  }
  if (sorted[sorted.length - 1]!.minDays !== 0)
    throw new ScheduleError('Add a line for cancellations close to departure (0 days)');
  return sorted;
}

/** Validates without throwing: the error message, or null when fine. */
export function scheduleProblem(tiers: readonly CancellationTier[]): string | null {
  try {
    normaliseSchedule(tiers);
    return null;
  } catch (e) {
    return e instanceof ScheduleError ? e.message : 'Check the cancellation lines';
  }
}

/** The charge for a cancellation `daysBefore` departure. */
export function chargeAt(schedule: CancellationSchedule, daysBefore: number): number {
  for (const t of schedule) if (daysBefore >= t.minDays) return t.chargeBps;
  return schedule[schedule.length - 1]?.chargeBps ?? 10_000;
}

/** Days-before-departure breakpoints of several schedules, furthest first. */
function breakpoints(schedules: readonly CancellationSchedule[]): number[] {
  const set = new Set<number>([0]);
  for (const s of schedules) for (const t of s) set.add(t.minDays);
  return [...set].sort((a, b) => b - a);
}

/** Drops tiers that repeat the charge of the tier before them. */
function compact(tiers: CancellationSchedule): CancellationSchedule {
  const out: CancellationSchedule = [];
  // Walk from closest-to-departure outward so each kept tier starts where its charge begins.
  const asc = [...tiers].sort((a, b) => a.minDays - b.minDays);
  for (const t of asc) {
    const last = out[out.length - 1];
    if (last && last.chargeBps === t.chargeBps) continue;
    out.push(t);
  }
  return out.sort((a, b) => b.minDays - a.minDays);
}

/**
 * The strictest of several schedules (the highest charge at every point). Our terms set to this
 * are never looser than any of the operators'.
 */
export function strictestSchedule(
  schedules: readonly CancellationSchedule[],
): CancellationSchedule {
  if (!schedules.length) throw new ScheduleError('No schedules to combine');
  const points = breakpoints(schedules);
  return compact(
    points.map((d) => ({
      minDays: d,
      chargeBps: Math.max(...schedules.map((s) => chargeAt(s, d))),
    })),
  );
}

export interface ScheduleGap {
  /** The window starts at `fromDays` days before departure (inclusive)… */
  fromDays: number;
  /** …and runs up to `toDays` (exclusive); null = any time further out. */
  toDays: number | null;
  oursBps: number;
  theirsBps: number;
}

/** Every window where our charge is lower than the operator's. Empty = ours are not looser. */
export function looserGaps(
  ours: CancellationSchedule,
  theirs: CancellationSchedule,
): ScheduleGap[] {
  const points = breakpoints([ours, theirs]);
  const gaps: ScheduleGap[] = [];
  points.forEach((d, i) => {
    const o = chargeAt(ours, d);
    const t = chargeAt(theirs, d);
    if (o >= t) return;
    const toDays = i === 0 ? null : points[i - 1]!;
    const prev = gaps[gaps.length - 1];
    // Merge with the window just further out when the charges are the same.
    if (prev && prev.fromDays === toDays && prev.oursBps === o && prev.theirsBps === t) {
      prev.fromDays = d;
      return;
    }
    gaps.push({ fromDays: d, toDays, oursBps: o, theirsBps: t });
  });
  return gaps;
}

/** "30 days or more before departure", "7 to 30 days before departure", "Less than 7 days before departure". */
export function describeWindow(fromDays: number, toDays: number | null): string {
  const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`;
  if (toDays === null)
    return fromDays === 0
      ? 'Any time before departure'
      : `${days(fromDays)} or more before departure`;
  if (fromDays === 0) return `Less than ${days(toDays)} before departure`;
  return `${fromDays} to ${days(toDays)} before departure`;
}

/** Plain-language explanation of one gap, for the looser-terms warning. */
export function describeGap(gap: ScheduleGap, operatorName: string): string {
  return `${describeWindow(gap.fromDays, gap.toDays)}: ${operatorName} keeps ${formatBps(gap.theirsBps)} but your terms keep only ${formatBps(gap.oursBps)}.`;
}

/** Rows for documents: when the booking is cancelled, and what is charged. */
export function describeSchedule(
  schedule: CancellationSchedule,
): Array<{ when: string; charge: string }> {
  return schedule.map((t, i) => ({
    when: describeWindow(t.minDays, i === 0 ? null : schedule[i - 1]!.minDays),
    charge: t.chargeBps === 0 ? 'No charge' : `${formatBps(t.chargeBps)} of the charter price`,
  }));
}

/** Two schedules mean the same thing. */
export function sameSchedule(a: CancellationSchedule, b: CancellationSchedule): boolean {
  const pa = compact(a);
  const pb = compact(b);
  return (
    pa.length === pb.length &&
    pa.every((t, i) => t.minDays === pb[i]!.minDays && t.chargeBps === pb[i]!.chargeBps)
  );
}

/** The starting schedule for new installs (editable in Settings). */
export const DEFAULT_CANCELLATION_SCHEDULE: CancellationSchedule = [
  { minDays: 30, chargeBps: 1_000 },
  { minDays: 7, chargeBps: 5_000 },
  { minDays: 0, chargeBps: 10_000 },
];
