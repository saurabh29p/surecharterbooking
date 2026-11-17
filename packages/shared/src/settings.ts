/**
 * Every editable setting: label, kind, limits and group. The API validates with these and the
 * desk builds its forms from them, so both always agree. Tax values are never hard-coded:
 * GST rate and SAC code stay "unconfirmed" (warning banner) until confirmed after the CA checks them.
 */
import type { CommissionBasis, InvoicingModel } from './pricing.js';

export type SettingGroup = 'pricing' | 'tax' | 'targets' | 'today' | 'privacy' | 'ai';
export type SettingKind = 'percent' | 'money' | 'int' | 'text' | 'enum' | 'commission';

export interface SettingDef {
  key: string;
  group: SettingGroup;
  label: string;
  help?: string;
  kind: SettingKind;
  /** For percent: basis points. For money: paise. For int: the unit below. */
  min?: number;
  max?: number;
  unit?: 'hours' | 'days';
  maxLength?: number;
  pattern?: { regex: RegExp; message: string };
  options?: ReadonlyArray<{ value: string; label: string }>;
  multiline?: boolean;
}

export const SETTING_GROUPS: ReadonlyArray<{ key: SettingGroup; title: string; intro: string }> = [
  {
    key: 'pricing',
    title: 'Pricing and payments',
    intro: 'Defaults for new quotes. Each quote can still be changed.',
  },
  {
    key: 'tax',
    title: 'GST and invoicing',
    intro: 'Set by your CA. Nothing about tax is fixed in the app.',
  },
  { key: 'targets', title: 'Targets', intro: 'Shown in the season tracker on Today.' },
  { key: 'today', title: 'Today reminders', intro: 'When the Today screen tells you to act.' },
  {
    key: 'privacy',
    title: 'Privacy and sharing',
    intro: 'How long personal documents and share links last.',
  },
  { key: 'ai', title: 'AI', intro: 'AI arrives in Phase B; the monthly cap is ready now.' },
];

export const INVOICING_MODEL_LABELS: Record<InvoicingModel, string> = {
  FULL_VALUE: 'Full value: GST on the whole charter price',
  FEE_ONLY: 'Fee only: GST on our margin; operator cost passed through',
};

export const COMMISSION_BASIS_LABELS: Record<CommissionBasis, string> = {
  MARGIN_SHARE: 'Share of my margin',
  BOOKING_PERCENT: 'Percent of booking value',
};

export const SETTING_DEFS: readonly SettingDef[] = [
  {
    key: 'markup.default_bps',
    group: 'pricing',
    label: 'Default markup',
    kind: 'percent',
    min: 0,
    max: 10_000,
    help: 'Added to the operator net rate on each leg.',
  },
  {
    key: 'commission.default',
    group: 'pricing',
    label: 'Default partner commission',
    kind: 'commission',
    help: 'New partners start with this; each partner can differ.',
  },
  {
    key: 'quote.validity_hours',
    group: 'pricing',
    label: 'Quote validity',
    kind: 'int',
    unit: 'hours',
    min: 1,
    max: 720,
  },
  {
    key: 'payment.required_bps',
    group: 'pricing',
    label: 'Payment needed before confirming',
    kind: 'percent',
    min: 0,
    max: 10_000,
    help: 'Share of the quote total the client must pay before a wedding is confirmed. Each wedding can differ.',
  },
  {
    key: 'quote.cancellation_terms',
    group: 'pricing',
    label: 'Default cancellation terms',
    kind: 'text',
    multiline: true,
    maxLength: 2000,
    help: 'Printed on quotes. They must never be looser than the operator’s terms.',
  },
  { key: 'gst.rate_bps', group: 'tax', label: 'GST rate', kind: 'percent', min: 0, max: 4000 },
  {
    key: 'gst.sac',
    group: 'tax',
    label: 'SAC code',
    kind: 'text',
    maxLength: 6,
    pattern: { regex: /^([0-9]{6})?$/, message: 'A SAC code has 6 digits' },
  },
  {
    key: 'invoicing.model',
    group: 'tax',
    label: 'Invoicing model',
    kind: 'enum',
    options: Object.entries(INVOICING_MODEL_LABELS).map(([value, label]) => ({ value, label })),
  },
  {
    key: 'target.monthly_margin_paise',
    group: 'targets',
    label: 'Monthly margin target',
    kind: 'money',
    min: 0,
    max: 1_00_00_00_000_00,
  },
  {
    key: 'today.chase_operator_hours',
    group: 'today',
    label: 'Chase an operator after',
    kind: 'int',
    unit: 'hours',
    min: 1,
    max: 72,
    help: 'With no reply to a rate request.',
  },
  {
    key: 'today.quote_expiry_warn_hours',
    group: 'today',
    label: 'Warn before a quote expires',
    kind: 'int',
    unit: 'hours',
    min: 1,
    max: 48,
  },
  {
    key: 'today.guest_ids_due_days',
    group: 'today',
    label: 'Guest IDs due before the flight',
    kind: 'int',
    unit: 'days',
    min: 1,
    max: 30,
  },
  {
    key: 'guest_id.retention_days',
    group: 'privacy',
    label: 'Delete guest ID files after the wedding',
    kind: 'int',
    unit: 'days',
    min: 1,
    max: 365,
  },
  {
    key: 'share.link_expiry_days',
    group: 'privacy',
    label: 'Secure links expire after',
    kind: 'int',
    unit: 'days',
    min: 1,
    max: 90,
  },
  {
    key: 'ai.monthly_cap_paise',
    group: 'ai',
    label: 'Monthly AI spending cap',
    kind: 'money',
    min: 0,
    max: 1_00_000_00,
    help: 'AI stops at 100% (warning at 80%); the rest of the app keeps working.',
  },
];

