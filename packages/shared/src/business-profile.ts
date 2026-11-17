/** What the desk and the documents need to know about a business profile (never the raw bank details). */
export interface BusinessProfileView {
  id: string;
  label: string;
  brandName: string | null;
  legalName: string | null;
  llpin: string | null;
  gstin: string | null;
  stateCode: string;
  registeredAddress: string | null;
  hasBankDetails: boolean;
  bankHint: string | null;
  signatoryName: string | null;
  signatoryDesignation: string | null;
  arbitrationSeatCity: string | null;
  logoFileId: string | null;
  invoicePrefix: string;
  isDefault: boolean;
  archived: boolean;
  readiness: ProfileReadiness;
}

export interface BankDetails {
  accountName: string;
  accountNumber: string;
  ifsc: string;
  bankName: string;
  branch?: string | null;
}

export type ReadinessField = 'gstin' | 'llpin' | 'signatory' | 'bankDetails' | 'registeredAddress';

export interface ProfileReadiness {
  /** Fields documents need; each missing one shows a warning on the document. */
  missing: ReadinessField[];
  /** Plain-language warnings, one per missing field. */
  warnings: string[];
  /** Invoices need GSTIN and registered address. */
  canIssueInvoice: boolean;
  invoiceBlockers: string[];
}

type ReadinessInput = Pick<
  BusinessProfileView,
  'gstin' | 'llpin' | 'signatoryName' | 'registeredAddress' | 'hasBankDetails'
>;

const WARNINGS: Record<ReadinessField, string> = {
  gstin: 'GSTIN is missing',
  llpin: 'LLPIN is missing',
  signatory: 'Authorised signatory is missing',
  bankDetails: 'Bank details are missing',
  registeredAddress: 'Registered address is missing',
};

const filled = (v: string | null | undefined) => !!v && v.trim().length > 0;

export function profileReadiness(p: ReadinessInput): ProfileReadiness {
  const missing: ReadinessField[] = [];
  if (!filled(p.gstin)) missing.push('gstin');
  if (!filled(p.llpin)) missing.push('llpin');
  if (!filled(p.signatoryName)) missing.push('signatory');
  if (!p.hasBankDetails) missing.push('bankDetails');
  if (!filled(p.registeredAddress)) missing.push('registeredAddress');
  const invoiceBlockers: string[] = [];
  if (!filled(p.gstin)) invoiceBlockers.push('Add the GSTIN before issuing invoices');
  if (!filled(p.registeredAddress))
    invoiceBlockers.push('Add the registered address before issuing invoices');
  return {
    missing,
    warnings: missing.map((f) => WARNINGS[f]),
    canIssueInvoice: invoiceBlockers.length === 0,
    invoiceBlockers,
  };
}

/** "HDFC Bank ••••1234" — safe to show anywhere. */
export function bankHint(details: Pick<BankDetails, 'bankName' | 'accountNumber'>): string {
  const digits = details.accountNumber.replace(/\s/g, '');
  return `${details.bankName.trim()} ••••${digits.slice(-4)}`;
}
