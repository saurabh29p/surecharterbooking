/**
 * Hard rule 4: anything shared with a partner or client never contains operator net rates,
 * operator bank details or our margin. Documents are built only from client-safe data; this
 * scanner is the second lock. It reads the final text (e.g. extracted from the PDF) and looks
 * for any internal figure, in the ways money is usually written in India.
 */
import type { Paise } from './money.js';

export interface ForbiddenAmount {
  /** Plain-language name, e.g. "Operator A net rate". */
  label: string;
  paise: Paise;
}

export interface ForbiddenPercent {
  label: string;
  bps: number;
}

export interface ForbiddenText {
  label: string;
  value: string;
}

export interface LeakScanInput {
  amounts: readonly ForbiddenAmount[];
  percents?: readonly ForbiddenPercent[];
  /** Exact strings that must never appear (bank account numbers, IFSC codes). */
  texts?: readonly ForbiddenText[];
  /**
   * Figures the document legitimately shows (prices, GST, totals; cancellation and payment
   * percentages). An internal figure that equals one of these can't be told apart, so it is
   * not searched for. The desk warns separately about lines with no margin.
   */
  allowedAmounts?: readonly Paise[];
  allowedPercents?: readonly number[];
}

export interface LeakFinding {
  label: string;
  /** The text that matched, as found. */
  found: string;
}

/** Words that only internal figures are labelled with. */
export const INTERNAL_WORDS: ReadonlyArray<{ label: string; re: RegExp }> = [
  { label: 'the words "net rate"', re: /\bnet\s+rates?\b/i },
  { label: 'the word "margin"', re: /\bmargins?\b/i },
  { label: 'the word "markup"', re: /\bmark-?\s?ups?\b/i },
  { label: 'the word "commission"', re: /\bcommissions?\b/i },
  { label: 'the words "cost price"', re: /\bcost\s+prices?\b/i },
];

/** Amounts under ₹1,000 are not searched: they collide with dates, seats and day counts. */
export const MIN_SCANNED_PAISE = 1_000_00;

const MULTIPLIERS: Record<string, number> = {
  l: 1_00_000,
  lac: 1_00_000,
  lakh: 1_00_000,
  lakhs: 1_00_000,
  cr: 1_00_00_000,
  crore: 1_00_00_000,
  crores: 1_00_00_000,
};

/** Tidies extracted text: odd spaces, digits split by a space after a comma ("4,75, 000"). */
export function normaliseScanText(text: string): string {
  return text
    .replace(/[\u00a0\u2007\u2009\u202f]/g, ' ')
    .replace(/(\d),\s+(?=\d)/g, '$1,')
    .replace(/(\d)\s+(?=,\d)/g, '$1');
}

interface NumberToken {
  /** Value in paise (whole rupees × 100, or with decimals). */
  paise: number;
  percent: boolean;
  raw: string;
}

/** Every number in the text: "₹4,75,000", "475000", "4.75 lakh", "₹1.2Cr", "9.09%". */
export function numberTokens(text: string): NumberToken[] {
  const out: NumberToken[] = [];
  const re = /(\d[\d,]*(?:\.\d+)?)(?:\s*(%)|\s*(lakhs?|lac|l|crores?|cr)\b)?/gi;
  for (const m of normaliseScanText(text).matchAll(re)) {
    const digits = m[1]!.replace(/,/g, '');
    const value = Number(digits);
    if (!Number.isFinite(value)) continue;
    if (m[2]) {
      out.push({ paise: Math.round(value * 100), percent: true, raw: m[0] });
      continue;
    }
    const mult = MULTIPLIERS[(m[3] ?? '').toLowerCase()] ?? 1;
    out.push({ paise: Math.round(value * mult * 100), percent: false, raw: m[0] });
  }
  return out;
}

/** Finds internal figures and words in `text`. Empty = nothing leaked. */
export function findLeaks(text: string, input: LeakScanInput): LeakFinding[] {
  const findings: LeakFinding[] = [];
  const clean = normaliseScanText(text);

  for (const w of INTERNAL_WORDS) {
    const m = w.re.exec(clean);
    if (m) findings.push({ label: w.label, found: m[0] });
  }

  const allowed = new Set(input.allowedAmounts ?? []);
  const amounts = input.amounts.filter(
    (a) => a.paise >= MIN_SCANNED_PAISE && !allowed.has(a.paise),
  );
  const allowedPct = new Set(input.allowedPercents ?? []);
  const percents = (input.percents ?? []).filter((p) => p.bps > 0 && !allowedPct.has(p.bps));
  const tokens = numberTokens(clean);
  for (const a of amounts) {
    const hit = tokens.find((t) => !t.percent && t.paise === a.paise);
    if (hit) findings.push({ label: a.label, found: hit.raw.trim() });
  }
  for (const p of percents) {
    const hit = tokens.find((t) => t.percent && t.paise === p.bps);
    if (hit) findings.push({ label: p.label, found: hit.raw.trim() });
  }

  const squashed = clean.replace(/[\s-]/g, '').toUpperCase();
  for (const t of input.texts ?? []) {
    const needle = t.value.replace(/[\s-]/g, '').toUpperCase();
    if (needle.length >= 4 && squashed.includes(needle))
      findings.push({ label: t.label, found: t.value });
  }
  return findings;
}

/** "Operator A net rate (₹4,75,000)" style summary for an error message. */
export function describeLeaks(findings: readonly LeakFinding[]): string {
  return findings.map((f) => `${f.label} ("${f.found}")`).join('; ');
}
