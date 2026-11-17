import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FilesService } from '../src/files/files.service.js';
import { S3StorageDriver } from '../src/files/s3.driver.js';
import { createOwner, createTestApp, login, resetLimits, type TestApp } from './app.js';
import { resetDb } from './db.js';
import { TEST_ENV } from './env.js';
import { PDF, PNG } from './fixtures.js';

describe('file storage (local driver)', () => {
  let t: TestApp;
  let token: string;
  let files: FilesService;

  beforeAll(async () => {
    t = await createTestApp();
    files = t.app.get(FilesService);
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.ds);
    resetLimits(t);
    await createOwner(t.ds);
    token = (await login(t)).accessToken;
  });

  const auth = <T extends { set: (k: string, v: string) => T }>(r: T) =>
    r.set('authorization', `Bearer ${token}`);

  it('checks the real file type, not the name', async () => {
    await expect(
      files.upload({
        buffer: Buffer.from('<svg onload="alert(1)"/>'),
        originalName: 'logo.png',
        purpose: 'logo',
      }),
    ).rejects.toThrow(/isn't accepted here. Upload a PNG, JPG or WebP image up to 2 MB/);
    await expect(
      files.upload({ buffer: PDF, originalName: 'x.pdf', purpose: 'logo' }),
    ).rejects.toThrow(/isn't accepted/);
    await expect(
      files.upload({ buffer: Buffer.alloc(0), originalName: 'x.png', purpose: 'logo' }),
    ).rejects.toThrow(/empty/);
    const big = Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]);
    await expect(
      files.upload({ buffer: big, originalName: 'big.png', purpose: 'logo' }),
    ).rejects.toThrow(/too big/);
  });

  it('stores, fingerprints and serves a file through a short-lived signed link', async () => {
    const f = await files.upload({
      buffer: PDF,
      originalName: 'NSOP permit.pdf',
      purpose: 'operator-document',
    });
    expect(f).toMatchObject({ mime: 'application/pdf', sizeBytes: PDF.length, encrypted: false });
    expect(f.sha256).toHaveLength(64);
    const link = (await auth(t.http().post(`/api/files/${f.id}/link`)).expect(201)).body;
    expect(link.url).toMatch(/^\/api\/files\/download\//);
    const res = await t.http().get(link.url).expect(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(Buffer.from(res.body).equals(PDF)).toBe(true);
  });

  it('rejects tampered and expired links', async () => {
    const f = await files.upload({
      buffer: PDF,
      originalName: 'a.pdf',
      purpose: 'operator-document',
    });
    const good = files.sign(f.id, new Date(Date.now() + 60_000));
    const [payload] = good.split('.');
    await t.http().get(`/api/files/download/${payload}.AAAA`).expect(404);
    const expired = files.sign(f.id, new Date(Date.now() - 1000));
    const res = await t.http().get(`/api/files/download/${expired}`).expect(404);
    expect(res.body.message).toMatch(/expired/);
  });

  it('needs login to make a link', async () => {
    const f = await files.upload({
      buffer: PDF,
      originalName: 'a.pdf',
      purpose: 'operator-document',
    });
    await t.http().post(`/api/files/${f.id}/link`).expect(401);
  });

  it('encrypts guest IDs at rest and logs every access', async () => {
    const f = await files.upload({
      buffer: PDF,
      originalName: 'passport.pdf',
      purpose: 'guest-id',
    });
    expect(f.encrypted).toBe(true);
    const onDisk = await readFile(join(TEST_ENV.STORAGE_LOCAL_DIR, f.storageKey));
    expect(onDisk.toString('latin1')).not.toContain('%PDF');
    const link = (await auth(t.http().post(`/api/files/${f.id}/link`)).expect(201)).body;
    const res = await t.http().get(link.url).expect(200);
    expect(Buffer.from(res.body).equals(PDF)).toBe(true);
    const [log] = await t.ds.query(
      `SELECT count(*)::int AS n FROM file_access_log WHERE file_id = $1`,
      [f.id],
    );
    expect(log.n).toBe(1);
  });

  it('purges bytes but keeps the record', async () => {
    const f = await files.upload({ buffer: PDF, originalName: 'a.pdf', purpose: 'guest-id' });
    await files.purge(f.id);
    await expect(readFile(join(TEST_ENV.STORAGE_LOCAL_DIR, f.storageKey))).rejects.toThrow();
    const [row] = await t.ds.query(`SELECT purged_at FROM file WHERE id = $1`, [f.id]);
    expect(row.purged_at).not.toBeNull();
    await auth(t.http().post(`/api/files/${f.id}/link`)).expect(404);
  });

  describe('business profile logo', () => {
    it('uploads, replaces (deleting the old file) and removes a logo', async () => {
      const { body: p } = await auth(t.http().post('/api/business-profiles')).send({}).expect(201);
      const up = await auth(t.http().post(`/api/business-profiles/${p.id}/logo`))
        .attach('file', PNG, 'logo.png')
        .expect(200);
      expect(up.body.logoFileId).toBeTruthy();
      const first = up.body.logoFileId;
      const again = await auth(t.http().post(`/api/business-profiles/${p.id}/logo`))
        .attach('file', PNG, 'logo2.png')
        .expect(200);
      expect(again.body.logoFileId).not.toBe(first);
      const [old] = await t.ds.query(`SELECT purged_at FROM file WHERE id = $1`, [first]);
      expect(old.purged_at).not.toBeNull();
      const gone = await auth(t.http().delete(`/api/business-profiles/${p.id}/logo`)).expect(200);
      expect(gone.body.logoFileId).toBeNull();
    });

    it('explains a wrong file or a missing file', async () => {
      const { body: p } = await auth(t.http().post('/api/business-profiles')).send({}).expect(201);
      const bad = await auth(t.http().post(`/api/business-profiles/${p.id}/logo`))
        .attach('file', PDF, 'logo.pdf')
        .expect(400);
      expect(bad.body.message).toMatch(/PNG, JPG or WebP/);
      const none = await auth(t.http().post(`/api/business-profiles/${p.id}/logo`)).expect(400);
      expect(none.body.message).toBe('Choose a file to upload');
    });
  });
});

describe('S3 driver (Railway bucket)', () => {
  const settings = {
    endpoint: 'https://t3.storageapi.dev',
    bucket: 'my-bucket-abc123',
    region: 'auto',
    accessKeyId: 'AKIAEXAMPLE',
    secretAccessKey: 'secret-example',
    forcePathStyle: false,
  };

  it('writes and reads objects in the configured bucket', async () => {
    const driver = new S3StorageDriver(settings);
    const s3 = mockClient(driver.client as S3Client);
    s3.on(PutObjectCommand).resolves({});
    s3.on(GetObjectCommand).resolves({
      Body: { transformToByteArray: async () => new Uint8Array(PDF) } as never,
    });
    await driver.put('operator-document/2026/a.pdf', PDF, 'application/pdf');
    expect(s3.commandCalls(PutObjectCommand)[0]!.args[0].input).toMatchObject({
      Bucket: 'my-bucket-abc123',
      Key: 'operator-document/2026/a.pdf',
      ContentType: 'application/pdf',
    });
    expect((await driver.get('operator-document/2026/a.pdf')).equals(PDF)).toBe(true);
    s3.restore();
  });

  it('makes virtual-hosted presigned URLs that expire', async () => {
    const url = new URL(
      await new S3StorageDriver(settings).presignedGetUrl('logo/2026/x.png', {
        expiresIn: 300,
        filename: 'logo.png',
        contentType: 'image/png',
      }),
    );
    expect(url.host).toBe('my-bucket-abc123.t3.storageapi.dev');
    expect(url.pathname).toBe('/logo/2026/x.png');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(url.searchParams.get('response-content-type')).toBe('image/png');
  });

  it('supports path-style for emulators', async () => {
    const url = new URL(
      await new S3StorageDriver({ ...settings, forcePathStyle: true }).presignedGetUrl(
        'logo/2026/x.png',
        {
          expiresIn: 60,
          filename: 'x.png',
          contentType: 'image/png',
        },
      ),
    );
    expect(url.host).toBe('t3.storageapi.dev');
    expect(url.pathname).toBe('/my-bucket-abc123/logo/2026/x.png');
  });

  it('refuses unsafe keys', async () => {
    await expect(
      new S3StorageDriver(settings).put('../etc/passwd', PDF, 'application/pdf'),
    ).rejects.toThrow(/Unsafe/);
  });
});
