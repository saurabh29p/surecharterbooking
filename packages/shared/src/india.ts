/** GST state codes (the first two digits of a GSTIN). */
export const GST_STATES: ReadonlyArray<{ code: string; name: string }> = [
  { code: '01', name: 'Jammu and Kashmir' },
  { code: '02', name: 'Himachal Pradesh' },
  { code: '03', name: 'Punjab' },
  { code: '04', name: 'Chandigarh' },
  { code: '05', name: 'Uttarakhand' },
  { code: '06', name: 'Haryana' },
  { code: '07', name: 'Delhi' },
  { code: '08', name: 'Rajasthan' },
  { code: '09', name: 'Uttar Pradesh' },
  { code: '10', name: 'Bihar' },
  { code: '11', name: 'Sikkim' },
  { code: '12', name: 'Arunachal Pradesh' },
  { code: '13', name: 'Nagaland' },
  { code: '14', name: 'Manipur' },
  { code: '15', name: 'Mizoram' },
  { code: '16', name: 'Tripura' },
  { code: '17', name: 'Meghalaya' },
  { code: '18', name: 'Assam' },
  { code: '19', name: 'West Bengal' },
  { code: '20', name: 'Jharkhand' },
  { code: '21', name: 'Odisha' },
  { code: '22', name: 'Chhattisgarh' },
  { code: '23', name: 'Madhya Pradesh' },
  { code: '24', name: 'Gujarat' },
  { code: '26', name: 'Dadra and Nagar Haveli and Daman and Diu' },
  { code: '27', name: 'Maharashtra' },
  { code: '29', name: 'Karnataka' },
  { code: '30', name: 'Goa' },
  { code: '31', name: 'Lakshadweep' },
  { code: '32', name: 'Kerala' },
  { code: '33', name: 'Tamil Nadu' },
  { code: '34', name: 'Puducherry' },
  { code: '35', name: 'Andaman and Nicobar Islands' },
  { code: '36', name: 'Telangana' },
  { code: '37', name: 'Andhra Pradesh' },
  { code: '38', name: 'Ladakh' },
];

/** Delhi: the home state for the first business profile. */
export const DEFAULT_STATE_CODE = '07';

export function stateName(code: string): string | undefined {
  return GST_STATES.find((s) => s.code === code)?.name;
}

const GSTIN_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function gstinCheckChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const value = GSTIN_CHARS.indexOf(first14[i] ?? '');
    const product = value * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return GSTIN_CHARS[(36 - (sum % 36)) % 36] ?? '';
}

export type GstinCheck = { ok: true; stateCode: string } | { ok: false; problem: string };

/** Format, state code and check digit of a GSTIN, e.g. "07AAAAA0000A1Z5". */
export function checkGstin(input: string): GstinCheck {
  const gstin = input.trim().toUpperCase();
  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) {
    return { ok: false, problem: 'A GSTIN has 15 characters, like 07ABCDE1234F1Z5' };
  }
  const stateCode = gstin.slice(0, 2);
  if (!stateName(stateCode)) return { ok: false, problem: `${stateCode} is not a GST state code` };
  if (gstinCheckChar(gstin.slice(0, 14)) !== gstin[14]) {
    return { ok: false, problem: 'This GSTIN has a typo (the last character does not match)' };
  }
  return { ok: true, stateCode };
}

/** Builds a valid-looking GSTIN for fake seed and test data. */
export function fakeGstin(stateCode: string, pan: string, entity = '1'): string {
  const first14 = `${stateCode}${pan}${entity}Z`;
  return first14 + gstinCheckChar(first14);
}

/** LLP Identification Number, e.g. "AAB-1234". */
export function checkLlpin(input: string): string | null {
  return /^[A-Z]{3}-[0-9]{4}$/.test(input.trim().toUpperCase())
    ? null
    : 'An LLPIN looks like AAB-1234';
}

/** Bank IFSC, e.g. "HDFC0001234". */
export function checkIfsc(input: string): string | null {
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(input.trim().toUpperCase())
    ? null
    : 'An IFSC has 11 characters, like HDFC0001234';
}
