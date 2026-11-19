/**
 * CSV import formats (BRIEF.md §5.3). The template files, the API's column matching and the desk's
 * import screen all come from these definitions, so they can never drift apart.
 */

export type ImportKind = 'partners' | 'operators';

export interface ImportColumn {
  key: string;
  label: string;
  required: boolean;
  /** Other header names people commonly use for this column (compared ignoring case, spaces and punctuation). */
  aliases: string[];
  help: string;
}

export const IMPORT_COLUMNS: Record<ImportKind, ImportColumn[]> = {
  partners: [
    {
      key: 'type',
      label: 'Type',
      required: true,
      aliases: ['category', 'kind', 'partner type'],
      help: 'planner, hotel or other',
    },
    {
      key: 'firm',
      label: 'Firm',
      required: true,
      aliases: ['firm name', 'company', 'business', 'name', 'planner', 'hotel'],
      help: 'Firm or hotel name',
    },
    { key: 'city', label: 'City', required: false, aliases: ['location', 'town'], help: '' },
    {
      key: 'contact_person',
      label: 'Contact person',
      required: false,
      aliases: ['contact', 'contact name', 'person', 'owner'],
      help: '',
    },
    {
      key: 'phone',
      label: 'Phone',
      required: false,
      aliases: ['mobile', 'whatsapp', 'phone number', 'contact number', 'mobile number'],
      help: '10-digit mobile or +country code',
    },
    {
      key: 'email',
      label: 'Email',
      required: false,
      aliases: ['e-mail', 'mail', 'email address'],
      help: '',
    },
    {
      key: 'website',
      label: 'Website',
      required: false,
      aliases: ['site', 'url', 'web'],
      help: '',
    },
    {
      key: 'instagram',
      label: 'Instagram',
      required: false,
      aliases: ['insta', 'ig', 'instagram handle'],
      help: '@handle or profile link',
    },
    {
      key: 'source_link',
      label: 'Source link',
      required: false,
      aliases: ['source', 'found at', 'link', 'reference'],
      help: 'Where you found them',
    },
    {
      key: 'fit_note',
      label: 'Fit note',
      required: false,
      aliases: ['fit', 'notes', 'why', 'note'],
      help: 'Why they fit',
    },
  ],
  operators: [
    {
      key: 'legal_name',
      label: 'Legal name',
      required: true,
      aliases: ['company', 'operator', 'name', 'operator name', 'company name'],
      help: 'As on the NSOP permit',
    },
    {
      key: 'brand',
      label: 'Brand',
      required: false,
      aliases: ['trading name', 'brand name'],
      help: '',
    },
    {
      key: 'nsop_no',
      label: 'NSOP no.',
      required: false,
      aliases: ['nsop', 'nsop number', 'permit', 'permit no', 'permit number', 'nsop permit'],
      help: '',
    },
    {
      key: 'bases',
      label: 'Bases',
      required: false,
      aliases: ['base', 'airports', 'home base', 'home bases'],
      help: 'Airport codes separated by ;  e.g. DEL;UDR',
    },
    {
      key: 'aircraft',
      label: 'Aircraft',
      required: false,
      aliases: ['fleet', 'planes', 'jets'],
      help: 'type|registration|category|seats, several separated by ;',
    },
    {
      key: 'contacts',
      label: 'Contacts',
      required: false,
      aliases: ['contact', 'people'],
      help: 'name|phone|email, several separated by ;',
    },
    {
      key: 'website',
      label: 'Website',
      required: false,
      aliases: ['site', 'url', 'web'],
      help: '',
    },
    {
      key: 'safety_disclosure_url',
      label: 'Safety disclosure URL',
      required: false,
      aliases: ['safety', 'safety disclosure', 'safety url', 'safety page', 'dgca disclosure'],
      help: 'Their DGCA safety disclosure page',
    },
    {
      key: 'source_link',
      label: 'Source link',
      required: false,
      aliases: ['source', 'found at', 'link', 'reference'],
      help: 'Where you found them',
    },
  ],
};

