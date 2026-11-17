import { financialYear, type IsoDate } from './dates.js';

/** Wedding codes: 101 → "W-101". */
export function formatWeddingCode(seq: number): string {
  if (!Number.isSafeInteger(seq) || seq < 1) throw new RangeError(`Invalid wedding number: ${seq}`);
  return `W-${seq}`;
}

/**
 * Invoice numbers per business profile, reset every financial year:
 * ("SJ", 2026-12-12, 1) → "SJ/2026-27/0001".
 */
export function formatInvoiceNumber(prefix: string, issuedOn: Date | IsoDate, seq: number): string {
  const clean = prefix.trim();
  if (!/^[A-Za-z0-9-]{1,10}$/.test(clean)) {
    throw new RangeError('Invoice prefix must be 1–10 letters, digits or dashes');
  }
  if (!Number.isSafeInteger(seq) || seq < 1) throw new RangeError(`Invalid invoice number: ${seq}`);
  return `${clean.toUpperCase()}/${financialYear(issuedOn)}/${String(seq).padStart(4, '0')}`;
}
