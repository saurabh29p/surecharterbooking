import { describe, expect, it } from 'vitest';
import { cityToIata, parseGuestOrigins, websiteLeadSource } from '../src/enquiry.js';

describe('website enquiries', () => {
  it('matches the cities people write to airports, leaving ambiguous ones', () => {
    expect(cityToIata('New Delhi')).toBe('DEL');
    expect(cityToIata('Delhi NCR')).toBe('DEL');
    expect(cityToIata('gurugram')).toBe('DEL');
    expect(cityToIata('Bombay')).toBe('BOM');
    expect(cityToIata('Jim Corbett')).toBe('PGH');
    expect(cityToIata('Goa (Mopa)')).toBe('GOX');
    expect(cityToIata('Goa')).toBeNull();
    expect(cityToIata('udr')).toBe('UDR');
    expect(cityToIata('XYZ', ['DEL'])).toBeNull();
    expect(cityToIata('Paris')).toBeNull();
  });

  it('reads where guests fly from', () => {
    expect(parseGuestOrigins('18 from Delhi, 6 from Mumbai')).toEqual([
      { city: 'Delhi', guests: 18 },
      { city: 'Mumbai', guests: 6 },
    ]);
    expect(parseGuestOrigins('Delhi: 12; Jaipur 4 and Pune')).toEqual([
      { city: 'Delhi', guests: 12 },
      { city: 'Jaipur', guests: 4 },
      { city: 'Pune', guests: null },
    ]);
    expect(parseGuestOrigins('20 log Delhi se')).toEqual([{ city: 'Delhi', guests: 20 }]);
    expect(parseGuestOrigins('')).toEqual([]);
  });

  it('works out the lead source from UTM and Google Ads click ids', () => {
    expect(websiteLeadSource({})).toBe('WEBSITE');
    expect(websiteLeadSource({ gclid: 'abc' })).toBe('GOOGLE_ADS');
    expect(websiteLeadSource({ utmSource: 'google', utmMedium: 'cpc' })).toBe('GOOGLE_ADS');
    expect(websiteLeadSource({ utmSource: 'google', utmMedium: 'organic' })).toBe('WEBSITE');
    expect(websiteLeadSource({ utmSource: 'instagram', utmMedium: 'social' })).toBe('INSTAGRAM');
    expect(websiteLeadSource({ leadSource: 'instagram' })).toBe('INSTAGRAM');
    expect(websiteLeadSource({ leadSource: 'PARTNER' })).toBe('WEBSITE');
  });
});
