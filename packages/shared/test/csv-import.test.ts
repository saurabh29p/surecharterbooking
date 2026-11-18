import { describe, expect, it } from 'vitest';
import {
  IMPORT_COLUMNS,
  parseCategory,
  parsePartnerType,
  suggestMapping,
  templateCsv,
} from '../src/index.js';

describe('CSV templates', () => {
  it('have the exact headers and one fake example row', () => {
    const [header, example, end] = templateCsv('partners').split('\r\n');
    expect(header).toBe(
      'type,firm,city,contact_person,phone,email,website,instagram,source_link,fit_note',
    );
    expect(example).toContain('Planner P9 Weddings');
    expect(end).toBe('');
    const ops = templateCsv('operators').split('\r\n');
    expect(ops[0]).toBe(
      'legal_name,brand,nsop_no,bases,aircraft,contacts,website,safety_disclosure_url,source_link',
    );
    expect(ops[1]).toContain('TEST-NSOP-099');
    expect(ops[1]).toContain('VT-ZZ9');
  });
});

describe('column matching', () => {
  it('matches exact headers and common alternatives, each column once', () => {
    expect(
      suggestMapping('partners', ['Firm Name', 'Mobile', 'E-mail', 'Type', 'Contact', 'Insta']),
    ).toMatchObject({
      firm: 0,
      phone: 1,
      email: 2,
      type: 3,
      contact_person: 4,
      instagram: 5,
      city: null,
    });
    const ops = suggestMapping('operators', ['legal_name', 'NSOP Permit', 'Fleet', 'Home Base']);
    expect(ops).toMatchObject({ legal_name: 0, nsop_no: 1, aircraft: 2, bases: 3, brand: null });
  });

  it("prefers an exact header over another field's alias", () => {
    // "contacts" is the operators field; "contact" is only an alias of it.
    expect(suggestMapping('operators', ['name', 'contacts'])).toMatchObject({
      legal_name: 0,
      contacts: 1,
    });
    expect(IMPORT_COLUMNS.partners.filter((c) => c.required).map((c) => c.key)).toEqual([
      'type',
      'firm',
    ]);
  });
});

describe('value parsing', () => {
  it('reads aircraft categories and partner types written loosely', () => {
    expect(
      ['turboprop', 'Light jet', 'midsize', 'Super-midsize', 'SUPER_MIDSIZE', 'heavy', 'blimp'].map(
        parseCategory,
      ),
    ).toEqual(['TURBOPROP', 'LIGHT', 'MIDSIZE', 'SUPER_MIDSIZE', 'SUPER_MIDSIZE', 'HEAVY', null]);
    expect(
      ['planner', 'Wedding Planner', 'Hotel', 'Palace resort', 'other', 'dj'].map(parsePartnerType),
    ).toEqual(['PLANNER', 'PLANNER', 'HOTEL', 'HOTEL', 'OTHER', null]);
  });
});