export const GST_KEYS = ['gst.rate_bps', 'gst.sac'] as const;

export function settingDef(key: string): SettingDef | undefined {
  return SETTING_DEFS.find((d) => d.key === key);
}

export interface CommissionDefault {
  basis: CommissionBasis;
  bps: number;
}

/** Returns a plain-language problem, or null when `value` is valid for this setting. */
export function validateSetting(def: SettingDef, value: unknown): string | null {
  const range = (n: number, fmt: (x: number) => string) =>
    def.min !== undefined && n < def.min
      ? `Must be at least ${fmt(def.min)}`
      : def.max !== undefined && n > def.max
        ? `Must be at most ${fmt(def.max)}`
        : null;
  switch (def.kind) {
    case 'percent':
      if (!Number.isSafeInteger(value)) return 'Enter a percentage, e.g. 10 or 12.5';
      return range(value as number, (x) => `${x / 100}%`);
    case 'money':
      if (!Number.isSafeInteger(value) || (value as number) < 0) return 'Enter an amount in rupees';
      return range(value as number, (x) => `₹${(x / 100).toLocaleString('en-IN')}`);
    case 'int':
      if (!Number.isSafeInteger(value)) return `Enter a whole number of ${def.unit ?? 'units'}`;
      return range(value as number, (x) => `${x} ${def.unit ?? ''}`.trim());
    case 'text': {
      if (typeof value !== 'string') return 'Enter text';
      if (def.maxLength && value.length > def.maxLength)
        return `Use at most ${def.maxLength} characters`;
      if (def.pattern && !def.pattern.regex.test(value.trim())) return def.pattern.message;
      return null;
    }
    case 'enum':
      return def.options?.some((o) => o.value === value) ? null : 'Choose one of the options';
    case 'commission': {
      const v = value as Partial<CommissionDefault> | null;
      if (!v || typeof v !== 'object') return 'Choose a commission basis and percentage';
      if (v.basis !== 'MARGIN_SHARE' && v.basis !== 'BOOKING_PERCENT')
        return 'Choose a commission basis';
      if (!Number.isSafeInteger(v.bps) || (v.bps as number) < 0 || (v.bps as number) > 10_000)
        return 'Enter a percentage between 0 and 100';
      return null;
    }
  }
}

export interface SettingEntry {
  key: string;
  value: unknown;
  confirmed: boolean;
}

/** Banner messages shown across the app until fixed. */
export function settingsWarnings(entries: readonly SettingEntry[]): string[] {
  const get = (k: string) => entries.find((e) => e.key === k);
  const warnings: string[] = [];
  if (GST_KEYS.some((k) => get(k)?.confirmed === false)) {
    warnings.push(
      'GST rate and SAC code are placeholders until your CA confirms them. Quotes and invoices show a warning until then.',
    );
  }
  const terms = get('quote.cancellation_terms');
  if (terms && (typeof terms.value !== 'string' || terms.value.trim() === '')) {
    warnings.push('Default cancellation terms are empty. Add them before sending quotes.');
  }
  return warnings;
}
