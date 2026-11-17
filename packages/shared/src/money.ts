/**
 * Money is always stored and computed as integer paise (1 rupee = 100 paise).
 * Percentages are basis points (bps): 10000 bps = 100%, 1000 bps = 10%.
 * No floating-point rupees anywhere in business logic.
 */

export type Paise = number;
export type Bps = number;

export const PAISE_PER_RUPEE = 100;
export const BPS_DENOMINATOR = 10_000;
const LAKH_PAISE = 1_00_000 * PAISE_PER_RUPEE;
const CRORE_PAISE = 1_00_00_000 * PAISE_PER_RUPEE;

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

export function assertPaise(value: number, label = 'amount'): asserts value is Paise {
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`${label} must be a whole number of paise (got ${value})`);
  }
}

export function assertBps(value: number, label = 'percentage'): asserts value is Bps {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new MoneyError(
      `${label} must be a non-negative whole number of basis points (got ${value})`,
    );
  }
}

/** Divide integers and round half away from zero (commercial rounding). */
export function divRound(numerator: number, denominator: number): number {
  if (denominator === 0) throw new MoneyError('Division by zero');
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator)) {
    throw new MoneyError('divRound needs safe integers');
  }
  const sign = Math.sign(numerator) * Math.sign(denominator);
  const n = BigInt(Math.abs(numerator));
  const d = BigInt(Math.abs(denominator));
  const q = (n * 2n + d) / (2n * d);
  return sign * Number(q);
}

/** a × b / c with BigInt intermediates, rounded half away from zero. */
export function mulDivRound(a: number, b: number, c: number): number {
  for (const [v, n] of [
    [a, 'a'],
    [b, 'b'],
    [c, 'c'],
  ] as const) {
    if (!Number.isSafeInteger(v)) throw new MoneyError(`${n} must be a safe integer (got ${v})`);
  }
  if (c === 0) throw new MoneyError('Division by zero');
  const product = BigInt(a) * BigInt(b);
  const den = BigInt(c);
  const negative = product < 0n !== den < 0n && product !== 0n;
  const absP = product < 0n ? -product : product;
  const absD = den < 0n ? -den : den;
  const q = (absP * 2n + absD) / (2n * absD);
  const result = Number(negative ? -q : q);
  if (!Number.isSafeInteger(result)) throw new MoneyError('Result is too large');
  return result;
}

/** amount × bps / 10000, rounded half away from zero. Never overflows. */
export function applyBps(amount: Paise, bps: Bps): Paise {
  assertPaise(amount);
  return mulDivRound(amount, bps, BPS_DENOMINATOR);
}

/** part / whole as basis points, rounded. Returns 0 when whole is 0. */
export function ratioBps(part: Paise, whole: Paise): Bps {
  if (whole === 0) return 0;
  return mulDivRound(part, BPS_DENOMINATOR, whole);
}

export function sumPaise(values: readonly Paise[]): Paise {
  let total = 0;
  for (const v of values) {
    assertPaise(v);
    total += v;
  }
  assertPaise(total, 'total');
  return total;
}

/**
 * Split `total` across `weights` proportionally so that the parts add up to exactly `total`
 * (largest-remainder method). Used for package rates that cover several legs.
 */
export function allocateProportionally(total: Paise, weights: readonly number[]): Paise[] {
  assertPaise(total);
  if (weights.length === 0) throw new MoneyError('Need at least one weight');
  for (const w of weights) {
    if (!Number.isSafeInteger(w) || w < 0)
      throw new MoneyError('Weights must be non-negative integers');
  }
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const effective = weightSum === 0 ? weights.map(() => 1) : weights;
  const effSum = weightSum === 0 ? weights.length : weightSum;

  const sign = total < 0 ? -1n : 1n;
  const abs = BigInt(total) * sign;
  const sumB = BigInt(effSum);
  const parts = effective.map((w) => (abs * BigInt(w)) / sumB);
  const remainders = effective.map((w, i) => ({ i, r: (abs * BigInt(w)) % sumB }));
  let leftover = abs - parts.reduce((a, b) => a + b, 0n);
  remainders.sort((a, b) => (b.r === a.r ? a.i - b.i : b.r > a.r ? 1 : -1));
  for (const { i } of remainders) {
    if (leftover === 0n) break;
    parts[i] = (parts[i] ?? 0n) + 1n;
    leftover -= 1n;
  }
  return parts.map((p) => Number(p * sign));
}

