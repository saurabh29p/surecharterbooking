import { checkGstin, checkIfsc, normalizePhone } from '@shubhjets/shared';
import { z } from 'zod';

/** Optional text: trimmed; "" clears it (null); absent leaves it unchanged (undefined). */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use at most ${max} characters`)
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? undefined : v === null || v === '' ? null : v));

export const optionalUrl = z
  .string()
  .trim()
  .nullable()
  .optional()
  .transform((v) =>
    v === undefined
      ? undefined
      : v === null || v === ''
        ? null
        : /^https?:\/\//i.test(v)
          ? v
          : `https://${v}`,
  )
  .pipe(z.string().url('Enter a web address, e.g. https://example.com').nullable().optional());

export const optionalDate = z
  .string()
  .nullable()
  .optional()
  .transform((v) => (v === '' ? null : v))
  .pipe(
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date')
      .nullable()
      .optional(),
  );

export const optionalPhone = z
  .string()
  .nullable()
  .optional()
  .transform((v, ctx) => {
    if (v === undefined) return undefined;
    if (v === null || v.trim() === '') return null;
    const n = normalizePhone(v);
    if (!n) {
      ctx.addIssue({
        code: 'custom',
        message: 'Enter a 10-digit mobile number, or + and the country code',
      });
      return z.NEVER;
    }
    return n;
  });

export const optionalEmail = z
  .string()
  .trim()
  .nullable()
  .optional()
  .transform((v) => (v === undefined ? undefined : v === null || v === '' ? null : v.toLowerCase()))
  .pipe(z.string().email('Enter a valid email').nullable().optional());

export const optionalGstin = optionalText(20)
  .transform((v) => (typeof v === 'string' ? v.toUpperCase() : v))
  .superRefine((v, ctx) => {
    if (!v) return;
    const check = checkGstin(v);
    if (!check.ok) ctx.addIssue({ code: 'custom', message: check.problem });
  });

export const BankDetailsInput = z.object({
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
