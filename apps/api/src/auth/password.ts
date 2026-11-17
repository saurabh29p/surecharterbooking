import { hash, verify } from '@node-rs/argon2';

export const MIN_PASSWORD_LENGTH = 12;

/** argon2id with library defaults (OWASP-recommended parameters). */
export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

/** A real hash of a random string, verified when the email is unknown so timing doesn't reveal which emails exist. */
let dummyHash: Promise<string> | undefined;
export function dummyPasswordHash(): Promise<string> {
  dummyHash ??= hash(`dummy-${Math.random()}`);
  return dummyHash;
}

/** Returns a plain-language problem, or null when the password is acceptable. */
export function passwordProblem(password: string, email?: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH)
    return `Use at least ${MIN_PASSWORD_LENGTH} characters`;
  if (password.length > 200) return 'Use at most 200 characters';
  if (/^(.)\1+$/.test(password)) return 'Use more than one repeated character';
  const lower = password.toLowerCase();
  if (['change-me-to-a-long-passphrase', 'password1234', '123456789012'].includes(lower)) {
    return 'This password is too common';
  }
  const emailName = email?.toLowerCase().split('@')[0] ?? '';
  if (emailName.length >= 4 && lower.includes(emailName)) return "Don't include your email name";
  return null;
}
