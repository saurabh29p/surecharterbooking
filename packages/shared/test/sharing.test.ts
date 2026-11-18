import { describe, expect, it } from 'vitest';
import {
  linkState,
  mailtoUrl,
  shareMessage,
  shareSubject,
  telegramUrl,
  whatsappUrl,
} from '../src/sharing.js';

const link = 'https://desk.example/s/abc123';

describe('share messages', () => {
  it('writes a short message with the link for a quote', () => {
    expect(
      shareMessage({
        type: 'QUOTE',
        recipientName: 'Asha',
        brand: 'ShubhJets',
        city: 'Jaipur',
        reference: 'W-102 · Q1',
        total: '₹12,33,100',
        validUntil: '19 Nov 2026, 2:30 pm IST',
        link,
      }),
    ).toBe(
      `Namaste Asha,\n\nhere is our quote W-102 · Q1 for the Jaipur wedding flights: ₹12,33,100 including GST, valid until 19 Nov 2026, 2:30 pm IST. You can view it and accept it here:\n${link}\n\nThank you,\nShubhJets`,
    );
  });

  it('covers every document type without a name', () => {
    for (const type of [
      'CLIENT_TERMS',
      'INVOICE',
      'RATE_REQUEST',
      'OPERATOR_AGREEMENT',
      'REFERRAL_AGREEMENT',
    ] as const) {
      const m = shareMessage({
        type,
        brand: 'ShubhJets',
        weddingCode: 'W-104',
        reference: 'SJ/2026-27/0001',
        link,
      });
      expect(m.startsWith('Namaste,')).toBe(true);
      expect(m).toContain(link);
      expect(m).not.toMatch(/margin|net rate|commission/i);
    }
    expect(
      shareSubject({ type: 'INVOICE', brand: 'ShubhJets', reference: 'SJ/2026-27/0001' }),
    ).toBe('Tax invoice SJ/2026-27/0001 · ShubhJets');
  });
});

describe('channel links', () => {
  it('builds WhatsApp, Telegram and mailto links', () => {
    expect(whatsappUrl('Hi there', '+91 98100 00001')).toBe(
      'https://wa.me/919810000001?text=Hi%20there',
    );
    expect(whatsappUrl('Hi')).toBe('https://wa.me/?text=Hi');
    expect(telegramUrl(link, `See ${link}`)).toBe(
      `https://t.me/share/url?url=${encodeURIComponent(link)}&text=See`,
    );
    expect(mailtoUrl('a@b.test', 'Quote', 'Body')).toBe(
      'mailto:a%40b.test?subject=Quote&body=Body',
    );
  });

  it('knows when a link has expired or been revoked', () => {
    const now = new Date('2026-11-18T06:00:00Z');
    expect(linkState({ expiresAt: '2026-12-02T06:00:00Z', revokedAt: null }, now)).toBe('ACTIVE');
    expect(linkState({ expiresAt: '2026-11-18T05:00:00Z', revokedAt: null }, now)).toBe('EXPIRED');
    expect(linkState({ expiresAt: null, revokedAt: now }, now)).toBe('REVOKED');
  });
});
