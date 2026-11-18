import { PARTNER_STATUSES } from '@shubhjets/shared';
import { z } from 'zod';
import {
  optionalDate,
  optionalEmail,
  optionalGstin,
  optionalPhone,
  optionalText,
  optionalUrl,
} from '../common/fields.js';

export const PartnerFields = z.object({
  type: z.enum(['PLANNER', 'HOTEL', 'OTHER'], { message: 'Choose planner, hotel or other' }),
  firm: z.string().trim().min(2, 'Enter the firm or hotel name').max(200),
  city: optionalText(80),
  contactPerson: optionalText(120),
  phone: optionalPhone,
  email: optionalEmail,
  website: optionalUrl,
  instagram: optionalText(120).transform((v) =>
    typeof v === 'string'
      ? v.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '@').replace(/\/$/, '')
      : v,
  ),
  sourceLink: optionalUrl,
  fitNote: optionalText(500),
  notes: optionalText(4000),
  address: optionalText(500),
  gstin: optionalGstin,
  status: z.enum(PARTNER_STATUSES as [string, ...string[]]).optional(),
  commissionBasis: z.enum(['MARGIN_SHARE', 'BOOKING_PERCENT']).optional(),
  commissionBps: z.number().int().min(0).max(10_000, 'At most 100%').optional(),
  nextFollowUpOn: optionalDate,
});
export type PartnerInput = z.infer<typeof PartnerFields>;
export const UpdatePartnerBody = PartnerFields.partial();
export type UpdatePartnerInput = Partial<PartnerInput>;

export const ActivityBody = z.object({
  kind: z.enum(['CALLED', 'NO_ANSWER', 'SENT_DECK', 'CALL_BOOKED', 'MET', 'NOTE'], {
    message: 'Choose what happened',
  }),
  note: optionalText(1000),
  /** Optionally set (or clear with "") the next follow-up date at the same time. */
  nextFollowUpOn: optionalDate,
});
export type ActivityInput = z.infer<typeof ActivityBody>;

export const PartnerListQuery = z.object({
  status: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',') : undefined))
    .pipe(z.array(z.enum(PARTNER_STATUSES as [string, ...string[]])).optional()),
  type: z.enum(['PLANNER', 'HOTEL', 'OTHER']).optional(),
  followUpDue: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  q: z.string().trim().max(80).optional(),
});
export type PartnerListFilters = z.infer<typeof PartnerListQuery>;
