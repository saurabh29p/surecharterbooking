/** Field names that must never appear in the audit log, even inside a diff. */
const SECRET_KEYS = /password|token|secret|bank_?details|account_?number|ifsc/i;

/** Make a value safe and readable for the audit log. */
export function auditValue(key: string, value: unknown): unknown {
  if (SECRET_KEYS.test(key) && !/hint/i.test(key)) return value == null ? null : '[redacted]';
  if (Buffer.isBuffer(value)) return '[encrypted]';
  if (value instanceof Date) return value.toISOString();
  return value === undefined ? null : value;
}

export function redact(
  diff: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!diff) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(diff)) out[k] = auditValue(k, v);
  return out;
}
