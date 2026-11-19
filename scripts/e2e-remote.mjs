#!/usr/bin/env node
/**
 * End-to-end check against a deployed API (e.g. the Railway test stack), using the automated test
 * account (TEST_ACCOUNT_EMAIL / TEST_ACCOUNT_PASSWORD on the API service).
 *
 *   E2E_API=https://<api host> E2E_EMAIL=... E2E_PASSWORD=... node scripts/e2e-remote.mjs
 *
 * Walks one wedding through the whole flow: website enquiry → rates → quote PDF → secure link →
 * "I accept" → signed terms + payment → confirmed → guests and IDs → payout → flown → GST invoice,
 * and checks that files land in the bucket and their signed links open. Everything it makes is
 * labelled "E2E" so it is easy to spot (and is wiped with the rest of the test data before go-live).
 * Settings it must change for the run (GST confirmation) are put back afterwards.
 */
const API = (process.env.E2E_API ?? '').replace(/\/$/, '');
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
if (!API || !EMAIL || !PASSWORD) {
  console.error('Set E2E_API, E2E_EMAIL and E2E_PASSWORD');
  process.exit(2);
}

const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
const RUN = new Date().toISOString().slice(2, 19).replace(/[-:T]/g, '');
const istDate = (offsetDays = 0) =>
  new Date(Date.now() + 5.5 * 3600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);
const TODAY = istDate(0);

let token = null;
const results = [];
const restore = [];

async function call(method, path, { json, form, raw, headers = {}, expect } = {}) {
  const h = { ...headers };
  if (token) h.authorization = `Bearer ${token}`;
  let body;
  if (json !== undefined) {
    h['content-type'] = 'application/json';
    body = JSON.stringify(json);
  } else if (form) {
    body = form;
  } else if (raw !== undefined) {
    body = raw.body;
    h['content-type'] = raw.type;
  }
  const started = performance.now();
  const res = await fetch(`${API}${path}`, { method, headers: h, body, redirect: 'manual' });
  const ms = Math.round(performance.now() - started);
  const type = res.headers.get('content-type') ?? '';
  const data = type.includes('json')
    ? await res.json()
    : type.startsWith('text/')
      ? await res.text()
      : Buffer.from(await res.arrayBuffer());
  const ok = expect ? [expect].flat().includes(res.status) : res.status < 400;
  if (!ok) {
    const detail =
      typeof data === 'object' && !Buffer.isBuffer(data)
        ? JSON.stringify(data)
        : String(data).slice(0, 300);
    throw new Error(`${method} ${path} → ${res.status}: ${detail}`);
  }
  return { status: res.status, data, ms, headers: res.headers };
}

async function step(name, fn) {
  const started = performance.now();
  try {
    const note = await fn();
    const ms = Math.round(performance.now() - started);
    results.push({ name, ok: true, ms, note });
    console.log(`✓ ${name} (${ms} ms)${note ? ` — ${note}` : ''}`);
  } catch (e) {
    results.push({ name, ok: false, note: e.message });
    console.log(`✗ ${name} — ${e.message}`);
    throw e;
  }
}

const upload = (path, fields, file, name, type) => {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  form.append('file', new Blob([file], { type }), name);
  return call('POST', path, { form });
};

/** Open a short-lived file link and check the bytes come back. */
async function openLink(url, kind) {
  const full = url.startsWith('http')
    ? url
    : `${API}${url.startsWith('/api') ? url.slice(4) : url}`;
  const res = await fetch(full);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (res.status !== 200 || bytes.length === 0) throw new Error(`${kind} link → ${res.status}`);
  return { host: new URL(full).host, bytes };
}

const s = {}; // things made along the way

