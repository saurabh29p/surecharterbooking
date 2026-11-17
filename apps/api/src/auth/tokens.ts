import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
/** Phone session: 30 days, extended on every use (rotating refresh token). */
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** A token rotated this recently may be presented again by a parallel request without killing the session. */
export const ROTATION_GRACE_MS = 30 * 1000;
export const REFRESH_COOKIE = 'sj_refresh';
export const REFRESH_COOKIE_PATH = '/api/auth';

export interface AccessClaims {
  sub: string;
  ver: number;
  role: string;
}

export async function signAccessToken(claims: AccessClaims, secret: string): Promise<string> {
  return new SignJWT({ ver: claims.ver, role: claims.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setIssuer('shubhjets-api')
    .setAudience('shubhjets-desk')
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(new TextEncoder().encode(secret));
}

export async function verifyAccessToken(token: string, secret: string): Promise<AccessClaims> {
  const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
    algorithms: ['HS256'],
    issuer: 'shubhjets-api',
    audience: 'shubhjets-desk',
  });
  if (
    typeof payload.sub !== 'string' ||
    typeof payload.ver !== 'number' ||
    typeof payload.role !== 'string'
  ) {
    throw new Error('Malformed token');
  }
  return { sub: payload.sub, ver: payload.ver, role: payload.role };
}

export function newRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Only hashes are stored, so a database leak cannot be replayed as sessions. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
