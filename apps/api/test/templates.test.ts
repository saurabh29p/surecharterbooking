import { PLACEHOLDERS } from '@shubhjets/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { renderTemplate } from '../src/documents/markdown.js';
import { TemplatesService } from '../src/documents/templates.service.js';
import { PdfService } from '../src/pdf/pdf.service.js';
import { createOwner, createTestApp, login, resetLimits, type TestApp } from './app.js';
import { resetDb } from './db.js';

describe('agreement templates', () => {
  let t: TestApp;
  let token: string;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.ds);
    resetLimits(t);
    await createOwner(t.ds, { setupDone: true });
    token = (await login(t)).accessToken;
    t.app.get(TemplatesService).now = () => new Date('2026-11-18T06:00:00Z');
  });

  const authed = <T extends { set: (k: string, v: string) => T }>(r: T) =>
    r.set('authorization', `Bearer ${token}`);

  it('ships the three agreements as unapproved drafts in Indian contract format', async () => {
    const list = (await authed(t.http().get('/api/templates')).expect(200)).body;
    expect(
      list.map((x: { kind: string; version: number; lawyerApproved: boolean }) => [
        x.kind,
        x.version,
        x.lawyerApproved,
      ]),
    ).toEqual([
      ['OPERATOR_AGREEMENT', 1, false],
      ['CLIENT_TERMS', 1, false],
      ['REFERRAL_AGREEMENT', 1, false],
    ]);
    const op = (await authed(t.http().get('/api/templates/operator-agreement')).expect(200)).body;
    for (const must of [
      'non-circumvention',
      'twenty-four (24) months',
      'pilot-in-command',
      'Digital Personal Data Protection Act, 2023',
      'Arbitration and Conciliation Act, 1996',
      'immediately',
      'ANNEXURE A',
      'e-stamp',
      '{{operator.nsop_no}}',
      '{{us.llpin}}',
    ])
      expect(op.current.bodyMd.toLowerCase(), must).toContain(must.toLowerCase());
    expect(op.placeholders).toEqual(PLACEHOLDERS.OPERATOR_AGREEMENT);
  });

  it('saves edits as a new unapproved version, refusing unknown placeholders', async () => {
    const op = (await authed(t.http().get('/api/templates/client-terms')).expect(200)).body;
    const bad = await authed(t.http().post('/api/templates/client-terms/versions'))
      .send({ bodyMd: `${op.current.bodyMd}\n\n{{client.passport}}` })
      .expect(400);
    expect(bad.body.message).toBe('Unknown placeholder: {{client.passport}}');
    await authed(t.http().post('/api/templates/client-terms/versions'))
      .send({ bodyMd: op.current.bodyMd })
      .expect(409);
    const saved = await authed(t.http().post('/api/templates/client-terms/versions'))
      .send({ bodyMd: `${op.current.bodyMd}\n\n**12.3** Extra clause.` })
      .expect(201);
    expect(saved.body.current).toMatchObject({ version: 2, lawyerApproved: false });
    expect(saved.body.versions).toHaveLength(2);
  });

  it('records lawyer approval of the newest version only; any later edit needs approval again', async () => {
    const tpl = (await authed(t.http().get('/api/templates/referral-agreement')).expect(200)).body;
    const id = tpl.current.id;
    const future = await authed(
      t.http().post(`/api/templates/referral-agreement/versions/${id}/approve`),
    )
      .send({ approvedOn: '2026-12-01' })
      .expect(400);
    expect(future.body.message).toBe('The approval date cannot be in the future');
    const ok = await authed(
      t.http().post(`/api/templates/referral-agreement/versions/${id}/approve`),
    )
      .send({ approvedOn: '2026-11-17' })
      .expect(200);
    expect(ok.body.current).toMatchObject({ lawyerApproved: true, approvedOn: '2026-11-17' });
    await authed(t.http().post(`/api/templates/referral-agreement/versions/${id}/approve`))
      .send({ approvedOn: '2026-11-17' })
      .expect(409);

    const edited = await authed(t.http().post('/api/templates/referral-agreement/versions'))
      .send({ bodyMd: `${tpl.current.bodyMd}\n\nOne more line.` })
      .expect(201);
    expect(edited.body.current).toMatchObject({ version: 2, lawyerApproved: false });
    const old = await authed(
      t.http().post(`/api/templates/referral-agreement/versions/${id}/approve`),
    )
      .send({ approvedOn: '2026-11-17' })
      .expect(409);
    expect(old.body.message).toMatch(/Only the newest version/);
    const audit = await t.ds.query(
      `SELECT action FROM audit_log WHERE entity = 'template_version'`,
    );
    expect(audit.length).toBeGreaterThanOrEqual(2);
  });

  it('previews a template as a PDF with sample data', async () => {
    const res = await authed(t.http().post('/api/templates/operator-agreement/preview'))
      .send({})
      .buffer(true)
      .parse((r, done) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => done(null, Buffer.concat(chunks)));
      })
      .expect(200);
    const text = await t.app.get(PdfService).text(res.body as Buffer);
    expect(text).toContain('OPERATOR–BROKER AGREEMENT');
    expect(text).toContain('Sample Aviation Pvt Ltd');
    expect(text).toContain('PREVIEW · SAMPLE DATA');
    expect(text).toContain('ANNEXURE A');
  });
});

describe('template rendering', () => {
  const defs = PLACEHOLDERS.CLIENT_TERMS;

  it('escapes values, never runs HTML from the template, and marks missing values', () => {
    const { html, missing } = renderTemplate(
      '# Terms\n\nClient: **{{client.name}}** <b>raw</b>\n\nGSTIN {{client.gstin}}\n\n{{quote.itinerary}}\n',
      defs,
      {
        text: { 'client.name': '<script>x</script> $& Co' },
        blocks: { 'quote.itinerary': '<table><tr><td>T</td></tr></table>' },
      },
    );
    expect(html).toContain('<strong>&lt;script&gt;x&lt;/script&gt; $&amp; Co</strong>');
    expect(html).toContain('&lt;b&gt;raw&lt;/b&gt;');
    expect(html).toContain('<table><tr><td>T</td></tr></table>');
    expect(html).not.toContain('<p><table>');
    expect(html).toContain('<span class="missing">[Client GSTIN]</span>');
    expect(missing).toEqual(['Client GSTIN']);
  });
});
