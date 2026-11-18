import { CONSENT_SOURCES } from '@shubhjets/shared';
import { z } from 'zod';
import { optionalEmail, optionalGstin, optionalPhone, optionalText } from '../common/fields.js';

const consentSource = z.enum(CONSENT_SOURCES as [string, ...string[]], {
  message: 'Choose how they agreed',
});

export const ClientFields = z.object({
  name: z.string().trim().min(2, 'Enter the client name').max(200),
  type: z.enum(['FAMILY', 'CORPORATE']).default('FAMILY'),
  phone: optionalPhone,
  email: optionalEmail,
  gstin: optionalGstin,
  partnerId: z.string().uuid().nullable().optional(),
  notes: optionalText(4000),
  /** Record consent at the same time (recommended). */
  consent: z.object({ source: consentSource, givenAt: z.coerce.date().optional() }).optional(),
});
export type ClientInput = z.infer<typeof ClientFields>;
export const UpdateClientBody = ClientFields.omit({ consent: true, type: true })
  .partial()
  .extend({ type: z.enum(['FAMILY', 'CORPORATE']).optional() });
export type UpdateClientInput = z.infer<typeof UpdateClientBody>;

export const ConsentBody = z.object({
  subjectType: z.enum(['PARTNER', 'CLIENT', 'ENQUIRY', 'GUEST']),
  subjectId: z.string().uuid(),
  source: consentSource,
  givenAt: z.coerce.date().optional(),
});
export type ConsentInput = z.infer<typeof ConsentBody>;
