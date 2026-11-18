import { AIRCRAFT_CATEGORIES, checkCin } from '@shubhjets/shared';
import { z } from 'zod';
import {
  BankDetailsInput,
  optionalDate,
  optionalEmail,
  optionalGstin,
  optionalPhone,
  optionalSchedule,
  optionalText,
  optionalUrl,
} from '../common/fields.js';

const iata = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, 'Use a 3-letter airport code');

const OperatorFields = z.object({
  legalName: z.string().trim().min(2, 'Enter the legal name').max(200),
  brand: optionalText(120),
  cin: optionalText(25)
    .transform((v) => (typeof v === 'string' ? v.toUpperCase() : v))
    .superRefine((v, ctx) => {
      const p = v ? checkCin(v) : null;
      if (p) ctx.addIssue({ code: 'custom', message: p });
    }),
  gstin: optionalGstin,
  nsopNo: optionalText(40).transform((v) => (typeof v === 'string' ? v.toUpperCase() : v)),
  nsopIssuedOn: optionalDate,
  website: optionalUrl,
  safetyDisclosureUrl: optionalUrl,
  sourceLink: optionalUrl,
  dgcaRank: z.number().int().min(1).max(1000).nullable().optional(),
  dgcaRankCheckedOn: optionalDate,
  dgcaRankSource: optionalText(200),
  cancellationTerms: optionalText(2000),
  cancellationSchedule: optionalSchedule,
  notes: optionalText(4000),
  address: optionalText(500),
  /** Home airports (where its aircraft are based), e.g. ["DEL", "UDR"]. */
  bases: z.array(iata).max(20).optional(),
  /** Object = set, null = remove, absent = keep. */
  bankDetails: BankDetailsInput.nullable().optional(),
});

export const CreateOperatorBody = OperatorFields;
export type CreateOperatorInput = z.infer<typeof CreateOperatorBody>;
export const UpdateOperatorBody = OperatorFields.partial();
export type UpdateOperatorInput = Partial<z.infer<typeof UpdateOperatorBody>>;

export const ContactBody = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(120),
  role: optionalText(80),
  phone: optionalPhone,
  email: optionalEmail,
  isPrimary: z.boolean().optional(),
});
export type ContactInput = z.infer<typeof ContactBody>;

export const AircraftBody = z.object({
  type: z.string().trim().min(2, 'Enter the aircraft type, e.g. Citation XLS').max(80),
  registration: optionalText(12).transform((v) =>
    typeof v === 'string' ? v.toUpperCase().replace(/\s/g, '') : v,
  ),
  category: z.enum(AIRCRAFT_CATEGORIES as [string, ...string[]], { message: 'Choose a category' }),
  seats: z.number().int().min(1, 'At least 1 seat').max(40, 'At most 40 seats'),
  year: z.number().int().min(1950).max(2100).nullable().optional(),
  baseAirport: iata.nullable().optional(),
});
export type AircraftInput = z.infer<typeof AircraftBody>;

/** Multipart text fields that come with an uploaded operator document. */
export const DocumentFields = z
  .object({
    kind: z.enum(['NSOP', 'INSURANCE', 'OPERATOR_AGREEMENT'], {
      message: 'Choose what this document is',
    }),
    expiresOn: optionalDate,
    notes: optionalText(500),
  })
  .superRefine((v, ctx) => {
    if ((v.kind === 'NSOP' || v.kind === 'INSURANCE') && !v.expiresOn) {
      ctx.addIssue({
        code: 'custom',
        path: ['expiresOn'],
        message: 'Enter the expiry date shown on the document',
      });
    }
  });
export type DocumentInput = z.infer<typeof DocumentFields>;

export const BlockBody = z.object({ reason: z.string().trim().min(3, 'Say briefly why').max(300) });
export const ListQuery = z.object({
  status: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',') : undefined))
    .pipe(z.array(z.enum(['FOUND', 'VERIFIED', 'EXPIRING_SOON', 'BLOCKED'])).optional()),
  base: iata.optional(),
  category: z.enum(AIRCRAFT_CATEGORIES as [string, ...string[]]).optional(),
  minSeats: z.coerce.number().int().min(1).max(40).optional(),
  q: z.string().trim().max(80).optional(),
});
export type ListFilters = z.infer<typeof ListQuery>;
