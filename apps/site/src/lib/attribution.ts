/**
 * Where a visitor came from (WEBSITE.md §5): UTM values and the Google Ads click id from the landing
 * URL, kept for the browser session so a form sent three pages later still carries them.
 */

export interface Attribution {
  page: string;
  leadSource: 'WEBSITE';
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  gclid?: string;
}

const PARAMS = {
  utm_source: 'utmSource',
  utm_medium: 'utmMedium',
  utm_campaign: 'utmCampaign',
  utm_term: 'utmTerm',
  utm_content: 'utmContent',
  gclid: 'gclid',
} as const;

export type Campaign = Partial<Record<(typeof PARAMS)[keyof typeof PARAMS], string>>;

const KEY = 'vaanika:campaign';

/** The campaign values present in a query string (trimmed, capped at 150 characters). */
export function campaignFromSearch(search: string): Campaign {
  const q = new URLSearchParams(search);
  const out: Campaign = {};
  for (const [param, field] of Object.entries(PARAMS)) {
    const v = q.get(param)?.trim();
    if (v) out[field] = v.slice(0, 150);
  }
  return out;
}

/**
 * Keep the campaign for this session. A new landing with campaign values replaces the old one;
 * a plain page view keeps what was there.
 */
export function rememberCampaign(search: string, store: Pick<Storage, 'getItem' | 'setItem'>) {
  const now = campaignFromSearch(search);
  try {
    if (Object.keys(now).length) store.setItem(KEY, JSON.stringify(now));
  } catch {
    // Private mode or storage blocked: the current URL still counts below.
  }
  return readCampaign(store, now);
}

function readCampaign(store: Pick<Storage, 'getItem'>, fallback: Campaign = {}): Campaign {
  try {
    const raw = store.getItem(KEY);
    return raw ? (JSON.parse(raw) as Campaign) : fallback;
  } catch {
    return fallback;
  }
}

/** The fields every form and tap sends with it. */
export function attribution(
  pathname: string,
  store: Pick<Storage, 'getItem'> | null,
  search = '',
): Attribution {
  const campaign = { ...(store ? readCampaign(store) : {}), ...campaignFromSearch(search) };
  return { page: pathname.slice(0, 300), leadSource: 'WEBSITE', ...campaign };
}