try {
  await step('log in with the automated test account', async () => {
    const { data } = await call('POST', '/auth/login', {
      json: { email: EMAIL, password: PASSWORD },
    });
    token = data.accessToken;
    return `role ${data.user.role}`;
  });

  await step(
    'business profile for the run (complete, so invoices and agreements can be made)',
    async () => {
      const { data: profiles } = await call('GET', '/business-profiles');
      const earlier = profiles.find((p) => p.gstin === '07AAAFE0000B1ZO' && !p.archived);
      if (earlier) {
        s.profileId = earlier.id;
        return `reusing "${earlier.label}" from an earlier run`;
      }
      const { data } = await call('POST', '/business-profiles', {
        json: {
          label: `E2E ${RUN}`,
          brandName: 'ShubhJets',
          legalName: 'E2E Test Charters LLP',
          llpin: 'AAA-0000',
          gstin: '07AAAFE0000B1ZO',
          stateCode: '07',
          registeredAddress: '1 Example Road, New Delhi 110001',
          signatoryName: 'E2E Signatory',
          signatoryDesignation: 'Designated Partner',
          arbitrationSeatCity: 'New Delhi',
          invoicePrefix: 'E2E',
          bankDetails: {
            accountName: 'E2E Test Charters LLP',
            accountNumber: '000111222333',
            ifsc: 'HDFC0001234',
            bankName: 'Example Bank',
          },
        },
      });
      s.profileId = data.id;
    },
  );

  await step('upload a logo (bucket)', async () => {
    const { data } = await upload(
      `/business-profiles/${s.profileId}/logo`,
      {},
      PNG,
      'logo.png',
      'image/png',
    );
    s.logoFileId = data.logoFileId;
    const { data: link } = await call('POST', `/files/${s.logoFileId}/link`);
    const opened = await openLink(link.url, 'logo');
    return `stored and opened from ${opened.host}`;
  });

  await step(
    'operator verified under rule 1 (NSOP + insurance uploaded to the bucket and checked)',
    async () => {
      const { data: op } = await call('POST', '/operators', {
        json: {
          legalName: `E2E Operator ${RUN} Pvt Ltd`,
          brand: `E2E Operator ${RUN}`,
          nsopNo: `E2E-NSOP-${RUN}`,
          bases: ['DEL', 'UDR'],
        },
      });
      s.operatorId = op.id;
      await upload(
        `/operators/${op.id}/documents`,
        { kind: 'NSOP', expiresOn: istDate(400) },
        PDF,
        'nsop.pdf',
        'application/pdf',
      );
      const { data: after } = await upload(
        `/operators/${op.id}/documents`,
        { kind: 'INSURANCE', expiresOn: istDate(300) },
        PDF,
        'insurance.pdf',
        'application/pdf',
      );
      for (const d of after.documents)
        await call('POST', `/operator-documents/${d.id}/verify`, { expect: 204 });
      const doc = after.documents.find((d) => d.fileId);
      const { data: link } = await call('POST', `/files/${doc.fileId}/link`);
      const opened = await openLink(link.url, 'operator document');
      if (!opened.bytes.subarray(0, 5).equals(Buffer.from('%PDF-')))
        throw new Error('document bytes are not the PDF');
      await call('POST', `/operators/${op.id}/aircraft`, {
        json: {
          type: 'Citation XLS',
          registration: `VT-E${RUN.slice(-2)}`,
          category: 'MIDSIZE',
          seats: 8,
          baseAirport: 'DEL',
        },
      });
      await call('POST', `/operators/${op.id}/contacts`, {
        json: { name: 'E2E Ops Desk', phone: '+919000000099', isPrimary: true },
      });
      const { status } = await call('POST', `/operators/${op.id}/verify`);
      const { data: full } = await call('GET', `/operators/${op.id}`);
      s.aircraftId = full.aircraft[0].id;
      return `status ${full.status} (${status}); document opened from ${opened.host}`;
    },
  );

  await step('website enquiry arrives as a wedding with a draft leg', async () => {
    await call('POST', '/public/enquiries', {
      json: {
        name: `E2E Family ${RUN}`,
        phone: `98${RUN.slice(-8)}`,
        email: 'e2e-family@example.com',
        role: 'family',
        weddingCity: 'Udaipur',
        weddingDate: TODAY,
        guestsFrom: '2 from Delhi',
        consent: true,
        page: '/routes/delhi-to-udaipur',
        elapsedMs: 20_000,
      },
      expect: 201,
    });
    const { data: board } = await call(
      'GET',
      `/weddings?q=${encodeURIComponent(`E2E Family ${RUN}`)}`,
    );
    const w = board.items[0];
    if (!w) throw new Error('the wedding did not appear on the board');
    Object.assign(s, { weddingId: w.id, code: w.code, clientId: w.client.id });
    await call('PATCH', `/weddings/${w.id}`, { json: { businessProfileId: s.profileId } });
    await call('POST', `/weddings/${w.id}/legs`, {
      json: { from: 'UDR', to: 'DEL', date: TODAY, pax: 2 },
    });
    const { data: detail } = await call('GET', `/weddings/${w.id}`);
    s.legIds = detail.legs.map((l) => l.id);
    if (s.legIds.length !== 2) throw new Error(`expected 2 legs, got ${s.legIds.length}`);
    return `${w.code}, legs ${detail.legs.map((l) => `${l.fromIata}→${l.toIata}`).join(', ')}`;
  });

  await step('Today shows it', async () => {
    const { data, ms } = await call('GET', '/today');
    if (!data.actions.some((a) => a.title.startsWith(s.code)))
      throw new Error('no Today action for the wedding');
    return `Today answered in ${ms} ms`;
  });

  await step('rates requested, rate request PDF made, reply in, jet chosen', async () => {
    const { data: reqs } = await call('POST', `/weddings/${s.weddingId}/rate-requests`, {
      json: { operatorIds: [s.operatorId] },
    });
    const requestId = (Array.isArray(reqs) ? reqs[0] : reqs).requestId;
    const { data: pdf, ms } = await call('POST', `/rate-requests/${requestId}/pdf`);
    s.netRate = 6_00_000_00;
    const { data: reply } = await call('POST', `/weddings/${s.weddingId}/rate-responses`, {
      json: {
        operatorId: s.operatorId,
        aircraftId: s.aircraftId,
        netRate: s.netRate,
        legIds: s.legIds,
        validUntil: new Date(Date.now() + 3 * 86_400_000).toISOString(),
      },
    });
    for (const leg of s.legIds)
      await call('PUT', `/legs/${leg}/choices`, {
        json: { rateResponseIds: [reply.id] },
        expect: 204,
      });
    return `rate request PDF made in ${ms} ms (${pdf.documentId ? 'stored' : 'ok'})`;
  });

  await step('quote issued as a branded PDF (Chromium on Railway)', async () => {
    const { data: draft } = await call('POST', `/weddings/${s.weddingId}/quotes`, { expect: 201 });
    const { data: issued, ms } = await call('POST', `/quotes/${draft.id}/issue`, { json: {} });
    Object.assign(s, { quoteId: draft.id, quoteDocId: issued.documentId });
    const { data: bytes } = await call('GET', `/documents/${issued.documentId}/pdf`);
    if (!Buffer.isBuffer(bytes) || !bytes.subarray(0, 5).equals(Buffer.from('%PDF-')))
      throw new Error('not a PDF');
    return `issued in ${ms} ms, PDF ${Math.round(bytes.length / 1024)} KB`;
  });

  await step('secure link opens, never shows the net rate, and the client accepts', async () => {
    const { data: link } = await call('POST', `/documents/${s.quoteDocId}/share-links`, {
      json: {
        channel: 'WHATSAPP',
        recipient: `E2E Family ${RUN}`,
        phone: '+919810000099',
        message: 'Namaste, your quote: {link}',
      },
      expect: 201,
    });
    const tk = link.url.split('/s/')[1];
    const saved = token;
    token = null;
    const { data: page } = await call('GET', `/s/${tk}`);
    const visible = String(page)
      .replace(/<style[\s\S]*?<\/style>/g, ' ')
      .replace(/<[^>]+>/g, ' ');
    for (const leak of ['6,00,000', '600000'])
      if (visible.includes(leak)) throw new Error(`share page shows the net rate (${leak})`);
    await call('POST', `/s/${tk}/accept`, {
      raw: {
        body: new URLSearchParams({ name: `E2E Family ${RUN}`, agree: 'yes' }).toString(),
        type: 'application/x-www-form-urlencoded',
      },
      expect: 303,
    });
    token = saved;
    const { data: today } = await call('GET', '/today');
    if (!today.actions.some((a) => a.kind === 'ACCEPTANCE' && a.title.startsWith(s.code)))
      throw new Error('acceptance not on Today');
    await call('POST', `/quotes/${s.quoteId}/accept`, { json: { name: `E2E Family ${RUN}` } });
    return 'link page clean; acceptance shown on Today and confirmed';
  });

  await step(
    'charter terms made from the approved template and signed copy uploaded (bucket)',
    async () => {
      await call('PATCH', `/clients/${s.clientId}`, {
        json: { address: '12 Example Road, New Delhi 110001' },
      });
      const { data: tpl } = await call('GET', '/templates/client-terms');
      if (!tpl.current.lawyerApproved) {
        await call('POST', `/templates/client-terms/versions/${tpl.current.id}/approve`, {
          json: { approvedOn: TODAY },
        });
        s.approvedTemplate = true;
      }
      const { data: terms } = await call('POST', '/agreements', {
        json: { kind: 'CLIENT_TERMS', weddingId: s.weddingId },
        expect: 201,
      });
      await upload(
        `/documents/${terms.documentId}/signed`,
        {},
        PDF,
        'signed-terms.pdf',
        'application/pdf',
      );
      const { data: signed } = await call('GET', `/documents/${terms.documentId}/signed`);
      const url = signed.url ?? signed.link?.url;
      if (url) await openLink(url, 'signed terms');
      return s.approvedTemplate
        ? 'note: approved the client-terms draft in this test database to allow signing'
        : undefined;
    },
  );

  await step('operator agreement PDF (draft) generates', async () => {
    const { data, ms } = await call('POST', '/agreements', {
      json: { kind: 'OPERATOR_AGREEMENT', operatorId: s.operatorId },
      expect: 201,
    });
    const { data: bytes } = await call('GET', `/documents/${data.documentId}/pdf`);
    if (!bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('not a PDF');
    return `${ms} ms, ${data.draft ? 'draft watermark' : 'approved'}`;
  });

  await step('payment received, wedding confirmed (rule 2)', async () => {
    const { data: money } = await call('GET', `/weddings/${s.weddingId}/money`);
    await call('POST', `/weddings/${s.weddingId}/payments`, {
      json: {
        direction: 'CLIENT_IN',
        amount: money.position.required,
        paidOn: TODAY,
        mode: 'BANK_TRANSFER',
        reference: `E2E-${RUN}`,
      },
      expect: 201,
    });
    await call('POST', `/weddings/${s.weddingId}/confirm`, { expect: 204 });
  });

  await step(
    'guests added; ID files stored encrypted and opened through a signed link',
    async () => {
      for (const leg of s.legIds)
        await call('POST', `/legs/${leg}/guests`, {
          json: { text: `E2E Guest One ${RUN}\nE2E Guest Two ${RUN}` },
          expect: 201,
        });
      const { data: manifest } = await call('GET', `/weddings/${s.weddingId}/guests`);
      const guests = manifest.legs.flatMap((l) => l.guests);
      for (const g of guests)
        await upload(`/guests/${g.id}/id-document`, {}, PNG, 'id.png', 'image/png');
      const { data: link } = await call('POST', `/guests/${guests[0].id}/id-document/link`);
      const opened = await openLink(link.url, 'guest ID');
      if (!opened.bytes.equals(PNG)) throw new Error('guest ID came back different');
      return `${guests.length} guests, IDs round-trip intact`;
    },
  );

  await step('operator payout from client money (rule 3), recorded as paid', async () => {
    const { data: money } = await call('GET', `/weddings/${s.weddingId}/money`);
    const op = money.operators.find((o) => o.operatorId === s.operatorId);
    const { data: payout } = await call('POST', `/weddings/${s.weddingId}/payments`, {
      json: {
        direction: 'OPERATOR_OUT',
        operatorId: s.operatorId,
        amount: op.remainingNet,
        gstAmount: 0,
      },
      expect: 201,
    });
    await call('POST', `/payments/${payout.id}/paid`, {
      json: { paidOn: TODAY, reference: `E2E-OP-${RUN}` },
      expect: 204,
    });
  });

  await step('both legs flown: Flying, then Done', async () => {
    await call('POST', `/legs/${s.legIds[0]}/flown`, { expect: 204 });
    await call('POST', `/legs/${s.legIds[1]}/flown`, { expect: 204 });
    const { data } = await call('GET', `/weddings/${s.weddingId}`);
    if (data.status !== 'DONE') throw new Error(`status is ${data.status}`);
  });

  await step(
    'GST invoice issued (GST confirmation turned on for the run, then put back)',
    async () => {
      const { data: settings } = await call('GET', '/settings');
      const wasConfirmed = settings.settings.find((x) => x.key === 'gst.rate_bps')?.confirmed;
      const sac = settings.settings.find((x) => x.key === 'gst.sac')?.value;
      if (!wasConfirmed) {
        await call('PATCH', '/settings', {
          json: { values: sac ? {} : { 'gst.sac': '996412' }, confirmGst: true },
        });
        restore.push(() => call('PATCH', '/settings', { json: { values: {}, confirmGst: false } }));
      }
      const { data: inv, ms } = await call('POST', `/weddings/${s.weddingId}/invoices`, {
        json: {},
        expect: 201,
      });
      const { data: bytes } = await call('GET', `/documents/${inv.documentId}/pdf`);
      if (!bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('not a PDF');
      return `${inv.number} in ${ms} ms`;
    },
  );

  await step('nothing left on Today for the wedding', async () => {
    const { data } = await call('GET', '/today');
    const left = data.actions.filter((a) => a.title.startsWith(s.code));
    if (left.length) throw new Error(`still on Today: ${left.map((a) => a.title).join('; ')}`);
  });
} catch {
  // reported by step()
} finally {
  for (const fn of restore)
    await fn().catch((e) => console.log(`! could not restore a setting: ${e.message}`));
  if (token) await call('POST', '/auth/logout').catch(() => undefined);
  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n${results.length - failed.length} of ${results.length} steps passed${s.code ? ` (wedding ${s.code})` : ''}`,
  );
  process.exitCode = failed.length ? 1 : 0;
}
