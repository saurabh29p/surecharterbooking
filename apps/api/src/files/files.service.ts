import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import { currentActor } from '../audit/request-context.js';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { EncryptionService } from '../crypto/encryption.service.js';
import { PURPOSES, sniff, type FilePurpose } from './file-types.js';
import { StoredFile } from './file.entity.js';
import { STORAGE_DRIVER, type StorageDriver } from './storage.js';

/** Download links are short-lived: long enough to open on a phone, too short to be worth forwarding. */
export const LINK_TTL_SECONDS = 5 * 60;

export interface UploadInput {
  buffer: Buffer;
  originalName: string;
  purpose: FilePurpose;
  purgeAt?: Date | null;
}

export interface FileLink {
  url: string;
  expiresAt: Date;
  mime: string;
  name: string;
}

@Injectable()
export class FilesService {
  private readonly linkKey: Buffer;

  constructor(
    @Inject(STORAGE_DRIVER) private readonly storage: StorageDriver,
    @InjectRepository(StoredFile) private readonly repo: Repository<StoredFile>,
    @Inject(APP_CONFIG) config: AppConfig,
    private readonly crypto: EncryptionService,
  ) {
    this.linkKey = createHash('sha256').update(`file-links:${config.JWT_SECRET}`).digest();
  }

  /** Check, fingerprint, optionally encrypt, store and record an upload. */
  async upload(input: UploadInput, manager?: EntityManager): Promise<StoredFile> {
    const rules = PURPOSES[input.purpose];
    if (input.buffer.length === 0) throw new BadRequestException('The file is empty');
    if (input.buffer.length > rules.maxBytes) {
      throw new BadRequestException(`That file is too big. Upload ${rules.label}.`);
    }
    const kind = sniff(input.buffer);
    if (!kind || !rules.allowed.some((a) => a.mime === kind.mime)) {
      throw new BadRequestException(`That file type isn't accepted here. Upload ${rules.label}.`);
    }
    const now = new Date();
    const key = `${input.purpose}/${now.getUTCFullYear()}/${randomUUID()}.${rules.encrypt ? 'bin' : kind.ext}`;
    const body = rules.encrypt ? this.crypto.encrypt(input.buffer) : input.buffer;
    await this.storage.put(key, body, rules.encrypt ? 'application/octet-stream' : kind.mime);
    const actor = currentActor();
    const repo = manager ? manager.getRepository(StoredFile) : this.repo;
    try {
      return await repo.save(
        repo.create({
          storageKey: key,
          mime: kind.mime,
          sizeBytes: input.buffer.length,
          sha256: createHash('sha256').update(input.buffer).digest('hex'),
          originalName: input.originalName.slice(0, 200) || null,
          encrypted: rules.encrypt,
          purgeAt: input.purgeAt ?? null,
          purgedAt: null,
          createdBy: actor.type === 'USER' ? actor.id : null,
        }),
      );
    } catch (err) {
      await this.storage.delete(key).catch(() => undefined);
      throw err;
    }
  }

  async find(id: string): Promise<StoredFile> {
    const f = await this.repo.findOneBy({ id });
    if (!f || f.purgedAt) throw new NotFoundException('File not found');
    return f;
  }

  /** The original bytes (decrypted when needed), e.g. for building PDFs on the server. */
  async read(id: string): Promise<{ file: StoredFile; bytes: Buffer }> {
    const file = await this.find(id);
    const raw = await this.storage.get(file.storageKey);
    return { file, bytes: file.encrypted ? this.crypto.decrypt(raw) : raw };
  }

  private fileName(f: StoredFile) {
    const ext = f.mime === 'application/pdf' ? 'pdf' : (f.mime.split('/')[1] ?? 'bin');
    return f.originalName ?? `file.${ext}`;
  }

  /**
   * A short-lived download link. Plain files on S3 get a presigned bucket URL; encrypted files
   * and local-disk files go through the API's signed /files/download route. Sensitive (encrypted)
   * files are logged every time a link is made.
   */
  async link(id: string, purpose: string, manager?: EntityManager): Promise<FileLink> {
    const file = await this.find(id);
    const expiresAt = new Date(Date.now() + LINK_TTL_SECONDS * 1000);
    const name = this.fileName(file);
    if (file.encrypted) {
      const actor = currentActor();
      await (manager ?? this.repo.manager).query(
        `INSERT INTO file_access_log (file_id, user_id, purpose) VALUES ($1, $2, $3)`,
        [file.id, actor.type === 'USER' ? actor.id : null, purpose.slice(0, 100)],
      );
    }
    const direct = file.encrypted
      ? null
      : await this.storage.presignedGetUrl(file.storageKey, {
          expiresIn: LINK_TTL_SECONDS,
          filename: name,
          contentType: file.mime,
        });
    const url = direct ?? `/api/files/download/${this.sign(file.id, expiresAt)}`;
    return { url, expiresAt, mime: file.mime, name };
  }

  sign(fileId: string, expiresAt: Date): string {
    const payload = Buffer.from(
      JSON.stringify({ f: fileId, e: Math.floor(expiresAt.getTime() / 1000) }),
    ).toString('base64url');
    const mac = createHmac('sha256', this.linkKey).update(payload).digest('base64url');
    return `${payload}.${mac}`;
  }

  /** Check a signed link; returns the file id or throws. */
  verify(token: string, now = new Date()): string {
    const [payload, mac] = token.split('.');
    if (!payload || !mac) throw new NotFoundException('This link is not valid');
    const expected = createHmac('sha256', this.linkKey).update(payload).digest();
    const given = Buffer.from(mac, 'base64url');
    if (given.length !== expected.length || !timingSafeEqual(given, expected))
      throw new NotFoundException('This link is not valid');
    const { f, e } = JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
      f: string;
      e: number;
    };
    if (e * 1000 < now.getTime())
      throw new NotFoundException('This link has expired. Open the file again from the app.');
    return f;
  }

  /** Remove the bytes now and keep the record (marked purged), e.g. guest IDs after the retention period. */
  async purge(id: string): Promise<void> {
    const file = await this.repo.findOneBy({ id });
    if (!file || file.purgedAt) return;
    await this.storage.delete(file.storageKey);
    file.purgedAt = new Date();
    await this.repo.save(file);
  }
}
