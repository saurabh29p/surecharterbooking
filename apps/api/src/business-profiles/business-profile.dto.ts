import {
  DEFAULT_STATE_CODE,
  checkGstin,
  checkIfsc,
  checkLlpin,
  stateName,
} from '@shubhjets/shared';
import { z } from 'zod';

/** Optional text: trimmed; empty string means "clear it" (null). */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use at most ${max} characters`)
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? undefined : v === null || v === '' ? null : v));

const BankDetailsInput = z.object({
  accountName: z.string().trim().min(1, 'Enter the account name').max(200),
  accountNumber: z
    .string()
    .transform((v) => v.replace(/\s/g, ''))
    .pipe(z.string().regex(/^[0-9]{6,20}$/, 'Account numbers have 6–20 digits')),
  ifsc: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => checkIfsc(v) === null, {
      message: 'An IFSC has 11 characters, like HDFC0001234',
    }),
  bankName: z.string().trim().min(1, 'Enter the bank name').max(100),
  branch: z.string().trim().max(100).nullable().optional(),
});

const ProfileFields = z.object({
  label: z
    .string()
    .trim()
    .min(1, 'Give this profile a short name, e.g. "Delhi"')
    .max(60)
    .optional(),
  brandName: optionalText(80),
  legalName: optionalText(200),
  llpin: optionalText(20).transform((v) => (typeof v === 'string' ? v.toUpperCase() : v)),
  gstin: optionalText(20).transform((v) => (typeof v === 'string' ? v.toUpperCase() : v)),
  stateCode: z
    .string()
    .refine((v) => !!stateName(v), { message: 'Choose a state' })
    .optional(),
  registeredAddress: optionalText(500),
  /** Object = set, null = remove, absent = keep. */
  bankDetails: BankDetailsInput.nullable().optional(),
  signatoryName: optionalText(120),
  signatoryDesignation: optionalText(120),
  arbitrationSeatCity: optionalText(80),
  invoicePrefix: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{1,10}$/, 'Use 1–10 letters, digits or dashes, e.g. SJ')
    .optional(),
});

function crossChecks(
  v: z.infer<typeof ProfileFields>,
  ctx: z.RefinementCtx,
  existingState?: string,
) {
  if (v.llpin) {
    const problem = checkLlpin(v.llpin);
    if (problem) ctx.addIssue({ code: 'custom', path: ['llpin'], message: problem });
  }
  if (v.gstin) {
    const check = checkGstin(v.gstin);
    if (!check.ok) {
      ctx.addIssue({ code: 'custom', path: ['gstin'], message: check.problem });
    } else {
      const state = v.stateCode ?? existingState ?? DEFAULT_STATE_CODE;
      if (check.stateCode !== state) {
        ctx.addIssue({
          code: 'custom',
          path: ['gstin'],
          message: `This GSTIN is registered in ${stateName(check.stateCode)}, but the profile's state is ${stateName(state)}`,
        });
      }
    }
  }
}

export const CreateProfileBody = ProfileFields.superRefine((v, ctx) => crossChecks(v, ctx));
/** Every field is optional (the setup wizard can skip anything). */
export type CreateProfileInput = Partial<z.infer<typeof CreateProfileBody>>;

/** Updates are cross-checked against the stored state in the service (the body may omit stateCode). */
export const UpdateProfileBody = ProfileFields;
export type UpdateProfileInput = Partial<z.infer<typeof UpdateProfileBody>>;
export const validateUpdate = (input: UpdateProfileInput, existingState: string) =>
  ProfileFields.superRefine((v, ctx) => crossChecks(v, ctx, existingState)).safeParse(input);
