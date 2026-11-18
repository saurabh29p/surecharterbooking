import { describe, expect, it } from 'vitest';
import {
  confirmationChecklist,
  idDeletionDate,
  moneyPosition,
  outflow,
  parseGuestLines,
  payoutBlocker,
  type PaymentLike,
} from '../src/payments.js';

const L = 1_00_000_00;

describe('money position', () => {
  const total = 12 * L;

  it('adds up what the client paid and what is committed to payouts', () => {
    const payments: PaymentLike[] = [
      { direction: 'CLIENT_IN', amount: 6 * L, status: 'RECORDED' },
      { direction: 'CLIENT_IN', amount: 2 * L, status: 'RECORDED' },
      { direction: 'OPERATOR_OUT', amount: 4 * L, gstAmount: 20_000_00, status: 'PAID' },
      { direction: 'PARTNER_OUT', amount: 10_000_00, status: 'PAYABLE' },
    ];
    expect(moneyPosition(total, 5000, payments)).toEqual({
      total,
      required: 6 * L,
      received: 8 * L,
      dueToConfirm: 0,
      balance: 4 * L,
      operatorCommitted: 4.2 * L,
      operatorPaid: 4.2 * L,
      partnerCommitted: 10_000_00,
      partnerPaid: 0,
      uncommitted: 8 * L - 4.2 * L - 10_000_00,
    });
    expect(outflow(payments[2]!)).toBe(4.2 * L);
  });

  it('needs the full amount by default before confirming', () => {
    const p = moneyPosition(total, 10_000, [
      { direction: 'CLIENT_IN', amount: 11 * L, status: 'RECORDED' },
    ]);
    expect(p.dueToConfirm).toBe(1 * L);
  });
});

describe('rule 3: payouts only from client money received', () => {
  const pos = moneyPosition(12 * L, 10_000, [
    { direction: 'CLIENT_IN', amount: 5 * L, status: 'RECORDED' },
    { direction: 'OPERATOR_OUT', amount: 3 * L, status: 'PAYABLE' },
  ]);

  it('allows a payout the money covers', () => {
    expect(payoutBlocker(pos, 2 * L)).toBeNull();
  });

  it('explains the shortfall in plain words', () => {
    expect(payoutBlocker(pos, 2.5 * L)).toBe(
      'Client money received covers ₹2,00,000 more in payouts; ₹50,000 more must come in from the client first',
    );
  });

  it('pays commission only after the wedding has flown', () => {
    expect(payoutBlocker(pos, 10_000_00, { partner: true, flown: false })).toBe(
      'Commission is earned only after the client has paid and the wedding has flown',
    );
    expect(payoutBlocker(pos, 10_000_00, { partner: true, flown: true })).toBeNull();
  });
});

describe('rule 2: confirmation checklist', () => {
  it('lists what is missing with what to do', () => {
    const position = moneyPosition(10 * L, 10_000, [
      { direction: 'CLIENT_IN', amount: 4 * L, status: 'RECORDED' },
    ]);
    expect(confirmationChecklist({ hasAcceptedQuote: true, termsSigned: false, position })).toEqual(
      [
        { key: 'quote', label: 'Client accepted a quote', done: true, hint: null },
        {
          key: 'terms',
          label: 'Client terms signed',
          done: false,
          hint: 'Upload the signed client terms on the Docs tab',
        },
        {
          key: 'payment',
          label: 'Payment received (₹10,00,000 needed)',
          done: false,
          hint: '₹6,00,000 more to receive',
        },
      ],
    );
  });
});

describe('guests', () => {
  it('deletes ID files N days after the last flight', () => {
    expect(idDeletionDate('2026-12-14', 30)).toBe('2027-01-13');
  });

  it('reads names pasted from WhatsApp, with optional phone numbers', () => {
    expect(
      parseGuestLines(
        '1. Asha Mehta, +91 98100 00001\n- Rohan Mehta\n\n• Dadi ji 9810000002\nKabir\t+919810000003',
      ),
    ).toEqual([
      { name: 'Asha Mehta', phone: '+919810000001' },
      { name: 'Rohan Mehta', phone: null },
      { name: 'Dadi ji', phone: '9810000002' },
      { name: 'Kabir', phone: '+919810000003' },
    ]);
  });
});
