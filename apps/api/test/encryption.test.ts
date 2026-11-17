import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { EncryptionService } from '../src/crypto/encryption.service.js';

const key = (n: number) => Buffer.alloc(32, n).toString('base64');
const make = (keys: string) =>
  new EncryptionService(
    loadConfig({
      DATABASE_URL: 'postgres://u:p@h/db',
      JWT_SECRET: 'x'.repeat(32),
      DATA_ENCRYPTION_KEYS: keys,
    }),
  );

describe('EncryptionService', () => {
  it('round-trips JSON and never stores plaintext', () => {
    const svc = make(`k1:${key(1)}`);
    const blob = svc.encryptJson({ accountNumber: '123456789012' });
    expect(blob.toString('latin1')).not.toContain('123456789012');
    expect(svc.decryptJson(blob)).toEqual({ accountNumber: '123456789012' });
  });

  it('uses a fresh IV each time', () => {
    const svc = make(`k1:${key(1)}`);
    expect(svc.encryptJson('same').equals(svc.encryptJson('same'))).toBe(false);
  });

  it('detects tampering', () => {
    const svc = make(`k1:${key(1)}`);
    const blob = svc.encryptJson({ a: 1 });
    blob[blob.length - 1] = (blob[blob.length - 1] ?? 0) ^ 0xff;
    expect(() => svc.decrypt(blob)).toThrow();
  });

  it('supports key rotation: new key encrypts, old key still decrypts', () => {
    const old = make(`k1:${key(1)}`);
    const blob = old.encryptJson({ v: 'old' });
    const rotated = make(`k2:${key(2)},k1:${key(1)}`);
    expect(rotated.decryptJson(blob)).toEqual({ v: 'old' });
    expect(rotated.keyIdOf(rotated.encryptJson({ v: 'new' }))).toBe('k2');
    expect(() => make(`k2:${key(2)}`).decrypt(blob)).toThrow(/k1/);
  });
});
