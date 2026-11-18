import { describe, expect, it } from 'vitest';
import {
  buildTodayActions,
  monthRange,
  monthTracker,
  snoozeUntil,
  type TodayFacts,
  type TodayRules,
} from '../src/today.js';

const NOW = new Date('2026-11-18T04:30:00Z'); // 10:00 am IST
const H = 3_600_000;
const rules: TodayRules = {
  now: NOW,
  today: '2026-11-18',
  brand: 'ShubhJets',
  chaseAfterHours: 2,
  quoteWarnHours: 6,
  guestIdsDueDays: 7,
};
const empty: TodayFacts = {
  enquiries: [],
  rateWaits: [],
  quoteNeeded: [],
  quotes: [],
  confirmations: [],
  guestIds: [],
  flown: [],
  payouts: [],
  commissions: [],
  followUps: [],
  expiries: [],
  profile: null,
};
const ago = (h: number) => new Date(NOW.getTime() - h * H);
const later = (h: number) => new Date(NOW.getTime() + h * H);
const asha = { name: 'Asha Mehra', phone: '+919810000001' };

describe('Today: Do now', () => {
  it('puts the most urgent things first, each with one button', () => {
    const actions = buildTodayActions(
      {
        ...empty,
        followUps: [
          {
            partnerId: 'p3',
            firm: 'Planner P3',
            contact: { name: 'Riya', phone: '+919000000003' },
            due: '2026-11-16',
            status: 'CONTACTED',
          },
        ],
        enquiries: [
          {
            weddingId: 'w7',
            code: 'W-107',
            city: 'Jaipur',
            contact: asha,
            fromWebsite: true,
            createdAt: ago(0.5),
            legs: 2,
            rateRequests: 0,
          },
          {
            weddingId: 'w8',
            code: 'W-108',
            city: 'Udaipur',
            contact: asha,
            fromWebsite: false,
            createdAt: ago(30),
            legs: 0,
            rateRequests: 0,
          },
        ],
        rateWaits: [
          {
            weddingId: 'w2',
            code: 'W-102',
            city: 'Jaipur',
            operatorId: 'oc',
            operator: 'Operator C',
            contact: { name: 'Ops desk', phone: '+919000000010' },
            sentAt: ago(3),
            repliesIn: 2,
            asked: 4,
          },
          {
            weddingId: 'w2',
            code: 'W-102',
            city: 'Jaipur',
            operatorId: 'od',
            operator: 'Operator D',
            contact: { name: null, phone: null },
            sentAt: ago(1),
            repliesIn: 2,
            asked: 4,
          },
        ],
        quotes: [
          {
            weddingId: 'w5',
            code: 'W-105',
            city: 'Goa',
            quoteId: 'q5',
            label: 'W-105 · Q1',
            status: 'SHARED',
            validUntil: later(3),
            contact: asha,
            linkAcceptances: [],
          },
          {
            weddingId: 'w6',
            code: 'W-106',
            city: 'Jodhpur',
            quoteId: 'q6',
            label: 'W-106 · Q2',
            status: 'SHARED',
            validUntil: later(20),
            contact: asha,
            linkAcceptances: [{ name: 'Asha Mehra', at: ago(1) }],
          },
        ],
        expiries: [
          {
            operatorId: 'oc',
            operator: 'Operator C',
            kind: 'INSURANCE',
            expiresOn: '2026-11-27',
            contact: { name: null, phone: null },
          },
        ],
        profile: { id: 'bp', warnings: ['Add your GSTIN'] },
      },
      rules,
    );
    expect(actions.map((a) => [a.urgency, a.title])).toEqual([
      ['NOW', 'W-106: Asha Mehra accepted the quote on the link'],
      ['NOW', 'W-107: new website enquiry from Asha Mehra'],
      ['NOW', 'W-105: quote expires in 3 h'],
      // Operator D was asked 1 h ago: not chased yet (after 2 h).
      ['NOW', 'W-102: 2 of 4 rates in, chase Operator C'],
      ['TODAY', 'Call Riya (Planner P3): follow-up 2 days late'],
      ['TODAY', 'W-108: add the flights'],
      ['SOON', 'Operator C: insurance expires in 9 days'],
      ['SOON', 'Finish your business profile'],
    ]);
    const chase = actions.find((a) => a.kind === 'CHASE_OPERATOR')!;
    expect(chase.button).toMatchObject({ type: 'LINK', label: 'WhatsApp Operator C' });
    const text = decodeURIComponent((chase.button as { href: string }).href.split('text=')[1]!);
    expect(text).toContain('rate request for W-102 (Jaipur wedding)');
    expect(text).not.toContain('Asha'); // operators never see the client
    expect(actions.find((a) => a.kind === 'FOLLOW_UP')!.button).toEqual({
      type: 'LINK',
      label: 'Call',
      href: 'tel:+919000000003',
    });
    // No WhatsApp number: the button opens the record instead.
    expect(actions.find((a) => a.kind === 'OPERATOR_EXPIRY')!.button).toEqual({
      type: 'OPEN',
      label: 'Open operator',
      to: '/operators/oc',
    });
    expect(new Set(actions.map((a) => a.key)).size).toBe(actions.length);
  });

  it('walks a booking from quote to flown', () => {
    const actions = buildTodayActions(
      {
        ...empty,
        quoteNeeded: [
          {
            weddingId: 'w2',
            code: 'W-102',
            legs: 2,
            legsWithRates: 2,
            legsChosen: 1,
            hasDraft: false,
          },
          {
            weddingId: 'w9',
            code: 'W-109',
            legs: 2,
            legsWithRates: 1,
            legsChosen: 0,
            hasDraft: false,
          },
        ],
        quotes: [
          {
            weddingId: 'w3',
            code: 'W-103',
            city: null,
            quoteId: 'q3',
            label: 'W-103 · Q1',
            status: 'ISSUED',
            validUntil: later(23),
            contact: asha,
            linkAcceptances: [],
          },
          {
            weddingId: 'w4',
            code: 'W-104',
            city: null,
            quoteId: 'q4',
            label: 'W-104 · Q1',
            status: 'SHARED',
            validUntil: ago(30),
            contact: asha,
            linkAcceptances: [],
          },
          {
            weddingId: 'wx',
            code: 'W-110',
            city: null,
            quoteId: 'qx',
            label: 'W-110 · Q1',
            status: 'EXPIRED',
            validUntil: ago(24 * 5),
            contact: asha,
            linkAcceptances: [],
          },
        ],
        confirmations: [
          {
            weddingId: 'w5',
            code: 'W-105',
            contact: asha,
            dueToConfirm: 12_00_000_00,
            firstFlight: '2026-11-22',
            checklist: [
              { key: 'quote', label: 'Client accepted a quote', done: true, hint: null },
              {
                key: 'terms',
                label: 'Client terms signed',
                done: false,
                hint: 'Upload the signed client terms on the Docs tab',
              },
              {
                key: 'payment',
                label: 'Payment received',
                done: false,
                hint: '₹12,00,000 more to receive',
              },
            ],
          },
          {
            weddingId: 'w6',
            code: 'W-106',
            contact: asha,
            dueToConfirm: 0,
            firstFlight: '2026-12-20',
            checklist: [
              { key: 'quote', label: 'Client accepted a quote', done: true, hint: null },
              { key: 'terms', label: 'Client terms signed', done: true, hint: null },
              { key: 'payment', label: 'Payment received', done: true, hint: null },
            ],
          },
        ],
        guestIds: [
          { weddingId: 'w7', code: 'W-107', contact: asha, firstFlight: '2026-11-23', missing: 6 },
          { weddingId: 'w8', code: 'W-108', contact: asha, firstFlight: '2026-12-23', missing: 9 },
        ],
        flown: [
          {
            weddingId: 'w1',
            code: 'W-101',
            legId: 'l1',
            seq: 2,
            route: 'UDR → DEL',
            flightDate: '2026-11-17',
          },
          {
            weddingId: 'w1',
            code: 'W-101',
            legId: 'l2',
            seq: 3,
            route: 'DEL → UDR',
            flightDate: '2026-11-18',
          },
        ],
        payouts: [
          {
            weddingId: 'w5',
            code: 'W-105',
            paymentId: 'pay1',
            operator: 'Operator A',
            amount: 8_50_000_00,
            firstFlight: '2026-11-20',
          },
        ],
        commissions: [
          { weddingId: 'w1', code: 'W-101', partner: 'Planner P1', remaining: 45_000_00 },
        ],
      },
      rules,
    );
    expect(actions.map((a) => [a.urgency, a.kind, a.title])).toEqual([
      ['NOW', 'MARK_FLOWN', 'W-101: did leg 2 fly?'],
      ['NOW', 'CONFIRM', 'W-106 is ready to confirm'],
      ['NOW', 'PAYMENT_DUE', 'W-105: ₹12.0L to receive before confirming'],
      ['NOW', 'CONFIRM_STEP', 'W-105: get the client terms signed'],
      ['NOW', 'PAY_OPERATOR', 'W-105: pay Operator A ₹8.5L'],
      ['TODAY', 'GUEST_IDS', 'W-107 flies in 5 days: 6 guest IDs missing'],
      ['TODAY', 'SHARE_QUOTE', 'W-103: quote W-103 · Q1 is ready, share it'],
      ['TODAY', 'BUILD_QUOTE', 'W-102: rates in for every leg, choose and quote'],
      ['TODAY', 'QUOTE_EXPIRED', 'W-104: quote W-104 · Q1 has expired'],
      ['SOON', 'COMMISSION', 'W-101: pay Planner P1 commission ₹45,000'],
    ]);
    expect(actions[0]!.button).toEqual({ type: 'MARK_FLOWN', label: 'Mark flown', legId: 'l1' });
    const ids = actions.find((a) => a.kind === 'GUEST_IDS')!;
    expect(decodeURIComponent((ids.button as { href: string }).href)).toContain(
      'For the flights on 23 Nov 2026 we still need ID copies for 6 guests',
    );
  });

  it('asks for rates once an enquiry has its flights', () => {
    const [a] = buildTodayActions(
      {
        ...empty,
        enquiries: [
          // A website enquiry two days old is no longer "new": it needs rates.
          {
            weddingId: 'w1',
            code: 'W-101',
            city: 'Udaipur',
            contact: asha,
            fromWebsite: true,
            createdAt: ago(50),
            legs: 2,
            rateRequests: 0,
          },
          {
            weddingId: 'w2',
            code: 'W-102',
            city: 'Jaipur',
            contact: asha,
            fromWebsite: false,
            createdAt: ago(5),
            legs: 2,
            rateRequests: 3,
          },
        ],
      },
      rules,
    ).map((x) => x);
    expect(a).toMatchObject({
      kind: 'ASK_RATES',
      title: 'W-101: ask operators for rates',
      button: { to: '/weddings/w1?tab=rates' },
    });
  });
});

describe('Today: month tracker', () => {
  it('compares the month with the target and projects the month end', () => {
    expect(monthTracker('2026-11-18', 9_00_000_00, 20_00_000_00)).toEqual({
      label: 'Nov 2026',
      margin: 9_00_000_00,
      target: 20_00_000_00,
      percent: 45,
      daysLeft: 12,
      projected: 15_00_000_00,
      toGo: 11_00_000_00,
    });
    expect(monthTracker('2026-11-30', 25_00_000_00, 20_00_000_00)).toMatchObject({
      percent: 125,
      toGo: 0,
      daysLeft: 0,
    });
    expect(monthRange('2027-02-10')).toEqual({ from: '2027-02-01', to: '2027-02-28' });
  });

  it('snoozes until 7 am IST tomorrow', () => {
    expect(snoozeUntil('2026-11-18').toISOString()).toBe('2026-11-19T01:30:00.000Z');
  });
});
