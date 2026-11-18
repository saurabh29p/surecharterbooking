import { parsePercent } from '@shubhjets/shared';
import { reactive } from 'vue';
import type { PartnerForm } from '../components/partner/PartnerFields.vue';
import type { PartnerBase } from './partners';

export function newPartnerForm(
  p?: PartnerBase | null,
  defaults?: { basis: 'MARGIN_SHARE' | 'BOOKING_PERCENT'; bps: number },
): PartnerForm {
  return reactive({
    type: p?.type ?? 'PLANNER',
    firm: p?.firm ?? '',
    city: p?.city ?? '',
    address: p?.address ?? '',
    gstin: p?.gstin ?? '',
    contactPerson: p?.contactPerson ?? '',
    phone: p?.phone ?? '',
    email: p?.email ?? '',
    website: p?.website ?? '',
    instagram: p?.instagram ?? '',
    sourceLink: p?.sourceLink ?? '',
    fitNote: p?.fitNote ?? '',
    notes: p?.notes ?? '',
    commissionBasis: p?.commissionBasis ?? defaults?.basis ?? 'MARGIN_SHARE',
    commissionPct: String((p?.commissionBps ?? defaults?.bps ?? 2000) / 100),
    nextFollowUpOn: p?.nextFollowUpOn ?? '',
  });
}

/** API body. Throws a field error map when the percentage can't be read. */
export function partnerBody(f: PartnerForm): Record<string, unknown> {
  let commissionBps: number;
  try {
    commissionBps = parsePercent(f.commissionPct);
  } catch {
    throw { fields: { commissionBps: 'Enter a percentage, e.g. 20 or 2.5' } };
  }
  return {
    type: f.type,
    firm: f.firm.trim(),
    city: f.city,
    address: f.address,
    gstin: f.gstin,
    contactPerson: f.contactPerson,
    phone: f.phone,
    email: f.email,
    website: f.website,
    instagram: f.instagram,
    sourceLink: f.sourceLink,
    fitNote: f.fitNote,
    notes: f.notes,
    commissionBasis: f.commissionBasis,
    commissionBps,
    nextFollowUpOn: f.nextFollowUpOn,
  };
}
