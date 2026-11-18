/**
 * Agreement templates: the three kinds, the {{placeholders}} each may use, and checks for a
 * template body. Templates are Markdown; placeholders are filled from real records when a
 * document is made. Block placeholders (tables) must stand on a line of their own.
 */
import type { Paise } from './money.js';

export const AGREEMENT_KINDS = [
  'OPERATOR_AGREEMENT',
  'CLIENT_TERMS',
  'REFERRAL_AGREEMENT',
] as const;
export type AgreementKind = (typeof AGREEMENT_KINDS)[number];

export const AGREEMENT_LABELS: Record<AgreementKind, string> = {
  OPERATOR_AGREEMENT: 'Operator–Broker Agreement',
  CLIENT_TERMS: 'Client Charter Terms and Booking Confirmation',
  REFERRAL_AGREEMENT: 'Partner Referral Agreement',
};

/** Who each agreement is made for. */
export const AGREEMENT_SUBJECT: Record<AgreementKind, 'operator' | 'wedding' | 'partner'> = {
  OPERATOR_AGREEMENT: 'operator',
  CLIENT_TERMS: 'wedding',
  REFERRAL_AGREEMENT: 'partner',
};

export type DocumentType = AgreementKind | 'QUOTE' | 'INVOICE' | 'RATE_REQUEST';

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  ...AGREEMENT_LABELS,
  QUOTE: 'Quote',
  INVOICE: 'Tax invoice',
  RATE_REQUEST: 'Rate request',
};

export const DOCUMENT_STATUS_LABELS = {
  DRAFT: 'Not sent',
  SHARED: 'Sent',
  SIGNED: 'Signed',
} as const;
export type DocumentStatus = keyof typeof DOCUMENT_STATUS_LABELS;

/** The watermark on agreements whose template a lawyer has not approved yet. */
export const DRAFT_WATERMARK = 'DRAFT – NOT FOR SIGNATURE';

export interface PlaceholderDef {
  key: string;
  label: string;
  /** A table or list that must stand on its own line. */
  block?: boolean;
}

const COMMON: PlaceholderDef[] = [
  { key: 'date', label: 'Date of the agreement' },
  { key: 'place', label: 'Place of execution (your arbitration seat city)' },
  { key: 'us.brand', label: 'Your brand name' },
  { key: 'us.legal_name', label: 'Your legal entity name' },
  { key: 'us.llpin', label: 'Your LLPIN' },
  { key: 'us.gstin', label: 'Your GSTIN' },
  { key: 'us.address', label: 'Your registered address' },
  { key: 'us.signatory_name', label: 'Your authorised signatory' },
  { key: 'us.signatory_designation', label: 'Their designation' },
  { key: 'us.arbitration_city', label: 'Seat of arbitration' },
];

export const PLACEHOLDERS: Record<AgreementKind, PlaceholderDef[]> = {
  OPERATOR_AGREEMENT: [
    ...COMMON,
    { key: 'operator.legal_name', label: 'Operator legal name' },
    { key: 'operator.brand', label: 'Operator brand' },
    { key: 'operator.cin', label: 'Operator CIN' },
    { key: 'operator.gstin', label: 'Operator GSTIN' },
    { key: 'operator.address', label: 'Operator registered address' },
    { key: 'operator.nsop_no', label: 'NSOP permit number' },
    { key: 'operator.nsop_valid_until', label: 'NSOP valid until' },
    {
      key: 'operator.cancellation_table',
      label: 'Operator cancellation charges (table)',
      block: true,
    },
  ],
  CLIENT_TERMS: [
    ...COMMON,
    { key: 'client.name', label: 'Client name' },
    { key: 'client.address', label: 'Client billing address' },
    { key: 'client.gstin', label: 'Client GSTIN' },
    { key: 'client.phone', label: 'Client phone' },
    { key: 'client.email', label: 'Client email' },
    { key: 'wedding.code', label: 'Wedding code' },
    { key: 'wedding.city', label: 'Wedding city' },
    { key: 'wedding.dates', label: 'Wedding dates' },
    { key: 'quote.reference', label: 'Quote reference' },
    { key: 'quote.date', label: 'Quote date' },
    { key: 'quote.total', label: 'Total price incl. GST' },
    { key: 'quote.total_words', label: 'Total price in words' },
    {
      key: 'quote.itinerary',
      label: 'Flights, aircraft, operators and prices (table)',
      block: true,
    },
    { key: 'quote.payment_schedule', label: 'Payment schedule (table)', block: true },
    { key: 'quote.cancellation_table', label: 'Your cancellation charges (table)', block: true },
    { key: 'quote.cancellation_note', label: 'Extra cancellation conditions' },
    { key: 'quote.inclusions', label: 'What is included' },
    { key: 'quote.exclusions', label: 'What is not included' },
  ],
  REFERRAL_AGREEMENT: [
    ...COMMON,
    { key: 'partner.firm', label: 'Partner firm' },
    { key: 'partner.contact_person', label: 'Partner contact person' },
    { key: 'partner.address', label: 'Partner address' },
    { key: 'partner.city', label: 'Partner city' },
    { key: 'partner.gstin', label: 'Partner GSTIN' },
    { key: 'partner.commission', label: 'Commission, in words (e.g. 20% of the Margin)' },
  ],
};

