import { ENQUIRY_ROLES } from '@shubhjets/shared';
import { z } from 'zod';
import { optionalDate, optionalEmail, optionalPhone, optionalText } from '../common/fields.js';

/** Where the visitor came from; every form and tap carries these (WEBSITE.md). */
const Attribution = {
  page: optionalText(300),
  leadSource: optionalText(40),
  utmSource: optionalText(100),
  utmMedium: optionalText(100),
  utmCampaign: optionalText(150),
  utmTerm: optionalText(150),
  utmContent: optionalText(150),
  gclid: optionalText(200),
};

/** Spam traps: a hidden field people never fill, and how long the form was open. */
const Traps = {
  companyWebsite: z.string().max(500).nullable().optional(),
  elapsedMs: z.number().int().min(0).max(86_400_000).nullable().optional(),
};

const consent = z.literal(true, {
  message: 'Please tick the box so we can contact you about your enquiry',
});

const requiredPhone = optionalPhone.refine((v) => !!v, 'Enter your WhatsApp number');

const role = z.preprocess(
  (v) => (typeof v === 'string' ? v.trim().toUpperCase() : v),
  z.enum(ENQUIRY_ROLES, { message: 'Choose family, planner or hotel' }),
);

export const EnquiryBody = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(120),
  phone: requiredPhone,
  email: optionalEmail,
  role,
  firm: optionalText(200),
  weddingCity: optionalText(80),
  weddingDate: optionalDate,
  guestsFrom: optionalText(500),
  guests: z.number().int().min(1, 'At least 1 guest').max(500).nullable().optional(),
  message: optionalText(1000),
  consent,
  ...Attribution,
  ...Traps,
});
export type EnquiryInput = z.infer<typeof EnquiryBody>;

export const PartnerSignupBody = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(120),
  firm: z.string().trim().min(2, 'Enter your firm or hotel name').max(200),
  role: z.preprocess(
    (v) => (typeof v === 'string' ? v.trim().toUpperCase() : v),
    z.enum(['PLANNER', 'HOTEL'], { message: 'Choose planner or hotel' }),
  ),
  city: optionalText(80),
  phone: requiredPhone,
  email: optionalEmail,
  instagram: optionalText(120),
  weddingsPerYear: z.number().int().min(0).max(1000).nullable().optional(),
  message: optionalText(1000),
  consent,
  ...Attribution,
  ...Traps,
});
export type PartnerSignupInput = z.infer<typeof PartnerSignupBody>;

export const TapBody = z.object({
  kind: z.enum(['WHATSAPP', 'CALL']),
  ...Attribution,
});
export type TapInput = z.infer<typeof TapBody>;
