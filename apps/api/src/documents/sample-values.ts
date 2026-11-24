import { DEFAULT_BRAND } from '@shubhjets/shared';
import type { AgreementKind } from '@shubhjets/shared';
import { itineraryTable, paymentTable, scheduleTable } from './blocks.js';
import type { PlaceholderValues } from './markdown.js';

const L = 1_00_000_00;

/** Clearly fake values for previewing a template before using it. */
export function sampleValues(kind: AgreementKind): PlaceholderValues {
  const us = {
    date: '18 November 2026',
    place: 'New Delhi',
    'us.brand': DEFAULT_BRAND,
    'us.legal_name': 'Sample Exim LLP',
    'us.llpin': 'AAA-0000',
    'us.gstin': '07AAAAA0000A1Z5',
    'us.address': '12 Sample Road, New Delhi 110001',
    'us.signatory_name': 'Sample Signatory',
    'us.signatory_designation': 'Designated Partner',
    'us.arbitration_city': 'New Delhi',
  };
  const schedule = [
    { minDays: 30, chargeBps: 1000 },
    { minDays: 7, chargeBps: 5000 },
    { minDays: 0, chargeBps: 10000 },
  ];
  if (kind === 'OPERATOR_AGREEMENT')
    return {
      text: {
        ...us,
        'operator.legal_name': 'Sample Aviation Pvt Ltd',
        'operator.brand': 'Sample Air',
        'operator.cin': 'U00000DL2020PTC000000',
        'operator.gstin': '07BBBBB0000B1Z5',
        'operator.address': '1 Sample Hangar, New Delhi 110037',
        'operator.nsop_no': 'SAMPLE-NSOP-01',
        'operator.nsop_valid_until': '31 March 2028',
      },
      blocks: { 'operator.cancellation_table': scheduleTable(schedule) },
    };
  if (kind === 'REFERRAL_AGREEMENT')
    return {
      text: {
        ...us,
        'partner.firm': 'Sample Weddings',
        'partner.contact_person': 'Sample Planner',
        'partner.address': '5 Sample Lane',
        'partner.city': 'Jaipur',
        'partner.gstin': '08CCCCC0000C1Z5',
        'partner.commission': '20% (twenty per cent) of the Margin on each Booking',
      },
      blocks: {},
    };
  return {
    text: {
      ...us,
      'client.name': 'Sample Family',
      'client.address': '9 Sample Road, Mumbai 400001',
      'client.gstin': '27DDDDD0000D1Z5',
      'client.phone': '+91 90000 00000',
      'client.email': 'family@example.test',
      'wedding.code': 'W-000',
      'wedding.city': 'Udaipur',
      'wedding.dates': '12–14 December 2026',
      'quote.reference': 'W-000 · Q1',
      'quote.date': '18 November 2026',
      'quote.total': '₹12,33,100',
      'quote.total_words': 'Rupees Twelve Lakh Thirty-Three Thousand One Hundred Only',
      'quote.cancellation_note': 'Date changes are subject to aircraft availability.',
      'quote.inclusions': 'Fuel, crew, airport charges, catering for guests',
      'quote.exclusions': 'Crew overnight stay beyond two nights',
    },
    blocks: {
      'quote.itinerary': itineraryTable({
        legs: [
          {
            seq: 1,
            from: { iata: 'BOM', city: 'Mumbai', name: 'Mumbai' },
            to: { iata: 'UDR', city: 'Udaipur', name: 'Udaipur' },
            date: '2026-12-12',
            windowFrom: '09:00',
            windowTo: '12:00',
            pax: 8,
            lines: [
              {
                aircraft: 'Sample Jet',
                seats: 8,
                operator: 'Sample Air',
                operatorPermit: 'SAMPLE-NSOP-01',
                price: 5.225 * L,
              },
            ],
            price: 5.225 * L,
          },
        ],
        extras: [],
      }),
      'quote.payment_schedule': paymentTable([
        { bps: 10_000, amount: 12.331 * L, label: 'Full payment to confirm the booking' },
      ]),
      'quote.cancellation_table': scheduleTable(schedule),
    },
  };
}
