import {
  checkGstin,
  checkIfsc,
  checkLlpin,
  stateName,
  type BankDetails,
  type BusinessProfileView,
} from '@shubhjets/shared';
import { reactive } from 'vue';

export interface ProfileFormState {
  label: string;
  brandName: string;
  legalName: string;
  llpin: string;
  gstin: string;
  stateCode: string;
  registeredAddress: string;
  signatoryName: string;
  signatoryDesignation: string;
  arbitrationSeatCity: string;
  invoicePrefix: string;
  bank: {
    accountName: string;
    accountNumber: string;
    ifsc: string;
    bankName: string;
    branch: string;
  };
}

export type ProfileSection = 'business' | 'bank' | 'signing';

const SECTION_FIELDS: Record<
  Exclude<ProfileSection, 'bank'>,
  (keyof Omit<ProfileFormState, 'bank'>)[]
> = {
  business: ['label', 'brandName', 'legalName', 'stateCode', 'gstin', 'llpin', 'registeredAddress'],
  signing: ['signatoryName', 'signatoryDesignation', 'arbitrationSeatCity', 'invoicePrefix'],
};

const emptyBank = () => ({
  accountName: '',
  accountNumber: '',
  ifsc: '',
  bankName: '',
  branch: '',
});

export function newProfileForm(view?: BusinessProfileView | null): ProfileFormState {
  return reactive({
    label: view?.label ?? '',
    brandName: view?.brandName ?? 'Vaanika',
    legalName: view?.legalName ?? '',
    llpin: view?.llpin ?? '',
    gstin: view?.gstin ?? '',
    stateCode: view?.stateCode ?? '07',
    registeredAddress: view?.registeredAddress ?? '',
    signatoryName: view?.signatoryName ?? '',
    signatoryDesignation: view?.signatoryDesignation ?? '',
    arbitrationSeatCity: view?.arbitrationSeatCity ?? '',
    invoicePrefix: view?.invoicePrefix ?? 'VK',
    bank: emptyBank(),
  });
}

export function fillBank(form: ProfileFormState, bank: BankDetails | null) {
  form.bank = { ...emptyBank(), ...(bank ?? {}), branch: bank?.branch ?? '' };
}

export const bankIsEmpty = (form: ProfileFormState) =>
  Object.values(form.bank).every((v) => v.trim() === '');

/**
 * The PATCH/POST body for the given sections. Empty text clears a field.
 * Bank details are sent only when something was typed (so a skipped bank step changes nothing).
 */
export function toBody(
  form: ProfileFormState,
  sections: ProfileSection[],
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const section of sections) {
    if (section === 'bank') {
      if (!bankIsEmpty(form)) body.bankDetails = { ...form.bank, branch: form.bank.branch || null };
      continue;
    }
    for (const field of SECTION_FIELDS[section]) {
      const value = form[field].trim();
      if (field === 'label' && value === '') continue;
      body[field] = value;
    }
  }
  return body;
}

/** Client-side checks, mirroring the API so mistakes show as soon as a field is left. */
export const validators = {
  gstin: (stateCode: string) => (v: string) => {
    const check = checkGstin(v);
    if (!check.ok) return check.problem;
    return check.stateCode === stateCode
      ? null
      : `This GSTIN is registered in ${stateName(check.stateCode)}, but the state above is ${stateName(stateCode)}`;
  },
  llpin: (v: string) => checkLlpin(v),
  ifsc: (v: string) => checkIfsc(v),
  accountNumber: (v: string) =>
    /^[0-9]{6,20}$/.test(v.replace(/\s/g, '')) ? null : 'Account numbers have 6–20 digits',
  invoicePrefix: (v: string) =>
    /^[A-Z0-9-]{1,10}$/.test(v.trim().toUpperCase())
      ? null
      : 'Use 1–10 letters, digits or dashes, e.g. SJ',
};
