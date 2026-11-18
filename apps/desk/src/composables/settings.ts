import {
  groupIndian,
  parsePercent,
  parseRupees,
  type CancellationSchedule,
  type CommissionDefault,
  type SettingDef,
} from '@shubhjets/shared';
import { reactive } from 'vue';
import { api, onSessionChange } from '../api/client';

export interface SettingRow {
  key: string;
  value: unknown;
  confirmed: boolean;
  updatedAt: string;
}

export interface SettingsResponse {
  settings: SettingRow[];
  warnings: string[];
}

/** Shared settings state: the app-wide warning banner and the Settings screens read from here. */
const state = reactive({ loaded: false, settings: [] as SettingRow[], warnings: [] as string[] });

// Forget everything when the session ends, so the next login starts fresh.
onSessionChange((session) => {
  if (!session) Object.assign(state, { loaded: false, settings: [], warnings: [] });
});

export function useSettings() {
  async function load(force = false) {
    if (state.loaded && !force) return;
    apply(await api<SettingsResponse>('/settings'));
  }
  function apply(res: SettingsResponse) {
    state.settings = res.settings;
    state.warnings = res.warnings;
    state.loaded = true;
  }
  function reset() {
    state.loaded = false;
    state.settings = [];
    state.warnings = [];
  }
  const row = (key: string) => state.settings.find((s) => s.key === key);
  return { state, load, apply, reset, row };
}

/** What the input box shows for a stored value. */
export type Draft = string | { basis: string; pct: string } | CancellationSchedule;

export function toDraft(def: SettingDef, value: unknown): Draft {
  switch (def.kind) {
    case 'percent':
      return String((value as number) / 100);
    case 'money':
      return groupIndian(String(Math.round((value as number) / 100)));
    case 'int':
      return String(value);
    case 'commission': {
      const v = value as CommissionDefault;
      return { basis: v.basis, pct: String(v.bps / 100) };
    }
    case 'schedule':
      return ((value as CancellationSchedule | null) ?? []).map((t) => ({ ...t }));
    default:
      return String(value ?? '');
  }
}

/** Parse what was typed back into the stored form. Throws with a plain message when unreadable. */
export function fromDraft(def: SettingDef, draft: Draft): unknown {
  switch (def.kind) {
    case 'percent':
      return parsePercent(draft as string);
    case 'money':
      return parseRupees(draft as string);
    case 'int': {
      const n = Number(String(draft).trim());
      if (!Number.isInteger(n)) throw new Error(`Enter a whole number of ${def.unit ?? 'units'}`);
      return n;
    }
    case 'commission': {
      const d = draft as { basis: string; pct: string };
      return { basis: d.basis, bps: parsePercent(d.pct) };
    }
    case 'schedule':
      return draft;
    default:
      return String(draft).trim();
  }
}

export const sameDraft = (a: Draft, b: Draft) => JSON.stringify(a) === JSON.stringify(b);
