import { describe, expect, it } from 'vitest';
import {
  bankHint,
  checkGstin,
  checkIfsc,
  checkLlpin,
  fakeGstin,
  profileReadiness,
  stateName,
} from '../src/index.js';

describe('GSTIN', () => {
  it('accepts a valid GSTIN and reads its state', () => {
    const gstin = fakeGstin('07', 'AAAFZ1234Q');
    expect(gstin).toHaveLength(15);
    expect(checkGstin(gstin)).toEqual({ ok: true, stateCode: '07' });
    expect(checkGstin(` ${gstin.toLowerCase()} `)).toEqual({ ok: true, stateCode: '07' });
  });

  it('matches the published check-digit algorithm', () => {
    // A widely published sample GSTIN with a correct check character.
    expect(checkGstin('27AAPFU0939F1ZV')).toEqual({ ok: true, stateCode: '27' });
  });

  it('catches typos and wrong formats', () => {
    const gstin = fakeGstin('07', 'AAAFZ1234Q');
    const typo = gstin.slice(0, 14) + (gstin[14] === 'A' ? 'B' : 'A');
    expect(checkGstin(typo)).toMatchObject({ ok: false, problem: expect.stringMatching(/typo/) });
    expect(checkGstin('07AAAFZ1234')).toMatchObject({ ok: false });
    expect(checkGstin('99AAAFZ1234Q1Z5')).toMatchObject({
      ok: false,
      problem: expect.stringMatching(/state code/),
    });
  });

  it('names states', () => {
    expect(stateName('07')).toBe('Delhi');
    expect(stateName('06')).toBe('Haryana');
    expect(stateName('00')).toBeUndefined();
  });
});

describe('LLPIN and IFSC', () => {
  it('validates formats', () => {
    expect(checkLlpin('AAB-1234')).toBeNull();
    expect(checkLlpin('aab-1234')).toBeNull();
    expect(checkLlpin('AAB1234')).toMatch(/AAB-1234/);
    expect(checkIfsc('HDFC0001234')).toBeNull();
    expect(checkIfsc('HDFC1001234')).toMatch(/11 characters/);
  });
});

describe('profileReadiness', () => {
  const complete = {
    gstin: fakeGstin('07', 'AAAFZ1234Q'),
    llpin: 'AAB-1234',
    signatoryName: 'Partner One',
    registeredAddress: '1 Example Road, New Delhi',
    hasBankDetails: true,
  };

  it('is ready when everything is filled', () => {
    expect(profileReadiness(complete)).toEqual({
      missing: [],
      warnings: [],
      canIssueInvoice: true,
      invoiceBlockers: [],
    });
  });

  it('lists every missing field with a plain warning', () => {
    const r = profileReadiness({
      gstin: null,
      llpin: '',
      signatoryName: '  ',
      registeredAddress: null,
      hasBankDetails: false,
    });
    expect(r.missing).toEqual(['gstin', 'llpin', 'signatory', 'bankDetails', 'registeredAddress']);
    expect(r.warnings).toContain('Bank details are missing');
  });

  it('blocks invoices without GSTIN or address', () => {
    expect(profileReadiness({ ...complete, gstin: null }).canIssueInvoice).toBe(false);
    expect(profileReadiness({ ...complete, registeredAddress: '' }).invoiceBlockers).toEqual([
      'Add the registered address before issuing invoices',
    ]);
    // Missing LLPIN or bank details warns but does not block invoices.
    expect(
      profileReadiness({ ...complete, llpin: null, hasBankDetails: false }).canIssueInvoice,
    ).toBe(true);
  });

  it('masks bank account numbers', () => {
    expect(bankHint({ bankName: 'Example Bank', accountNumber: '1234 5678 9012' })).toBe(
      'Example Bank ••••9012',
    );
  });
});

describe('phones and CIN', async () => {
  const { normalizePhone, checkCin } = await import('../src/index.js');
  it('normalises Indian mobiles for WhatsApp links', () => {
    expect(normalizePhone('98765 43210')).toBe('+919876543210');
    expect(normalizePhone('+91 98765-43210')).toBe('+919876543210');
    expect(normalizePhone('09876543210')).toBe('+919876543210');
    expect(normalizePhone('919876543210')).toBe('+919876543210');
    expect(normalizePhone('+44 20 7946 0958')).toBe('+442079460958');
    expect(normalizePhone('12345')).toBeNull();
    expect(normalizePhone('5876543210')).toBeNull();
  });
  it('checks CIN format', () => {
    expect(checkCin('U62200DL2020PTC123456')).toBeNull();
    expect(checkCin('U6220')).toMatch(/21 characters/);
  });
});
