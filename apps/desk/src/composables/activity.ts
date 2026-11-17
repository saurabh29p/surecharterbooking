import { formatBps, formatINR, settingDef, stateName, type SettingDef } from '@shubhjets/shared';

export interface AuditItem {
  id: string;
  at: string;
  actorType: 'USER' | 'AI' | 'SYSTEM' | 'PUBLIC';
  actorLabel: string;
  entity: string;
  entityId: string;
  action: string;
  diff: Record<string, unknown> | null;
}

const ENTITY_LABELS: Record<string, string> = {
  business_profile: 'Business profile',
  setting: 'Setting',
  user: 'Account',
  operator: 'Operator',
  partner: 'Partner',
  wedding: 'Wedding',
  leg: 'Leg',
  payment: 'Payment',
  document: 'Document',
  share: 'Share',
};

const PROFILE_FIELDS: Record<string, string> = {
  label: 'Profile name',
  brandName: 'Brand name',
  legalName: 'Legal name',
  llpin: 'LLPIN',
  gstin: 'GSTIN',
  stateCode: 'State',
  registeredAddress: 'Registered address',
  bankDetailsEnc: 'Bank details',
  bankHint: 'Bank account',
  signatoryName: 'Signatory',
  signatoryDesignation: 'Designation',
  arbitrationSeatCity: 'Arbitration seat',
  invoicePrefix: 'Invoice prefix',
  isDefault: 'Default',
  archivedAt: 'Archived',
};

/** Plain-language one-liners for actions that aren't simple field changes. */
const ACTIONS: Record<string, string> = {
  LOGIN: 'Logged in',
  LOGIN_FAILED: 'Wrong password entered',
  LOGOUT: 'Logged out on a device',
  LOGOUT_ALL: 'Logged out on all devices',
  SESSION_REVOKED: 'Logged a device out',
  SESSION_REUSE_DETECTED: 'Ended a device session after an old login token was reused',
  PASSWORD_CHANGED: 'Changed the password',
  CREATED_FROM_ENV: 'Owner account created',
  DEMO_ACCOUNT_DISABLED: 'Disabled a demo account in production',
  BANK_DETAILS_VIEWED: 'Viewed the full bank details',
};

function settingValue(def: SettingDef | undefined, v: unknown): string {
  if (v === null || v === undefined || v === '') return 'empty';
  if (!def) return JSON.stringify(v);
  switch (def.kind) {
    case 'percent':
      return formatBps(v as number);
    case 'money':
      return formatINR(v as number, { paise: 'never' });
    case 'int':
      return `${v} ${def.unit ?? ''}`.trim();
    case 'commission': {
      const c = v as { basis: string; bps: number };
      return `${formatBps(c.bps)} ${c.basis === 'MARGIN_SHARE' ? 'of margin' : 'of booking value'}`;
    }
    case 'enum':
      return def.options?.find((o) => o.value === v)?.label.split(':')[0] ?? String(v);
    default: {
      const s = String(v);
      return s.length > 60 ? `${s.slice(0, 57)}…` : s;
    }
  }
}

function plain(key: string, v: unknown): string {
  if (v === null || v === undefined || v === '') return 'empty';
  if (v === true) return 'yes';
  if (v === false) return 'no';
  if (key === 'stateCode') return stateName(String(v)) ?? String(v);
  if (key === 'archivedAt') return 'yes';
  if (v === '[redacted]' || v === '[encrypted]') return 'hidden';
  const s = String(v);
  return s.length > 60 ? `${s.slice(0, 57)}…` : s;
}

export interface ActivityLine {
  title: string;
  changes: string[];
}

/** Turn an audit entry into a title and a list of "Field: before → after" lines. */
export function describe(item: AuditItem): ActivityLine {
  const what = ENTITY_LABELS[item.entity] ?? item.entity;
  if (ACTIONS[item.action]) return { title: ACTIONS[item.action]!, changes: [] };
  const diff = item.diff ?? {};
  if (item.entity === 'setting') {
    const def = settingDef(item.entityId);
    const label = def?.label ?? item.entityId;
    const changes: string[] = [];
    const value = diff.value as { from: unknown; to: unknown } | undefined;
    if (value) changes.push(`${settingValue(def, value.from)} → ${settingValue(def, value.to)}`);
    const confirmed = diff.confirmed as { to: boolean } | undefined;
    if (confirmed)
      changes.push(confirmed.to ? 'Marked as confirmed by the CA' : 'Marked as not confirmed');
    return { title: `${label} changed`, changes };
  }
  if (item.action === 'CREATED') {
    const name =
      (diff.label as string) ?? (diff.firm as string) ?? (diff.legalName as string) ?? '';
    return { title: `${what} created${name ? `: ${name}` : ''}`, changes: [] };
  }
  if (item.action === 'DELETED') return { title: `${what} deleted`, changes: [] };
  if (item.action === 'UPDATED') {
    const changes = Object.entries(diff).map(([k, d]) => {
      const { from, to } = d as { from: unknown; to: unknown };
      const label = (item.entity === 'business_profile' ? PROFILE_FIELDS[k] : undefined) ?? k;
      if (k === 'bankDetailsEnc') return `${label} ${to === null ? 'removed' : 'changed'}`;
      return `${label}: ${plain(k, from)} → ${plain(k, to)}`;
    });
    return { title: `${what} updated`, changes };
  }
  return { title: `${what}: ${item.action.toLowerCase().replaceAll('_', ' ')}`, changes: [] };
}
