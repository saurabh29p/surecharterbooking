import { describe, expect, it } from 'vitest';
import { fakeGstin } from '@shubhjets/shared';
import { newProfileForm, toBody, validators } from '../src/composables/profileForm';

describe('profile form', () => {
  it('starts with Delhi, the SJ prefix and the brand name', () => {
    const f = newProfileForm();
    expect(f).toMatchObject({ stateCode: '07', invoicePrefix: 'VK', brandName: 'Vaanika' });
  });

  it('sends only the fields of the saved step; empty text clears', () => {
    const f = newProfileForm();
    f.legalName = '  Example Exim LLP ';
    f.signatoryName = 'Partner One';
    expect(toBody(f, ['business'])).toEqual({
      brandName: 'Vaanika',
      legalName: 'Example Exim LLP',
      stateCode: '07',
      gstin: '',
      llpin: '',
      registeredAddress: '',
    });
  });

  it('leaves bank details untouched when the bank step is left empty', () => {
    const f = newProfileForm();
    expect(toBody(f, ['bank'])).toEqual({});
    f.bank.accountNumber = '123456789012';
    expect(toBody(f, ['bank']).bankDetails).toMatchObject({
      accountNumber: '123456789012',
      branch: null,
    });
  });

  it('checks a GSTIN against the chosen state', () => {
    const haryana = fakeGstin('06', 'AAAFZ1234Q');
    expect(validators.gstin('06')(haryana)).toBeNull();
    expect(validators.gstin('07')(haryana)).toMatch(
      /registered in Haryana, but the state above is Delhi/,
    );
    expect(validators.accountNumber('12 34')).toMatch(/6–20 digits/);
  });
});
