import { describe, expect, it } from 'vitest';
import { attribution, campaignFromSearch, rememberCampaign } from '../src/lib/attribution';
import {
  enquiryBody,
  enquiryProblems,
  phoneOk,
  whatsappFallbackText,
  type EnquiryFormValues,
} from '../src/lib/enquiry';

const base: EnquiryFormValues = {
  name: '  Asha Mehra ',
  phone: '98100 00001',
  email: '',
  role: 'FAMILY',
  firm: 'ignored for families',
  weddingCity: 'Udaipur',
  weddingDate: '2026-12-10',
  guests: '14',
  guestsFrom: 'Delhi',
  message: '',
  consent: true,
  marketingConsent: false,
  companyWebsite: '',
};

function memoryStore() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
}

describe('enquiry form → API body', () => {
  it('matches the API fields, with the guest range as its top number and as words', () => {
    const body = enquiryBody(base, 41_234.6, { page: '/', leadSource: 'WEBSITE' });
    expect(body).toEqual({
      page: '/',
      leadSource: 'WEBSITE',
      name: 'Asha Mehra',
      phone: '98100 00001',
      email: null,
      role: 'FAMILY',
      firm: null,
      weddingCity: 'Udaipur',
      weddingDate: '2026-12-10',
      guests: 14,
      guestsFrom: 'Delhi',
      message: 'Guests flying: 7 to 14',
      consent: true,
      marketingConsent: false,
      companyWebsite: null,
      elapsedMs: 41_235,
    });
    expect(
      enquiryBody({ ...base, guests: '6' }, 0, { page: '/', leadSource: 'WEBSITE' }).message,
    ).toBe(null);
    const planner = enquiryBody(
      { ...base, role: 'PLANNER', firm: 'Planner P9', message: 'Two sides', guests: '51' },
      0,
      { page: '/', leadSource: 'WEBSITE' },
    );
    expect(planner).toMatchObject({
      firm: 'Planner P9',
      guests: 51,
      message: 'Two sides\nGuests flying: More than 50',
    });
  });

  it('checks fields with the API’s own rules and words', () => {
    expect(enquiryProblems(base)).toEqual({});
    expect(
      enquiryProblems({ ...base, name: 'A', phone: '12345', consent: false, email: 'x@' }),
    ).toEqual({
      name: 'Enter your name',
      phone: 'Enter a 10-digit mobile number, or + and the country code',
      email: 'Enter a valid email',
      consent: 'Please tick the box so we can contact you about your enquiry',
    });
    expect(enquiryProblems({ ...base, phone: ' ' }).phone).toBe('Enter your WhatsApp number');
    expect(enquiryProblems({ ...base, role: 'HOTEL', firm: '' }).firm).toBe(
      'Enter your firm or hotel name',
    );
    expect(
      ['+91 98100 00001', '098100 00001', '919810000001', '+44 20 7946 0958'].map(phoneOk),
    ).toEqual([true, true, true, true]);
    expect(['5810000001', '98100', ''].map(phoneOk)).toEqual([false, false, false]);
  });

  it('keeps what was typed for the WhatsApp fallback', () => {
    expect(whatsappFallbackText({ ...base, role: 'PLANNER', firm: 'Planner P9' })).toBe(
      [
        'Hello Vaanika, I’d like to plan wedding flights.'.replace('’', "'"),
        'Name: Asha Mehra',
        'I am a wedding planner (Planner P9)',
        'Venue or city: Udaipur',
        'Wedding date: 2026-12-10',
        'Guests flying: 7 to 14',
        'Flying from: Delhi',
      ].join('\n'),
    );
  });
});

describe('attribution', () => {
  it('reads UTM values and the Google Ads click id', () => {
    expect(campaignFromSearch('?utm_source=google&utm_medium=cpc&gclid=abc&x=1&utm_term=')).toEqual(
      {
        utmSource: 'google',
        utmMedium: 'cpc',
        gclid: 'abc',
      },
    );
  });

  it('keeps the landing campaign for the session, and a new campaign replaces it', () => {
    const store = memoryStore();
    rememberCampaign('?utm_source=instagram&utm_campaign=launch', store);
    rememberCampaign('', store); // a plain page view keeps it
    expect(attribution('/destinations/udaipur/', store)).toEqual({
      page: '/destinations/udaipur/',
      leadSource: 'WEBSITE',
      utmSource: 'instagram',
      utmCampaign: 'launch',
    });
    rememberCampaign('?utm_source=google&gclid=g1', store);
    expect(attribution('/', store)).toEqual({
      page: '/',
      leadSource: 'WEBSITE',
      utmSource: 'google',
      gclid: 'g1',
    });
    // No storage (private mode): the current URL still counts.
    expect(attribution('/', null, '?utm_source=x')).toEqual({
      page: '/',
      leadSource: 'WEBSITE',
      utmSource: 'x',
    });
  });
});

describe('planner sign-up → API body', () => {
  it('matches the partner endpoint and checks with its words', async () => {
    const { partnerBody, partnerProblems } = await import('../src/lib/partner');
    const v = {
      name: ' Riya ',
      firm: ' Planner P9 ',
      role: 'PLANNER' as const,
      city: 'Delhi',
      phone: '98765 43210',
      email: '',
      instagram: '@p9',
      weddingsPerYear: '12',
      message: '',
      consent: true,
      marketingConsent: false,
      companyWebsite: '',
    };
    expect(partnerProblems(v)).toEqual({});
    expect(partnerBody(v, 5000.4, { page: '/for-planners/', leadSource: 'WEBSITE' })).toEqual({
      page: '/for-planners/',
      leadSource: 'WEBSITE',
      name: 'Riya',
      firm: 'Planner P9',
      role: 'PLANNER',
      city: 'Delhi',
      phone: '98765 43210',
      email: null,
      instagram: '@p9',
      weddingsPerYear: 12,
      message: null,
      consent: true,
      marketingConsent: false,
      companyWebsite: null,
      elapsedMs: 5000,
    });
    expect(partnerProblems({ ...v, firm: '', weddingsPerYear: 'lots', consent: false })).toEqual({
      firm: 'Enter your firm or hotel name',
      weddingsPerYear: 'Enter a number, e.g. 12',
      consent: 'Please tick the box so we can contact you about your enquiry',
    });
  });
});