const PLACEHOLDER_RE = /\{\{\s*([a-z_.]+)\s*\}\}/g;

/** Every placeholder key used in a template body, in order of first use. */
export function placeholdersIn(body: string): string[] {
  return [...new Set([...body.matchAll(PLACEHOLDER_RE)].map((m) => m[1]!))];
}

export const MAX_TEMPLATE_LENGTH = 100_000;

/** Plain-language problems with a template body (empty = fine to save). */
export function templateProblems(kind: AgreementKind, body: string): string[] {
  const problems: string[] = [];
  if (body.trim().length < 50) problems.push('The template is empty or too short');
  if (body.length > MAX_TEMPLATE_LENGTH)
    problems.push(
      `Keep the template under ${MAX_TEMPLATE_LENGTH.toLocaleString('en-IN')} characters`,
    );
  const defs = PLACEHOLDERS[kind];
  const unknown = placeholdersIn(body).filter((k) => !defs.some((d) => d.key === k));
  if (unknown.length)
    problems.push(
      `Unknown placeholder${unknown.length > 1 ? 's' : ''}: ${unknown.map((k) => `{{${k}}}`).join(', ')}`,
    );
  for (const d of defs.filter((x) => x.block)) {
    const re = new RegExp(`\\{\\{\\s*${d.key.replace('.', '\\.')}\\s*\\}\\}`, 'g');
    for (const m of body.matchAll(re)) {
      const lineStart = body.lastIndexOf('\n', m.index! - 1) + 1;
      const lineEnd = body.indexOf('\n', m.index!);
      const line = body.slice(lineStart, lineEnd === -1 ? undefined : lineEnd).trim();
      if (line !== m[0]) {
        problems.push(`{{${d.key}}} is a table: put it on a line of its own`);
        break;
      }
    }
  }
  if (/<\s*script/i.test(body)) problems.push('Templates cannot contain scripts');
  return problems;
}

// ---------- Amount in words (Indian numbering) ----------

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function belowHundred(n: number): string {
  if (n < 20) return ONES[n]!;
  const t = TENS[Math.floor(n / 10)]!;
  return n % 10 ? `${t}-${ONES[n % 10]}` : t;
}

function belowThousand(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return [h ? `${ONES[h]} Hundred` : '', rest ? belowHundred(rest) : ''].filter(Boolean).join(' ');
}

/** 1,27,97,10 → "Twelve Lakh Seventy-Nine Thousand Seven Hundred Ten". */
export function numberInWordsIndian(n: number): string {
  if (!Number.isSafeInteger(n) || n < 0) throw new RangeError(`Cannot write ${n} in words`);
  if (n === 0) return 'Zero';
  const parts: string[] = [];
  const crore = Math.floor(n / 1_00_00_000);
  let rest = n % 1_00_00_000;
  if (crore) parts.push(`${numberInWordsIndian(crore)} Crore`);
  const lakh = Math.floor(rest / 1_00_000);
  rest %= 1_00_000;
  if (lakh) parts.push(`${belowHundred(lakh)} Lakh`);
  const thousand = Math.floor(rest / 1000);
  rest %= 1000;
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`);
  if (rest) parts.push(belowThousand(rest));
  return parts.join(' ');
}

/** ₹12,79,710.50 → "Rupees Twelve Lakh Seventy-Nine Thousand Seven Hundred Ten and Fifty Paise Only". */
export function rupeesInWords(amount: Paise): string {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new RangeError('Amount must be paise ≥ 0');
  const rupees = Math.floor(amount / 100);
  const paise = amount % 100;
  return `Rupees ${numberInWordsIndian(rupees)}${paise ? ` and ${belowHundred(paise)} Paise` : ''} Only`;
}
