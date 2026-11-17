import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config.js';

const VERSION = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * AES-256-GCM for bank details and guest ID files.
 * Layout: [version 1B][keyId length 1B][keyId][iv 12B][tag 16B][ciphertext].
 * The first configured key encrypts; any configured key can decrypt, so keys can be rotated.
 */
@Injectable()
export class EncryptionService {
  private readonly keys: Map<string, Buffer>;
  private readonly activeId: string;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.keys = new Map(config.DATA_ENCRYPTION_KEYS.map((k) => [k.id, k.key]));
    this.activeId = config.DATA_ENCRYPTION_KEYS[0]!.id;
  }

  encrypt(plain: Buffer): Buffer {
    const key = this.keys.get(this.activeId)!;
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const body = Buffer.concat([cipher.update(plain), cipher.final()]);
    const id = Buffer.from(this.activeId, 'utf8');
    return Buffer.concat([Buffer.from([VERSION, id.length]), id, iv, cipher.getAuthTag(), body]);
  }

  decrypt(blob: Buffer): Buffer {
    if (blob[0] !== VERSION) throw new Error('Unknown encryption format');
    const idLen = blob[1] ?? 0;
    const keyId = blob.subarray(2, 2 + idLen).toString('utf8');
    const key = this.keys.get(keyId);
    if (!key) throw new Error(`Encryption key "${keyId}" is not configured`);
    let offset = 2 + idLen;
    const iv = blob.subarray(offset, (offset += IV_BYTES));
    const tag = blob.subarray(offset, (offset += TAG_BYTES));
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(blob.subarray(offset)), decipher.final()]);
  }

  encryptJson(value: unknown): Buffer {
    return this.encrypt(Buffer.from(JSON.stringify(value), 'utf8'));
  }

  decryptJson<T>(blob: Buffer): T {
    return JSON.parse(this.decrypt(blob).toString('utf8')) as T;
  }

  /** Which key encrypted this blob (for re-encryption after rotation). */
  keyIdOf(blob: Buffer): string {
    return blob.subarray(2, 2 + (blob[1] ?? 0)).toString('utf8');
  }
}
