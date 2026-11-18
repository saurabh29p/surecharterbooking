import { stateName } from '@shubhjets/shared';
import { z } from 'zod';
import { optionalText, scheduleSchema } from '../common/fields.js';

const MarkupLine = z
  .object({
    legId: z.string().uuid(),
    rateResponseId: z.string().uuid(),
    markupType: z.enum(['PERCENT', 'FIXED']),
    /** PERCENT: basis points. FIXED: paise. */
    markupValue: z.number().int().min(0, 'Markup cannot be negative'),
  })
  .refine((l) => l.markupType !== 'PERCENT' || l.markupValue <= 50_000, {
    message: 'Use a markup under 500%',
    path: ['markupValue'],
  });

const Extra = z
  .object({
    description: z.string().trim().min(2, 'Describe the extra').max(200),
    cost: z.number().int().min(0, 'Cost cannot be negative'),
    sell: z.number().int().min(0, 'Price cannot be negative'),
  })
  .refine((e) => e.sell > 0 || e.cost === 0, {
    message: 'Add the price the client pays',
    path: ['sell'],
  });

export const UpdateQuoteBody = z.object({
  lines: z.array(MarkupLine).max(50).optional(),
  extras: z.array(Extra).max(10, 'Use at most 10 extras').optional(),
  cancellationSchedule: scheduleSchema.optional(),
  cancellationTerms: optionalText(2000),
  validityHours: z
    .number()
    .int('Use whole hours')
    .min(1, 'At least 1 hour')
    .max(720, 'At most 30 days')
    .optional(),
  placeOfSupplyState: z
    .string()
    .refine((v) => !!stateName(v), { message: 'Choose a state' })
    .nullable()
    .optional(),
  paymentPlanBps: z
    .array(z.number().int().min(1).max(10_000))
    .min(1)
    .max(4, 'Use at most 4 instalments')
    .refine((p) => p.reduce((a, b) => a + b, 0) === 10_000, {
      message: 'Instalments must add up to 100%',
    })
    .optional(),
  inclusions: optionalText(2000),
  exclusions: optionalText(2000),
});
export type UpdateQuoteInput = z.infer<typeof UpdateQuoteBody>;

export const IssueBody = z.object({ confirmLooser: z.boolean().default(false) });

export const SentBody = z.object({
  channel: z
    .enum([
      'WEB_SHARE',
      'WHATSAPP',
      'TELEGRAM',
      'EMAIL',
      'INSTAGRAM',
      'MESSENGER',
      'COPY_LINK',
      'DOWNLOAD',
    ])
    .default('WEB_SHARE'),
  recipient: optionalText(200),
});

export const AcceptBody = z.object({
  name: z.string().trim().min(2, 'Who accepted? Enter their name').max(120),
});

export const OperatorScheduleBody = z.object({
  schedule: scheduleSchema.nullable(),
  saveForOperator: z.boolean().default(false),
});
