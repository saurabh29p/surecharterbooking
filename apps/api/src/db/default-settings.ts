import { DEFAULT_SETTINGS } from './migrations/1763400000001-ReferenceData.js';
import { PARTNER_SETTINGS } from './migrations/1763400000003-PartnersConsent.js';
import { QUOTE_SETTINGS } from './migrations/1763400000005-QuoteBuilder.js';

/** Every default setting shipped by migrations, for the seed and the test reset. */
export const ALL_DEFAULT_SETTINGS = [...DEFAULT_SETTINGS, ...PARTNER_SETTINGS, ...QUOTE_SETTINGS];