/**
 * Parse user input in rupees ("1,23,456.50", "₹ 24000", "2400.5") into paise.
 * Rejects more than 2 decimal places and anything that is not a plain number.
 */
export function parseRupees(input: string | number): Paise {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw new MoneyError('Amount must be a number');
    input = input.toString();
  }
  const cleaned = input.replace(/[₹,\s]/g, '').replace(/^Rs\.?/i, '');
  const match = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) throw new MoneyError(`"${input}" is not a valid rupee amount`);
  const [, minus, whole = '0', frac = ''] = match;
  const paise = Number(whole) * PAISE_PER_RUPEE + Number(frac.padEnd(2, '0'));
  assertPaise(paise);
  return minus ? -paise : paise;
}

/** Group digits the Indian way: 12345678 → "1,23,45,678". */
export function groupIndian(digits: string): string {
  if (!/^\d+$/.test(digits)) throw new MoneyError(`Not a digit string: ${digits}`);
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3);
  return rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
}

export interface FormatInrOptions {
  /** 'auto' shows paise only when non-zero (default); 'always' always shows 2 decimals; 'never' rounds to rupees. */
  paise?: 'auto' | 'always' | 'never';
  /** Omit the ₹ symbol. */
  symbol?: boolean;
}

/** ₹1,23,45,678 (or ₹1,234.50). */
export function formatINR(amount: Paise, options: FormatInrOptions = {}): string {
  assertPaise(amount);
  const mode = options.paise ?? 'auto';
  const symbol = options.symbol === false ? '' : '₹';
  const negative = amount < 0;
  let abs = Math.abs(amount);
  if (mode === 'never') abs = divRound(abs, PAISE_PER_RUPEE) * PAISE_PER_RUPEE;
  const rupees = Math.floor(abs / PAISE_PER_RUPEE);
  const paise = abs % PAISE_PER_RUPEE;
  let text = symbol + groupIndian(String(rupees));
  if (mode === 'always' || (mode === 'auto' && paise !== 0)) {
    text += '.' + String(paise).padStart(2, '0');
  }
  return (negative && abs !== 0 ? '-' : '') + text;
}

/**
 * Compact Indian format for dashboards: ₹24.0L, ₹1.2Cr.
 * Amounts under one lakh are shown in full (₹85,000).
 */
export function formatINRShort(amount: Paise): string {
  assertPaise(amount);
  const negative = amount < 0;
  const abs = Math.abs(amount);
  let text: string;
  if (abs >= CRORE_PAISE) {
    text = '₹' + (divRound(abs, CRORE_PAISE / 10) / 10).toFixed(1) + 'Cr';
  } else if (abs >= LAKH_PAISE) {
    const tenths = divRound(abs, LAKH_PAISE / 10);
    text = tenths >= 1000 ? '₹1.0Cr' : '₹' + (tenths / 10).toFixed(1) + 'L';
  } else {
    text = formatINR(abs, { paise: 'never' });
  }
  return (negative ? '-' : '') + text;
}

/** 1000 bps → "10%", 1250 → "12.5%". */
export function formatBps(bps: Bps): string {
  const pct = bps / 100;
  return (Number.isInteger(pct) ? pct.toString() : pct.toFixed(2).replace(/0+$/, '')) + '%';
}

/** "10" or "12.5" (%) → bps. */
export function parsePercent(input: string | number): Bps {
  const text = String(input).replace(/[%\s]/g, '');
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) throw new MoneyError(`"${input}" is not a valid percentage`);
  const [, whole = '0', frac = ''] = match;
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'));
}