/** One fake example row per template (fake names, reserved .test domains, impossible registrations). */
export const TEMPLATE_EXAMPLES: Record<ImportKind, Record<string, string>> = {
  partners: {
    type: 'planner',
    firm: 'Planner P9 Weddings',
    city: 'Jaipur',
    contact_person: 'Contact P9',
    phone: '+91 90000 00099',
    email: 'hello@planner-p9.example.test',
    website: 'https://planner-p9.example.test',
    instagram: '@planner_p9',
    source_link: 'https://directory.example.test/planner-p9',
    fit_note: 'Plans 20+ Udaipur weddings a season',
  },
  operators: {
    legal_name: 'Operator Z Aviation Pvt Ltd',
    brand: 'Operator Z',
    nsop_no: 'TEST-NSOP-099',
    bases: 'DEL;UDR',
    aircraft: 'Citation XLS|VT-ZZ9|midsize|8;King Air B200||turboprop|7',
    contacts: 'Ops Desk Z|+91 90000 00199|ops@operator-z.example.test',
    website: 'https://operator-z.example.test',
    safety_disclosure_url: 'https://operator-z.example.test/safety',
    source_link: 'https://directory.example.test/operator-z',
  },
};

/** Quote a CSV cell when needed. */
export function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/** The downloadable template: exact header row plus one fake example row. */
export function templateCsv(kind: ImportKind): string {
  const cols = IMPORT_COLUMNS[kind];
  const header = cols.map((c) => c.key).join(',');
  const example = cols.map((c) => csvCell(TEMPLATE_EXAMPLES[kind][c.key] ?? '')).join(',');
  return `${header}\r\n${example}\r\n`;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Guess which file column holds each field: exact template header first, then common alternatives.
 * Returns field key → column index (or null when not found). A column is used at most once.
 */
export function suggestMapping(
  kind: ImportKind,
  headers: readonly string[],
): Record<string, number | null> {
  const normalized = headers.map(norm);
  const used = new Set<number>();
  const out: Record<string, number | null> = {};
  const columns = IMPORT_COLUMNS[kind];
  // Two passes so an exact header wins over another field's alias ("contact" vs "contact_person").
  for (const pass of ['exact', 'alias'] as const) {
    for (const col of columns) {
      if (out[col.key] !== undefined && out[col.key] !== null) continue;
      const names = pass === 'exact' ? [col.key, col.label] : col.aliases;
      const idx = normalized.findIndex((h, i) => !used.has(i) && names.some((n) => norm(n) === h));
      out[col.key] = idx >= 0 ? idx : null;
      if (idx >= 0) used.add(idx);
    }
  }
  return out;
}

/**
 * "super-midsize", "Super Midsize", "SUPER_MIDSIZE" → SUPER_MIDSIZE; "helicopter" / "single-engine
 * helicopter" → HELICOPTER_SINGLE; "twin helicopter" → HELICOPTER_TWIN. Null when unknown.
 */
export function parseCategory(
  input: string,
):
  | 'TURBOPROP'
  | 'LIGHT'
  | 'MIDSIZE'
  | 'SUPER_MIDSIZE'
  | 'HEAVY'
  | 'HELICOPTER_SINGLE'
  | 'HELICOPTER_TWIN'
  | null {
  const n = norm(input);
  if (!n) return null;
  if (n.includes('heli') || n.includes('chopper'))
    return n.includes('twin') ? 'HELICOPTER_TWIN' : 'HELICOPTER_SINGLE';
  if (n.startsWith('turbo')) return 'TURBOPROP';
  if (n.startsWith('light') || n === 'vlj') return 'LIGHT';
  if (n.startsWith('super')) return 'SUPER_MIDSIZE';
  if (n.startsWith('mid')) return 'MIDSIZE';
  if (n.startsWith('heavy') || n.startsWith('large')) return 'HEAVY';
  return null;
}

/** "planner" / "Wedding planner" / "hotel" → PLANNER / HOTEL / OTHER. Null when unknown. */
export function parsePartnerType(input: string): 'PLANNER' | 'HOTEL' | 'OTHER' | null {
  const n = norm(input);
  if (!n) return null;
  if (n.includes('hotel') || n.includes('resort') || n.includes('palace')) return 'HOTEL';
  if (n.includes('plan')) return 'PLANNER';
  if (n === 'other') return 'OTHER';
  return null;
}

export type ImportAction = 'add' | 'merge' | 'skip';
