import { describe, expect, it } from 'vitest';
import {
  deriveOperatorStatus,
  operatorChecklist,
  operatorExpiries,
  quotability,
  type StatusInput,
} from '../src/index.js';

const today = '2026-11-17';
const ready: StatusInput = {
  nsopNo: 'TEST-NSOP-001',
  safetyDisclosureUrl: 'https://operator.example.test/safety',
  verifiedByOwner: true,
  blockKind: null,
  docs: [
    { kind: 'NSOP', expiresOn: '2027-12-31', verifiedOn: '2026-11-01' },
    { kind: 'INSURANCE', expiresOn: '2027-06-30', verifiedOn: '2026-11-01' },
  ],
};

describe('operator verification', () => {
  it('is VERIFIED and quotable when everything is checked and valid', () => {
    expect(deriveOperatorStatus(ready, today)).toEqual({
      status: 'VERIFIED',
      blockKind: null,
      reason: null,
    });
    expect(quotability(ready, today)).toEqual({ ok: true, reason: null });
  });

  it('stays FOUND (not quotable) until you mark it verified', () => {
    const r = quotability({ ...ready, verifiedByOwner: false }, today);
    expect(r).toEqual({ ok: false, reason: 'Not verified yet' });
  });

  it('needs both documents verified by you, not just uploaded', () => {
    const input = {
      ...ready,
      docs: [
        ready.docs[0]!,
        { kind: 'INSURANCE' as const, expiresOn: '2027-06-30', verifiedOn: null },
      ],
    };
    expect(deriveOperatorStatus(input, today).status).toBe('FOUND');
    const items = operatorChecklist(input, today);
    expect(items.find((i) => i.key === 'insurance_verified')).toMatchObject({
      done: false,
      hint: expect.stringMatching(/tap Verify/),
    });
    expect(quotability(input, today).ok).toBe(false);
  });

  it('is EXPIRING_SOON (still quotable) within 30 days of an expiry', () => {
    const input = {
      ...ready,
      docs: [
        ready.docs[0]!,
        { kind: 'INSURANCE' as const, expiresOn: '2026-11-26', verifiedOn: '2026-01-01' },
      ],
    };
    expect(deriveOperatorStatus(input, today)).toEqual({
      status: 'EXPIRING_SOON',
      blockKind: null,
      reason: 'Insurance certificate expires in 9 days',
    });
    expect(quotability(input, today).ok).toBe(true);
  });

  it('blocks automatically once a document has expired (rule 8), and unblocks when a renewed one is verified', () => {
    const expired = {
      ...ready,
      docs: [
        ready.docs[0]!,
        { kind: 'INSURANCE' as const, expiresOn: '2026-11-16', verifiedOn: '2025-11-01' },
      ],
    };
    expect(deriveOperatorStatus(expired, today)).toEqual({
      status: 'BLOCKED',
      blockKind: 'EXPIRED',
      reason: 'Insurance certificate expired on 16 Nov 2026',
    });
    expect(quotability(expired, today).ok).toBe(false);
    const renewed = {
      ...expired,
      docs: [
        ...expired.docs,
        { kind: 'INSURANCE' as const, expiresOn: '2027-11-16', verifiedOn: '2026-11-17' },
      ],
    };
    expect(deriveOperatorStatus(renewed, today).status).toBe('VERIFIED');
  });

  it('expires at the end of the expiry day, not the start', () => {
    const input = {
      ...ready,
      docs: [
        ready.docs[0]!,
        { kind: 'INSURANCE' as const, expiresOn: today, verifiedOn: '2026-01-01' },
      ],
    };
    expect(deriveOperatorStatus(input, today).status).toBe('EXPIRING_SOON');
  });

  it('keeps a manual block even when documents are fine', () => {
    expect(quotability({ ...ready, blockKind: 'MANUAL' }, today)).toEqual({
      ok: false,
      reason: 'Blocked by you',
    });
  });

  it('lists expiries soonest first', () => {
    expect(operatorExpiries(ready, today).map((e) => e.kind)).toEqual(['INSURANCE', 'NSOP']);
  });

  it('treats the safety disclosure link as recommended, not required', () => {
    const input = { ...ready, safetyDisclosureUrl: null };
    expect(
      operatorChecklist(input, today).find((i) => i.key === 'safety_disclosure'),
    ).toMatchObject({ done: false, required: false });
    expect(deriveOperatorStatus(input, today).status).toBe('VERIFIED');
  });

  it('needs the NSOP number', () => {
    expect(deriveOperatorStatus({ ...ready, nsopNo: ' ' }, today)).toMatchObject({
      status: 'FOUND',
      reason: 'Not ready: nsop permit number recorded',
    });
  });
});
