import { describe, expect, it } from 'vitest';
import {
  numberInWordsIndian,
  placeholdersIn,
  rupeesInWords,
  templateProblems,
} from '../src/documents.js';

const body = (s: string) =>
  `# Agreement\n\nThis agreement is made at {{place}} on {{date}}.\n\n${s}\n`;

describe('agreement templates', () => {
  it('lists the placeholders a template uses', () => {
    expect(placeholdersIn('{{date}} {{ us.legal_name }} {{date}}')).toEqual([
      'date',
      'us.legal_name',
    ]);
  });

  it('accepts a good template', () => {
    expect(
      templateProblems(
        'OPERATOR_AGREEMENT',
        body('{{operator.legal_name}}\n\n{{operator.cancellation_table}}'),
      ),
    ).toEqual([]);
  });

  it('explains unknown placeholders, misplaced tables and scripts in plain words', () => {
    expect(
      templateProblems('REFERRAL_AGREEMENT', body('{{operator.nsop_no}} {{partner.fees}}')),
    ).toEqual(['Unknown placeholders: {{operator.nsop_no}}, {{partner.fees}}']);
    expect(templateProblems('CLIENT_TERMS', body('Flights: {{quote.itinerary}}'))).toEqual([
      '{{quote.itinerary}} is a table: put it on a line of its own',
    ]);
    expect(templateProblems('CLIENT_TERMS', body('<script>alert(1)</script>'))).toEqual([
      'Templates cannot contain scripts',
    ]);
    expect(templateProblems('CLIENT_TERMS', 'short')).toEqual([
      'The template is empty or too short',
    ]);
  });
});

describe('amounts in words', () => {
  it('uses lakh and crore', () => {
    expect(numberInWordsIndian(12_79_710)).toBe(
      'Twelve Lakh Seventy-Nine Thousand Seven Hundred Ten',
    );
    expect(numberInWordsIndian(1_00_00_000)).toBe('One Crore');
    expect(numberInWordsIndian(123_45_67_890)).toBe(
      'One Hundred Twenty-Three Crore Forty-Five Lakh Sixty-Seven Thousand Eight Hundred Ninety',
    );
    expect(numberInWordsIndian(0)).toBe('Zero');
    expect(numberInWordsIndian(1015)).toBe('One Thousand Fifteen');
  });

  it('writes rupees and paise the way invoices do', () => {
    expect(rupeesInWords(12_79_710_00)).toBe(
      'Rupees Twelve Lakh Seventy-Nine Thousand Seven Hundred Ten Only',
    );
    expect(rupeesInWords(97_605_50)).toBe(
      'Rupees Ninety-Seven Thousand Six Hundred Five and Fifty Paise Only',
    );
    expect(() => rupeesInWords(-1)).toThrow();
  });
});
