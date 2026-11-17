import { describe as group, expect, it } from 'vitest';
import { describe, type AuditItem } from '../src/composables/activity';

const item = (p: Partial<AuditItem>): AuditItem => ({
  id: '1',
  at: '2026-11-17T10:00:00Z',
  actorType: 'USER',
  actorLabel: 'Owner',
  entity: 'setting',
  entityId: 'markup.default_bps',
  action: 'UPDATED',
  diff: null,
  ...p,
});

group('activity log wording', () => {
  it('describes setting changes in their own units', () => {
    expect(describe(item({ diff: { value: { from: 1000, to: 1250 } } }))).toEqual({
      title: 'Default markup changed',
      changes: ['10% → 12.5%'],
    });
    expect(
      describe(
        item({
          entityId: 'target.monthly_margin_paise',
          diff: { value: { from: 20_00_000_00, to: 25_00_000_00 } },
        }),
      ).changes,
    ).toEqual(['₹20,00,000 → ₹25,00,000']);
    expect(
      describe(item({ entityId: 'gst.rate_bps', diff: { confirmed: { from: false, to: true } } }))
        .changes,
    ).toEqual(['Marked as confirmed by the CA']);
  });

  it('describes business profile edits field by field, hiding secrets', () => {
    const d = describe(
      item({
        entity: 'business_profile',
        entityId: 'p1',
        diff: {
          brandName: { from: 'Old', to: 'New' },
          stateCode: { from: '07', to: '06' },
          bankDetailsEnc: { from: null, to: '[redacted]' },
          isDefault: { from: false, to: true },
        },
      }),
    );
    expect(d.title).toBe('Business profile updated');
    expect(d.changes).toEqual([
      'Brand name: Old → New',
      'State: Delhi → Haryana',
      'Bank details changed',
      'Default: no → yes',
    ]);
  });

  it('names creations and security events plainly', () => {
    expect(
      describe(item({ entity: 'business_profile', action: 'CREATED', diff: { label: 'Delhi' } }))
        .title,
    ).toBe('Business profile created: Delhi');
    expect(describe(item({ entity: 'user', action: 'LOGOUT_ALL' })).title).toBe(
      'Logged out on all devices',
    );
    expect(
      describe(item({ entity: 'business_profile', action: 'BANK_DETAILS_VIEWED' })).title,
    ).toBe('Viewed the full bank details');
  });
});
