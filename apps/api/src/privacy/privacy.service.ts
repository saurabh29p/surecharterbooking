import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { quoteReference } from '@shubhjets/shared';
import type { DataSource, EntityManager } from 'typeorm';
import { AuditService } from '../audit/audit.service.js';
import { FilesService } from '../files/files.service.js';

export type PrivacySubject = 'client' | 'partner';

type Row = Record<string, unknown>;

export interface ErasePlan {
  name: string;
  erased: boolean;
  /** Reasons the data can't be erased yet (plain words). */
  blockers: string[];
  /** What erasing removes. */
  erases: string[];
  /** What is kept, and why (records the law requires). */
  keeps: string[];
}

const ACTIVE = `status NOT IN ('DONE', 'LOST')`;
const ERASED_NAME = { client: 'Erased client', partner: 'Erased partner' } as const;
const TAX_HOLD =
  'GST law requires keeping tax invoices and accounts (about 8 years; your CA can confirm)';

/**
 * DPDP Act 2023: give a person a copy of their data, and erase it on request (BRIEF.md §5.8).
 * Erasing removes the personal details from every place they are kept and keeps only what the
 * law requires (tax invoices, money records, signed contracts). Both are logged.
 */
@Injectable()
export class PrivacyService {
  now: () => Date = () => new Date();

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly files: FilesService,
    private readonly audit: AuditService,
  ) {}

  private async subject(kind: PrivacySubject, id: string, m: EntityManager = this.ds.manager) {
    const [row] = await m.query(`SELECT * FROM ${kind} WHERE id = $1`, [id]);
    if (!row) throw new NotFoundException(`${kind === 'client' ? 'Client' : 'Partner'} not found`);
    return row as Row;
  }

  // ---------- What erasing would do ----------

  async plan(
    kind: PrivacySubject,
    id: string,
    m: EntityManager = this.ds.manager,
  ): Promise<ErasePlan> {
    const s = await this.subject(kind, id, m);
    const erased = !!s.erased_at;
    const name =
      kind === 'client' ? (s.name as string) : ((s.contact_person as string) ?? (s.firm as string));
    const col = kind === 'client' ? 'client_id' : 'partner_id';
    const active: { code: string }[] = await m.query(
      `SELECT code FROM wedding WHERE ${col} = $1 AND deleted_at IS NULL AND ${ACTIVE} ORDER BY number`,
      [id],
    );
    const blockers: string[] = [];
    if (erased) blockers.push('Already erased');
    if (active.length)
      blockers.push(
        `${active.map((w) => w.code).join(', ')} ${active.length === 1 ? 'is' : 'are'} still open. Finish ${active.length === 1 ? 'it' : 'them'} or mark lost first.`,
      );
    const keeps: string[] = [];
    if (kind === 'client') {
      const [{ invoices, payments, signed }] = await m.query(
        `SELECT (SELECT count(*)::int FROM invoice i JOIN wedding w ON w.id = i.wedding_id WHERE w.client_id = $1) AS invoices,
                (SELECT count(*)::int FROM payment p JOIN wedding w ON w.id = p.wedding_id
                  WHERE w.client_id = $1 AND p.direction = 'CLIENT_IN' AND p.deleted_at IS NULL) AS payments,
                (SELECT count(*)::int FROM document d JOIN wedding w ON w.id = d.wedding_id
                  WHERE w.client_id = $1 AND d.type = 'CLIENT_TERMS' AND d.status = 'SIGNED') AS signed`,
        [id],
      );
      if (invoices)
        keeps.push(
          `${invoices} tax invoice${invoices === 1 ? '' : 's'} with the billing name: ${TAX_HOLD}`,
        );
      if (payments)
        keeps.push(
          `${payments} payment record${payments === 1 ? '' : 's'} (amounts and dates): ${TAX_HOLD}`,
        );
      if (signed) keeps.push(`${signed} signed charter terms: a signed contract, kept as evidence`);
      keeps.push(
        'Wedding records (codes, dates, routes, prices) without the name or contact details',
      );
      keeps.push('Consent records (time, source, notice version), marked withdrawn, as proof');
      return {
        name,
        erased,
        blockers,
        erases: [
          'Name, phone, email, GSTIN, billing address and notes',
          'Website enquiries they sent',
          'Who documents were sent to, the messages, and "I accept" names on links',
          'Quote PDFs and unsigned charter terms',
          'Their details in the activity log',
        ],
        keeps,
      };
    }
    const [{ paid, owed }] = await m.query(
      `SELECT (SELECT count(*)::int FROM payment p WHERE p.partner_id = $1 AND p.deleted_at IS NULL) AS paid,
              (SELECT count(*)::int FROM wedding w JOIN quote q ON q.wedding_id = w.id AND q.status = 'ACCEPTED'
                WHERE w.partner_id = $1 AND w.status = 'DONE' AND w.deleted_at IS NULL
                  AND coalesce((q.totals->>'commission')::bigint, 0) >
                      coalesce((SELECT sum(p.amount) FROM payment p WHERE p.wedding_id = w.id
                                 AND p.direction = 'PARTNER_OUT' AND p.deleted_at IS NULL), 0)) AS owed`,
      [id],
    );
    if (owed)
      blockers.push(
        `Commission is still owed on ${owed} wedding${owed === 1 ? '' : 's'}. Pay it first.`,
      );
    if (paid) {
      keeps.push(
        `Firm name and GSTIN on ${paid} commission payment${paid === 1 ? '' : 's'}: ${TAX_HOLD}`,
      );
    }
    if (s.referral_signed)
      keeps.push('The signed referral agreement: a signed contract, kept as evidence');
    keeps.push('Consent records (time, source, notice version), marked withdrawn, as proof');
    return {
      name,
      erased,
      blockers,
      erases: [
        `Contact person, phone, email, website, Instagram, address${paid ? '' : ', firm name and GSTIN'}`,
        'Notes, fit note and the notes on every call or message logged',
        'Website enquiries and sign-ups they sent',
        'Who documents were sent to and the messages',
        'Unsigned referral agreement PDFs',
        'Their details in the activity log',
      ],
      keeps,
    };
  }

  // ---------- Export ----------

  /** Everything we hold about the person, in plain JSON. Never internal costs or margins (rule 4). */
  async export(kind: PrivacySubject, id: string) {
    const s = await this.subject(kind, id);
    const consents = await this.ds.query(
      `SELECT notice_version AS "noticeVersion", given_at AS "givenAt", source, withdrawn_at AS "withdrawnAt"
         FROM consent WHERE subject_type = $1 AND subject_id = $2 ORDER BY given_at`,
      [kind.toUpperCase(), id],
    );
    const col = kind === 'client' ? 'client_id' : 'partner_id';
    const enquiries = await this.ds.query(
      `SELECT source, created_at AS "receivedAt", payload FROM enquiry WHERE ${col} = $1 ORDER BY created_at`,
      [id],
    );
    const weddings: Row[] = await this.ds.query(
      `SELECT id, code, status, venue_city, starts_on::text, ends_on::text, lead_source
         FROM wedding WHERE ${col} = $1 AND deleted_at IS NULL ORDER BY number`,
      [id],
    );
    const shares = await this.ds.query(
      `SELECT w.code AS wedding, d.type AS document, s.channel, s.recipient, s.message_text AS message,
              s.shared_at AS "sharedAt", s.open_count AS "timesOpened",
              (SELECT json_agg(json_build_object('name', a.name, 'at', a.accepted_at)) FROM share_acceptance a
                WHERE a.share_id = s.id) AS acceptances
         FROM share s JOIN document_version dv ON dv.id = s.document_version_id
         JOIN document d ON d.id = dv.document_id
         LEFT JOIN wedding w ON w.id = d.wedding_id
        WHERE ${kind === 'client' ? `w.client_id = $1 AND d.type IN ('QUOTE', 'CLIENT_TERMS', 'INVOICE')` : `(d.partner_id = $1 AND d.type = 'REFERRAL_AGREEMENT')`}
        ORDER BY s.shared_at`,
      [id],
    );
    const base = {
      exportedAt: this.now(),
      about:
        'A copy of the personal data ShubhJets holds about you, under the Digital Personal Data Protection Act, 2023.',
      consents,
      enquiries,
      documentsSentToYou: shares,
    };
    let body: object;
    if (kind === 'client') {
      const ids = weddings.map((w) => w.id);
      const [quotes, payments, invoices, guests] = await Promise.all([
        this.ds.query(
          `SELECT wedding_id, version, status, valid_until AS "validUntil", accepted_at AS "acceptedAt",
                  accepted_name AS "acceptedName", (totals->>'total')::bigint AS total
             FROM quote WHERE wedding_id = ANY($1) AND status <> 'DRAFT' ORDER BY version`,
          [ids],
        ),
        this.ds.query(
          `SELECT wedding_id, amount, paid_on::text AS "paidOn", mode FROM payment
            WHERE wedding_id = ANY($1) AND direction = 'CLIENT_IN' AND deleted_at IS NULL ORDER BY created_at`,
          [ids],
        ),
        this.ds.query(
          `SELECT wedding_id, number, issued_on::text AS "issuedOn", total, cancelled_at AS "cancelledAt"
             FROM invoice WHERE wedding_id = ANY($1) ORDER BY issued_on`,
          [ids],
        ),
        this.ds.query(
          `SELECT l.wedding_id, count(*)::int AS n FROM guest g JOIN leg l ON l.id = g.leg_id
            WHERE l.wedding_id = ANY($1) GROUP BY 1`,
          [ids],
        ),
      ]);
      const of = (rows: Row[], w: Row) =>
        rows.filter((r) => r.wedding_id === w.id).map(({ wedding_id: _w, ...r }) => r);
      body = {
        ...base,
        you: {
          name: s.name,
          type: s.type,
          phone: s.phone,
          email: s.email,
          gstin: s.gstin,
          billingAddress: s.address,
          notes: s.notes,
          addedOn: s.created_at,
        },
        weddings: weddings.map((w) => ({
          code: w.code,
          status: w.status,
          venueCity: w.venue_city,
          startsOn: w.starts_on,
          endsOn: w.ends_on,
          quotes: of(quotes, w).map((q) => ({
            reference: quoteReference(w.code as string, q.version as number),
            status: q.status,
            totalPaise: Number(q.total ?? 0),
            validUntil: q.validUntil,
            acceptedAt: q.acceptedAt,
            acceptedName: q.acceptedName,
          })),
          paymentsReceived: of(payments, w).map((p) => ({ ...p, amount: Number(p.amount) })),
          invoices: of(invoices, w).map((i) => ({ ...i, total: Number(i.total) })),
          guestsOnManifest: (guests.find((g: Row) => g.wedding_id === w.id)?.n as number) ?? 0,
        })),
      };
    } else {
      const [activities, commission] = await Promise.all([
        this.ds.query(
          `SELECT kind, note, at FROM partner_activity WHERE partner_id = $1 ORDER BY at`,
          [id],
        ),
        this.ds.query(
          `SELECT w.code AS wedding, p.amount, p.status, p.paid_on::text AS "paidOn", p.tds_bps AS "tdsBps"
             FROM payment p JOIN wedding w ON w.id = p.wedding_id
            WHERE p.partner_id = $1 AND p.deleted_at IS NULL ORDER BY p.created_at`,
          [id],
        ),
      ]);
      body = {
        ...base,
        you: {
          firm: s.firm,
          type: s.type,
          contactPerson: s.contact_person,
          phone: s.phone,
          email: s.email,
          website: s.website,
          instagram: s.instagram,
          city: s.city,
          address: s.address,
          gstin: s.gstin,
          notes: s.notes,
          referralAgreementSigned: s.referral_signed,
          commission: { basis: s.commission_basis, percent: Number(s.commission_bps) / 100 },
          addedOn: s.created_at,
        },
        callsAndMessagesLogged: activities,
        weddingsReferred: weddings.map((w) => ({
          code: w.code,
          status: w.status,
          venueCity: w.venue_city,
          startsOn: w.starts_on,
        })),
        commissionPayments: commission.map((c: Row) => ({ ...c, amount: Number(c.amount) })),
      };
    }
    await this.audit.record({
      entity: kind,
      entityId: id,
      action: 'PERSONAL_DATA_EXPORTED',
      diff: null,
    });
    return body;
  }

  // ---------- Erase ----------

  async erase(kind: PrivacySubject, id: string) {
    const toPurge: string[] = [];
    const result = await this.ds.transaction(async (m) => {
      await m.query(`SELECT 1 FROM ${kind} WHERE id = $1 FOR UPDATE`, [id]);
      const plan = await this.plan(kind, id, m);
      const row = await this.subject(kind, id, m);
      const before = {
        name: (kind === 'client' ? row.name : row.contact_person) as string | null,
        phone: row.phone as string | null,
        email: row.email as string | null,
      };
      if (plan.blockers.length)
        throw new BadRequestException({
          message: plan.blockers.join(' '),
          blockers: plan.blockers,
        });
      const now = this.now();
      const col = kind === 'client' ? 'client_id' : 'partner_id';

      // Website enquiries they sent.
      await m.query(
        `UPDATE enquiry SET payload = '{"erased": true}', raw_text = NULL, ip_hash = NULL WHERE ${col} = $1`,
        [id],
      );
      // Consent records stay as proof, marked withdrawn.
      await m.query(
        `UPDATE consent SET withdrawn_at = coalesce(withdrawn_at, $3) WHERE subject_type = $1 AND subject_id = $2`,
        [kind.toUpperCase(), id, now],
      );

      // Documents: who they went to, the message and "I accept" names; PDFs not required by law.
      const docs: { id: string; type: string; status: string }[] = await m.query(
        kind === 'client'
          ? `SELECT d.id, d.type, d.status FROM document d JOIN wedding w ON w.id = d.wedding_id
              WHERE w.client_id = $1 AND d.type IN ('QUOTE', 'CLIENT_TERMS', 'INVOICE')`
          : `SELECT id, type, status FROM document WHERE partner_id = $1 AND type = 'REFERRAL_AGREEMENT'`,
        [id],
      );
      const docIds = docs.map((d) => d.id);
      await m.query(
        `UPDATE share SET recipient = NULL, message_text = NULL
          WHERE document_version_id IN (SELECT id FROM document_version WHERE document_id = ANY($1))`,
        [docIds],
      );
      await m.query(
        `UPDATE share_acceptance SET name = 'Erased', ip_hash = NULL, user_agent = NULL
          WHERE share_id IN (SELECT s.id FROM share s JOIN document_version dv ON dv.id = s.document_version_id
                              WHERE dv.document_id = ANY($1))`,
        [docIds],
      );
      const disposable = docs
        .filter((d) => d.type === 'QUOTE' || (d.type !== 'INVOICE' && d.status !== 'SIGNED'))
        .map((d) => d.id);
      const pdfs: { id: string; pdf_file_id: string | null }[] = await m.query(
        `SELECT id, pdf_file_id FROM document_version WHERE document_id = ANY($1) AND pdf_file_id IS NOT NULL`,
        [disposable],
      );
      toPurge.push(...pdfs.map((p) => p.pdf_file_id!));
      await m.query(`UPDATE document_version SET pdf_file_id = NULL WHERE id = ANY($1)`, [
        pdfs.map((p) => p.id),
      ]);

      let erased: string[];
      if (kind === 'client') {
        await m.query(
          `UPDATE quote SET accepted_name = CASE WHEN accepted_name IS NULL THEN NULL ELSE 'Erased' END
            WHERE wedding_id IN (SELECT id FROM wedding WHERE client_id = $1)`,
          [id],
        );
        await m.query(
          `UPDATE client SET name = $2, phone = NULL, email = NULL, gstin = NULL, address = NULL, notes = NULL,
                             deleted_at = coalesce(deleted_at, $3), erased_at = $3
            WHERE id = $1`,
          [id, ERASED_NAME.client, now],
        );
        erased = plan.erases;
      } else {
        const [{ paid }] = await m.query(
          `SELECT count(*)::int AS paid FROM payment WHERE partner_id = $1 AND deleted_at IS NULL`,
          [id],
        );
        await m.query(`UPDATE partner_activity SET note = NULL WHERE partner_id = $1`, [id]);
        await m.query(
          `UPDATE partner SET contact_person = NULL, phone = NULL, email = NULL, website = NULL, instagram = NULL,
                              source_link = NULL, fit_note = NULL, notes = NULL, address = NULL,
                              firm = CASE WHEN $2 THEN firm ELSE $3 END,
                              gstin = CASE WHEN $2 THEN gstin ELSE NULL END,
                              status = 'INACTIVE', next_follow_up_on = NULL,
                              deleted_at = coalesce(deleted_at, $4), erased_at = $4
            WHERE id = $1`,
          [id, paid > 0, ERASED_NAME.partner, now],
        );
        erased = plan.erases;
      }

      // Their name and number inside wedding notes (website enquiries write them there).
      const weddings: { id: string }[] = await m.query(`SELECT id FROM wedding WHERE ${col} = $1`, [
        id,
      ]);
      const wIds = weddings.map((w) => w.id);
      for (const v of [before.name, before.phone, before.email]) {
        if (!v || v.length < 3) continue;
        await m.query(
          `UPDATE wedding SET notes = replace(notes, $2, '[erased]') WHERE id = ANY($1) AND notes IS NOT NULL`,
          [wIds, v],
        );
      }

      // The activity log keeps that something changed, not the personal details.
      await m.query(
        `UPDATE audit_log SET diff = '{"erased": "personal details removed on request"}'
          WHERE diff IS NOT NULL
            AND ((entity = $1 AND entity_id = $2::text)
              OR (entity = 'partner_activity' AND $1 = 'partner'
                  AND entity_id IN (SELECT id::text FROM partner_activity WHERE partner_id = $2::uuid)))`,
        [kind, id],
      );
      await m.query(
        `UPDATE audit_log SET diff = diff - 'notes' - 'acceptedName'
          WHERE diff IS NOT NULL AND entity IN ('wedding', 'quote')
            AND (entity_id = ANY($1) OR entity_id IN (SELECT id::text FROM quote WHERE wedding_id::text = ANY($1)))`,
        [wIds],
      );
      await this.audit.record(
        {
          entity: kind,
          entityId: id,
          action: 'PERSONAL_DATA_ERASED',
          diff: { erased, kept: plan.keeps },
        },
        m,
      );
      return { erased, kept: plan.keeps };
    });
    // Files go after the database change is committed (a purge can't be rolled back).
    for (const f of toPurge) await this.files.purge(f);
    return result;
  }
}
