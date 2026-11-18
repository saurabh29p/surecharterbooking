import { createHash } from 'node:crypto';
import { findLeaks } from '@shubhjets/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailService } from '../src/email/email.service.js';
import { EncryptionService } from '../src/crypto/encryption.service.js';
import { SEED_OWNER, seed } from '../src/db/seed-data.js';
import { OperatorsService } from '../src/operators/operators.service.js';
import { QuotesService } from '../src/quotes/quotes.service.js';
import { SharingService } from '../src/sharing/sharing.service.js';
import { RatesService } from '../src/weddings/rates.service.js';
import { createTestApp, resetLimits, type TestApp } from './app.js';
import { resetDb } from './db.js';

const NOW = new Date('2026-11-18T06:00:00Z');
const DAY = 86_400_000;

describe('secure share links, the link page and "I accept"', () => {
  let t: TestApp;
  let token: string;
  let now: Date;
  let quote: { id: string; documentId: string };
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.ds);
    resetLimits(t);
    await seed(t.ds, t.app.get(EncryptionService), NOW);
    now = NOW;
    for (const svc of [RatesService, OperatorsService, QuotesService, SharingService])
      (t.app.get(svc) as { now: () => Date }).now = () => now;
    token = (await t.http().post('/api/auth/login').send(SEED_OWNER)).body.accessToken;
    for (const r of await t.ds.query(
      `SELECT code AS k, id FROM wedding UNION ALL SELECT brand, id FROM operator`,
    ))
      ids[r.k] = r.id;
    // W-102: choose Operator A for both legs, build and issue the quote.
    const legs = await t.ds.query(
      `SELECT l.id FROM leg l JOIN wedding w ON w.id = l.wedding_id WHERE w.code = 'W-102' ORDER BY l.seq`,
    );
    const [rr] = await t.ds.query(
      `SELECT r.id FROM rate_response r JOIN operator o ON o.id = r.operator_id JOIN wedding w ON w.id = r.wedding_id WHERE w.code = 'W-102' AND o.brand = 'Operator A'`,
    );
    for (const l of legs)
      await authed(t.http().put(`/api/legs/${l.id}/choices`))
        .send({ rateResponseIds: [rr.id] })
        .expect(204);
    const q = (await authed(t.http().post(`/api/weddings/${ids['W-102']}/quotes`)).expect(201))
      .body;
    const issued = (
      await authed(t.http().post(`/api/quotes/${q.id}/issue`))
        .send({})
        .expect(200)
    ).body;
    quote = { id: q.id, documentId: issued.documentId };
  });

  const authed = <T extends { set: (k: string, v: string) => T }>(r: T) =>
    r.set('authorization', `Bearer ${token}`);
  const link = (body: object = { channel: 'WHATSAPP', recipient: 'Client C2' }) =>
    authed(t.http().post(`/api/documents/${quote.documentId}/share-links`)).send(body);
  const tokenOf = (url: string) => url.split('/s/')[1]!;

  it('prepares the message and recipient, then makes a link and a WhatsApp message with it', async () => {
    const prep = (
      await authed(t.http().get(`/api/documents/${quote.documentId}/share`)).expect(200)
    ).body;
    expect(prep.message).toContain('{link}');
    expect(prep.message).toContain('₹12,33,100 including GST');
    expect(prep.recipient).toMatchObject({ name: 'Client C2 Family' });
    expect(prep.expiryDays).toBe(14);

    const res = (await link().expect(201)).body;
    expect(res.url).toMatch(/\/s\/[A-Za-z0-9_-]{32}$/);
    expect(res.message).toContain(res.url);
    expect(res.message).not.toContain('{link}');
    expect(res.whatsappUrl).toMatch(/^https:\/\/wa\.me\/\d*\?text=/);
    expect(decodeURIComponent(res.whatsappUrl)).toContain(res.url);
    expect(res.telegramUrl).toContain(encodeURIComponent(res.url));
    expect(new Date(res.expiresAt).getTime()).toBe(NOW.getTime() + 14 * DAY);

    // Only the token's hash is stored.
    const [s] = await t.ds.query(`SELECT token_hash, channel, recipient FROM share WHERE id = $1`, [
      res.shareId,
    ]);
    expect(s).toEqual({
      token_hash: createHash('sha256').update(tokenOf(res.url)).digest('hex'),
      channel: 'WHATSAPP',
      recipient: 'Client C2',
    });
    const [q] = await t.ds.query(`SELECT status FROM quote WHERE id = $1`, [quote.id]);
    expect(q.status).toBe('SHARED');
  });

  it('refuses a message without {link}', async () => {
    const res = await link({ channel: 'EMAIL', message: 'Hi, no link here' }).expect(400);
    expect(res.body.fields.message).toBe('Keep {link} in the message');
  });

  it('shows a branded, client-safe page; counts openings; serves the stored PDF', async () => {
    const res = (await link().expect(201)).body;
    const page = await t
      .http()
      .get(`/api/s/${tokenOf(res.url)}`)
      .expect(200);
    expect(page.headers['content-security-policy']).toContain("default-src 'none'");
    expect(page.headers['x-robots-tag']).toBe('noindex, nofollow');
    expect(page.headers['referrer-policy']).toBe('no-referrer');
    const html = page.text;
    for (const shown of [
      'Client C2 Family',
      '₹12,33,100',
      'New Delhi → Jaipur',
      'Open the PDF',
      'I accept',
      'Valid until',
    ])
      expect(html, shown).toContain(shown);
    expect(html).not.toMatch(/<script/i);
    const svc = t.app.get(QuotesService);
    const figures = await svc.internalFigures(t.ds.manager, await svc.find(quote.id));
    const text = html.replace(/<style[\s\S]*?<\/style>/, '').replace(/<[^>]+>/g, ' ');
    expect(
      findLeaks(text, {
        ...figures,
        allowedAmounts: [12.331 * 1_00_000_00, 5.225 * 1_00_000_00],
        allowedPercents: [1800, 900, 1000, 5000, 10000],
      }),
    ).toEqual([]);

    const pdf = await t
      .http()
      .get(`/api/s/${tokenOf(res.url)}/pdf`)
      .expect(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    await t
      .http()
      .get(`/api/s/${tokenOf(res.url)}`)
      .expect(200);
    const shares = (
      await authed(t.http().get(`/api/documents/${quote.documentId}/shares`)).expect(200)
    ).body;
    expect(shares[0]).toMatchObject({
      channel: 'WHATSAPP',
      link: { state: 'ACTIVE' },
      opened: { count: 2 },
    });
  });

  it('records "I accept" with the name, for you to confirm; it does not accept the quote by itself', async () => {
    const res = (await link().expect(201)).body;
    const tk = tokenOf(res.url);
    const noName = await t
      .http()
      .post(`/api/s/${tk}/accept`)
      .type('form')
      .send({ name: ' ', agree: 'yes' })
      .expect(400);
    expect(noName.text).toContain('Please enter your full name.');
    const noTick = await t
      .http()
      .post(`/api/s/${tk}/accept`)
      .type('form')
      .send({ name: 'Asha Mehta' })
      .expect(400);
    expect(noTick.text).toContain('Please tick the box to accept.');
    const ok = await t
      .http()
      .post(`/api/s/${tk}/accept`)
      .type('form')
      .send({ name: 'Asha  Mehta', agree: 'yes' })
      .expect(303);
    expect(ok.headers.location).toBe(`../${tk}`);
    expect((await t.http().get(`/api/s/${tk}`).expect(200)).text).toContain(
      'Thank you, <b>Asha Mehta</b>',
    );

    const detail = (await authed(t.http().get(`/api/quotes/${quote.id}`)).expect(200)).body;
    expect(detail.status).toBe('SHARED');
    expect(detail.linkAcceptances).toEqual([
      expect.objectContaining({ name: 'Asha Mehta', channel: 'WHATSAPP', recipient: 'Client C2' }),
    ]);
    const shares = (
      await authed(t.http().get(`/api/documents/${quote.documentId}/shares`)).expect(200)
    ).body;
    expect(shares[0].acceptance).toMatchObject({ name: 'Asha Mehta' });
  });

  it('stops accepting once the quote expires, and links stop working when revoked or expired', async () => {
    const a = (await link().expect(201)).body;
    const b = (await link({ channel: 'TELEGRAM' }).expect(201)).body;
    now = new Date(NOW.getTime() + 25 * 3_600_000); // quote valid 24 h
    const page = await t
      .http()
      .get(`/api/s/${tokenOf(a.url)}`)
      .expect(200);
    expect(page.text).toContain('This quote has expired.');
    expect(page.text).not.toContain('I accept</button>');
    await t
      .http()
      .post(`/api/s/${tokenOf(a.url)}/accept`)
      .type('form')
      .send({ name: 'Asha', agree: 'yes' })
      .expect(409);

    await authed(t.http().post(`/api/shares/${a.shareId}/revoke`)).expect(204);
    const gone = await t
      .http()
      .get(`/api/s/${tokenOf(a.url)}`)
      .expect(410);
    expect(gone.text).toContain('been switched off');
    await t
      .http()
      .get(`/api/s/${tokenOf(a.url)}/pdf`)
      .expect(410);

    now = new Date(NOW.getTime() + 15 * DAY);
    expect(
      (
        await t
          .http()
          .get(`/api/s/${tokenOf(b.url)}`)
          .expect(410)
      ).text,
    ).toContain('expired');
    await t.http().get('/api/s/not-a-real-token-at-all-0000000').expect(404);
    const shares = (
      await authed(t.http().get(`/api/documents/${quote.documentId}/shares`)).expect(200)
    ).body;
    expect(shares.map((s: { link: { state: string } }) => s.link.state).sort()).toEqual([
      'EXPIRED',
      'REVOKED',
    ]);
  });

  it('logs shares in the activity log', async () => {
    await link().expect(201);
    const rows = await t.ds.query(
      `SELECT diff FROM audit_log WHERE entity = 'document' AND action = 'SHARED' AND entity_id = $1`,
      [quote.documentId],
    );
    expect(rows[0].diff).toMatchObject({ channel: 'WHATSAPP', link: true });
  });

  describe('email from the app', () => {
    it('falls back to the mail app while Resend is not set up', async () => {
      const prep = (
        await authed(t.http().get(`/api/documents/${quote.documentId}/share`)).expect(200)
      ).body;
      expect(prep.emailReady).toBe(false);
      const res = await authed(t.http().post(`/api/documents/${quote.documentId}/email`))
        .send({ to: 'c2@example.test' })
        .expect(409);
      expect(res.body.code).toBe('EMAIL_NOT_CONFIGURED');
    });

    it('sends through Resend with the PDF attached and a secure link, and logs it', async () => {
      const email = t.app.get(EmailService);
      const saved = { ...email.options };
      email.options = {
        apiKey: 're_test',
        from: 'ShubhJets <quotes@example.test>',
        replyTo: 'owner@example.test',
        url: 'https://resend.example.test',
      };
      const calls: { url: string; init: RequestInit }[] = [];
      email.fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), init: init! });
        return new Response(JSON.stringify({ id: 'email-123' }), { status: 200 });
      }) as typeof fetch;
      try {
        await authed(t.http().post(`/api/documents/${quote.documentId}/email`))
          .send({ to: 'not-an-email' })
          .expect(400);
        const res = await authed(t.http().post(`/api/documents/${quote.documentId}/email`))
          .send({ to: 'c2@example.test' })
          .expect(201);
        expect(calls).toHaveLength(1);
        expect(calls[0]!.url).toBe('https://resend.example.test/emails');
        const headers = calls[0]!.init.headers as Record<string, string>;
        expect(headers.Authorization).toBe('Bearer re_test');
        expect(headers['Idempotency-Key']).toBe(`share-${res.body.shareId}`);
        const body = JSON.parse(String(calls[0]!.init.body));
        expect(body).toMatchObject({
          from: 'ShubhJets <quotes@example.test>',
          to: ['c2@example.test'],
          reply_to: 'owner@example.test',
        });
        expect(body.subject).toBe('Your charter quote W-102 · Q1 · ShubhJets');
        expect(body.text).toContain(res.body.url);
        expect(body.html).toContain(`href="${res.body.url}"`);
        expect(body.attachments[0].filename).toBe('ShubhJets-Quote-W-102-Q1.pdf');
        expect(Buffer.from(body.attachments[0].content, 'base64').subarray(0, 5).toString()).toBe(
          '%PDF-',
        );
        const shares = (
          await authed(t.http().get(`/api/documents/${quote.documentId}/shares`)).expect(200)
        ).body;
        expect(shares[0]).toMatchObject({ channel: 'EMAIL', recipient: 'c2@example.test' });
        const [log] = await t.ds.query(`SELECT diff FROM audit_log WHERE action = 'EMAILED'`);
        expect(log.diff).toMatchObject({ to: 'c2@example.test', providerId: 'email-123' });

        // Refused by the email service: nothing is recorded.
        email.fetchImpl = vi.fn(
          async () =>
            new Response(JSON.stringify({ message: 'Domain not verified' }), { status: 403 }),
        ) as typeof fetch;
        const refused = await authed(t.http().post(`/api/documents/${quote.documentId}/email`))
          .send({ to: 'c2@example.test' })
          .expect(503);
        expect(refused.body.message).toBe(
          'The email service refused it: Domain not verified. Try again, or send it from your mail app.',
        );
        const after = (
          await authed(t.http().get(`/api/documents/${quote.documentId}/shares`)).expect(200)
        ).body;
        expect(after).toHaveLength(1);
      } finally {
        email.options = saved;
        email.fetchImpl = (...args) => fetch(...args);
      }
    });
  });
});
