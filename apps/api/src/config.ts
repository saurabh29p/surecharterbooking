import { z } from 'zod';

const bool = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');

/** "v1:<base64 32 bytes>,v0:<base64>" — the first key encrypts, all keys can decrypt (rotation). */
const encryptionKeys = z.string().transform((value, ctx) => {
  const keys = value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [id, b64] = part.split(':');
      return { id: id ?? '', key: Buffer.from(b64 ?? '', 'base64') };
    });
  if (
    keys.length === 0 ||
    keys.some((k) => !/^[a-z0-9]{1,8}$/i.test(k.id) || k.key.length !== 32)
  ) {
    ctx.addIssue({
      code: 'custom',
      message:
        'must be "<id>:<base64 of 32 random bytes>", comma-separated (run: pnpm --filter @shubhjets/api gen:key)',
    });
    return z.NEVER;
  }
  return keys;
});

/** Every environment variable the API reads. Validated once at startup; see .env.example. */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3000),
  DESK_ORIGIN: z.string().url().default('http://localhost:5173'),
  DATABASE_URL: z.string().url(),
  DATABASE_SSL: bool.default(false),
  JWT_SECRET: z.string().min(32, 'must be at least 32 characters'),
  DATA_ENCRYPTION_KEYS: encryptionKeys,
  /** Secure cookies need HTTPS; off only for local http development. */
  COOKIE_SECURE: bool.optional(),
  /** Behind Railway/Vercel proxies, so the real client IP is used for rate limits. */
  TRUST_PROXY: bool.default(false),
});

export type AppConfig = Omit<z.infer<typeof EnvSchema>, 'COOKIE_SECURE'> & {
  COOKIE_SECURE: boolean;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  const data = parsed.data;
  return { ...data, COOKIE_SECURE: data.COOKIE_SECURE ?? data.NODE_ENV === 'production' };
}

export const APP_CONFIG = Symbol('APP_CONFIG');
