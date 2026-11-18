import {
  AIRCRAFT_CATEGORIES,
  CONSENT_SOURCES,
  LEAD_SOURCES,
  WEDDING_STATUSES,
  stateName,
} from '@shubhjets/shared';
import { z } from 'zod';
import { optionalDate, optionalEmail, optionalPhone, optionalText } from '../common/fields.js';

const iata = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, 'Choose an airport');
const time = z
  .string()
  .nullable()
  .optional()
  .transform((v) => (v === '' ? null : v))
  .pipe(
    z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM, e.g. 09:30')
      .nullable()
      .optional(),
  );

export const LegFields = z
  .object({
    from: iata,
    to: iata,
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose the flight date'),
    windowFrom: time,
    windowTo: time,
    pax: z
      .number({ message: 'Enter the number of passengers' })
      .int()
      .min(1, 'At least 1 passenger')
      .max(200, 'At most 200 passengers'),
    category: z
      .enum(AIRCRAFT_CATEGORIES as [string, ...string[]])
      .nullable()
      .optional(),
    notes: optionalText(500),
  })
  .superRefine((v, ctx) => {
    if (v.from === v.to)
      ctx.addIssue({ code: 'custom', path: ['to'], message: 'Arrival must differ from departure' });
    if (v.windowFrom && v.windowTo && v.windowTo <= v.windowFrom) {
      ctx.addIssue({
        code: 'custom',
        path: ['windowTo'],
        message: 'The window must end after it starts',
      });
    }
  });
export type LegInput = z.infer<typeof LegFields>;
export const UpdateLegBody = z.object({
  from: iata.optional(),
  to: iata.optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  windowFrom: time,
  windowTo: time,
  pax: z.number().int().min(1).max(200).optional(),
  category: z
    .enum(AIRCRAFT_CATEGORIES as [string, ...string[]])
    .nullable()
    .optional(),
  notes: optionalText(500),
});
export type UpdateLegInput = z.infer<typeof UpdateLegBody>;

const WeddingFields = z.object({
  partnerId: z.string().uuid().nullable().optional(),
  businessProfileId: z.string().uuid().nullable().optional(),
  venueCity: optionalText(80),
  startsOn: optionalDate,
  endsOn: optionalDate,
  leadSource: z.enum(LEAD_SOURCES as [string, ...string[]]).optional(),
  utmSource: optionalText(100),
  utmMedium: optionalText(100),
  utmCampaign: optionalText(150),
  utmTerm: optionalText(150),
  utmContent: optionalText(150),
  landingPage: optionalText(300),
  notes: optionalText(4000),
  requiredPaymentBps: z.number().int().min(0).max(10_000, 'At most 100%').optional(),
  placeOfSupplyState: z
    .string()
    .nullable()
    .optional()
    .refine((v) => !v || !!stateName(v), { message: 'Choose a state' }),
});

const datesInOrder = (
  v: { startsOn?: string | null; endsOn?: string | null },
  ctx: z.RefinementCtx,
) => {
  if (v.startsOn && v.endsOn && v.endsOn < v.startsOn) {
    ctx.addIssue({
      code: 'custom',
      path: ['endsOn'],
      message: 'The last day must be on or after the first day',
    });
  }
};

export const CreateWeddingBody = WeddingFields.extend({
  /** An existing client, or a quick new one (linked to the partner if any). */
  clientId: z.string().uuid().nullable().optional(),
  newClient: z
    .object({
      name: z.string().trim().min(2, 'Enter the client name').max(200),
      phone: optionalPhone,
      email: optionalEmail,
      consentSource: z.enum(CONSENT_SOURCES as [string, ...string[]]).optional(),
    })
    .optional(),
  legs: z.array(LegFields).max(12, 'At most 12 legs').default([]),
}).superRefine(datesInOrder);
export type CreateWeddingInput = z.infer<typeof CreateWeddingBody>;

export const UpdateWeddingBody = WeddingFields.extend({
  clientId: z.string().uuid().nullable().optional(),
}).superRefine(datesInOrder);
export type UpdateWeddingInput = z.infer<typeof UpdateWeddingBody>;

export const WeddingListQuery = z.object({
  status: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',') : undefined))
    .pipe(z.array(z.enum(WEDDING_STATUSES as [string, ...string[]])).optional()),
  partnerId: z.string().uuid().optional(),
  q: z.string().trim().max(80).optional(),
});
export type WeddingListFilters = z.infer<typeof WeddingListQuery>;

export const LostBody = z.object({
  reason: z.string().trim().min(3, 'Say briefly why (e.g. went with another broker)').max(300),
});
