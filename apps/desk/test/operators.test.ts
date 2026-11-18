import { describe, expect, it } from 'vitest';
import { newOperatorForm, operatorBody } from '../src/composables/operatorForm';
import { expiryText, fleetSummary } from '../src/composables/operators';

describe('operator helpers', () => {
  it('summarises a fleet in plain words', () => {
    expect(fleetSummary({ MIDSIZE: 2, HEAVY: 1 })).toBe('2 midsize jet · 1 heavy jet');
    expect(fleetSummary({})).toBe('No aircraft added');
  });

  it('describes expiries relative to today', () => {
    expect(expiryText({ kind: 'INSURANCE', expiresOn: '2026-11-26', daysLeft: 9 })).toBe(
      'Insurance expires in 9 days (26 Nov 2026)',
    );
    expect(expiryText({ kind: 'NSOP', expiresOn: '2026-11-18', daysLeft: 0 })).toBe(
      'NSOP permit expires today',
    );
    expect(expiryText({ kind: 'NSOP', expiresOn: '2026-11-17', daysLeft: -1 })).toBe(
      'NSOP permit expired 1 day ago (17 Nov 2026)',
    );
  });

  it('turns the form into an API body (empty clears, rank as a number)', () => {
    const f = newOperatorForm();
    f.legalName = '  Operator E  ';
    f.dgcaRank = '12';
    f.bases = ['DEL'];
    expect(operatorBody(f)).toMatchObject({
      legalName: 'Operator E',
      dgcaRank: 12,
      bases: ['DEL'],
      brand: '',
      notes: '',
    });
    f.dgcaRank = '';
    expect(operatorBody(f).dgcaRank).toBeNull();
  });
});
