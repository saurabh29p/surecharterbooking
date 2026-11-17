import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  bankHint,
  deriveOperatorStatus,
  operatorChecklist,
  operatorExpiries,
  quotability,
  toIstDate,
  type BankDetails,
  type ChecklistItem,
  type Expiry,
  type IsoDate,
  type OperatorStatus,
} from '@shubhjets/shared';
import { IsNull, QueryFailedError, type DataSource, type EntityManager } from 'typeorm';
import { AuditService } from '../audit/audit.service.js';
import { EncryptionService } from '../crypto/encryption.service.js';
import { FilesService } from '../files/files.service.js';
import type {
  AircraftInput,
  ContactInput,
  CreateOperatorInput,
  DocumentInput,
  ListFilters,
  UpdateOperatorInput,
} from './operator.dto.js';
import {
  Aircraft,
  Operator,
  OperatorBase,
  OperatorContact,
  OperatorDocument,
} from './operator.entities.js';

const fieldErrors = (fields: Record<string, string>) =>
  new BadRequestException({ message: 'Please fix the highlighted fields', fields });

/** Turn unique-index violations into field messages. */
function uniqueViolation(err: unknown): never {
  if (err instanceof QueryFailedError) {
    const c = (err.driverError as { constraint?: string } | undefined)?.constraint;
    if (c === 'operator_nsop_key')
      throw fieldErrors({ nsopNo: 'Another operator already has this NSOP number' });
    if (c === 'operator_cin_key')
      throw fieldErrors({ cin: 'Another operator already has this CIN' });
    if (c === 'aircraft_registration_key')
      throw fieldErrors({ registration: 'An aircraft with this registration already exists' });
  }
  throw err;
}

export interface OperatorListItem {
  id: string;
  legalName: string;
  brand: string | null;
  status: OperatorStatus;
  statusReason: string | null;
  bases: string[];
  fleet: Record<string, number>;
  maxSeats: number | null;
  nearestExpiry: Expiry | null;
  weddingsDone: number;
  avgReplyHours: number | null;
  dgcaRank: number | null;
}

const PLAIN_FIELDS = [
  'legalName',
  'brand',
  'cin',
  'gstin',
  'nsopNo',
  'nsopIssuedOn',
  'website',
  'safetyDisclosureUrl',
  'sourceLink',
  'dgcaRank',
  'dgcaRankCheckedOn',
  'dgcaRankSource',
  'cancellationTerms',
  'notes',
] as const;

@Injectable()
export class OperatorsService {
  /** Injectable clock for tests and the daily job. */
  now: () => Date = () => new Date();

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly crypto: EncryptionService,
    private readonly files: FilesService,
    private readonly audit: AuditService,
  ) {}

  private today(): IsoDate {
    return toIstDate(this.now());
  }

  private async find(id: string, m: EntityManager = this.ds.manager): Promise<Operator> {
    const op = await m.getRepository(Operator).findOne({ where: { id, deletedAt: IsNull() } });
    if (!op) throw new NotFoundException('Operator not found');
    return op;
  }

  private async docs(m: EntityManager, operatorId: string) {
    return m
      .getRepository(OperatorDocument)
      .find({ where: { operatorId }, order: { createdAt: 'DESC' } });
  }

  private statusInput(op: Operator, docs: OperatorDocument[]) {
    return {
      nsopNo: op.nsopNo,
      safetyDisclosureUrl: op.safetyDisclosureUrl,
      verifiedByOwner: op.verifiedAt !== null,
      blockKind: op.blockKind === 'MANUAL' ? ('MANUAL' as const) : null,
      docs: docs.map((d) => ({ kind: d.kind, expiresOn: d.expiresOn, verifiedOn: d.verifiedOn })),
    };
  }

  /**
   * Recompute status from documents and dates (the single place status is written).
   * Expired documents block automatically; a renewed, verified document lifts that block.
   * Returns the operator after saving (audited when anything changed).
   */
  async refreshStatus(id: string, m: EntityManager = this.ds.manager): Promise<Operator> {
    const op = await this.find(id, m);
    const docs = await this.docs(m, id);
    const input = this.statusInput(op, docs);
    const today = this.today();
    const result = deriveOperatorStatus(input, today);
    const expiries = operatorExpiries(input, today);
    const next = {
      status: result.status,
      blockKind: result.blockKind,
      blockedReason:
        result.status === 'BLOCKED'
          ? op.blockKind === 'MANUAL'
            ? op.blockedReason
            : result.reason
          : null,
      blockedAt: result.status === 'BLOCKED' ? (op.blockedAt ?? this.now()) : null,
      nsopExpiresOn: expiries.find((e) => e.kind === 'NSOP')?.expiresOn ?? null,
      insuranceExpiresOn: expiries.find((e) => e.kind === 'INSURANCE')?.expiresOn ?? null,
    };
    const changed = (Object.keys(next) as (keyof typeof next)[]).some((k) =>
      k === 'blockedAt' ? (op[k] === null) !== (next[k] === null) : op[k] !== next[k],
    );
    if (!changed) return op;
    Object.assign(op, next);
    return m.getRepository(Operator).save(op);
  }

  async list(f: ListFilters): Promise<OperatorListItem[]> {
    const where: string[] = ['o.deleted_at IS NULL'];
    const params: unknown[] = [];
    const p = (v: unknown) => {
      params.push(v);
      return `$${params.length}`;
    };
    if (f.status?.length) where.push(`o.status = ANY(${p(f.status)})`);
    if (f.base)
      where.push(
        `EXISTS (SELECT 1 FROM operator_base b WHERE b.operator_id = o.id AND b.airport_iata = ${p(f.base)})`,
      );
    if (f.category || f.minSeats) {
      const conds = ['a.operator_id = o.id', 'a.deleted_at IS NULL'];
      if (f.category) conds.push(`a.category = ${p(f.category)}`);
      if (f.minSeats) conds.push(`a.seats >= ${p(f.minSeats)}`);
      where.push(`EXISTS (SELECT 1 FROM aircraft a WHERE ${conds.join(' AND ')})`);
    }
    if (f.q) {
      const like = p(`%${f.q.replace(/[%_\\]/g, '\\$&')}%`);
      where.push(
        `(o.legal_name ILIKE ${like} OR o.brand ILIKE ${like} OR o.nsop_no ILIKE ${like})`,
      );
    }
    const rows: Record<string, unknown>[] = await this.ds.query(
      `SELECT o.id, o.legal_name, o.brand, o.status, o.blocked_reason, o.dgca_rank, o.verified_at,
              o.nsop_expires_on, o.insurance_expires_on,
              coalesce((SELECT array_agg(b.airport_iata::text ORDER BY b.airport_iata) FROM operator_base b WHERE b.operator_id = o.id), '{}') AS bases,
              coalesce((SELECT json_object_agg(x.category, x.n) FROM (
                  SELECT category, count(*)::int AS n FROM aircraft a WHERE a.operator_id = o.id AND a.deleted_at IS NULL GROUP BY category) x), '{}') AS fleet,
              (SELECT max(seats) FROM aircraft a WHERE a.operator_id = o.id AND a.deleted_at IS NULL) AS max_seats,
              (SELECT count(DISTINCT r.wedding_id)::int FROM rate_response r
                 JOIN leg_choice lc ON lc.rate_response_id = r.id JOIN wedding w ON w.id = r.wedding_id
                 WHERE r.operator_id = o.id AND w.status IN ('FLYING', 'DONE')) AS weddings_done,
              (SELECT round((avg(extract(epoch FROM r.received_at - rq.sent_at)) / 3600)::numeric, 1)::float
                 FROM rate_response r JOIN rate_request rq ON rq.id = r.rate_request_id WHERE r.operator_id = o.id) AS avg_reply_hours
         FROM operator o
        WHERE ${where.join(' AND ')}
        ORDER BY CASE o.status WHEN 'VERIFIED' THEN 0 WHEN 'EXPIRING_SOON' THEN 1 WHEN 'FOUND' THEN 2 ELSE 3 END, o.legal_name`,
      params,
    );
    const today = this.today();
    return rows.map((r) => {
      const expiries: Expiry[] = [];
      for (const [kind, col] of [
        ['NSOP', 'nsop_expires_on'],
        ['INSURANCE', 'insurance_expires_on'],
      ] as const) {
        const d = r[col] as string | null;
        if (d && r.verified_at)
          expiries.push({
            kind,
            expiresOn: d,
            daysLeft: Math.round((Date.parse(d) - Date.parse(today)) / 86_400_000),
          });
      }
      expiries.sort((a, b) => a.daysLeft - b.daysLeft);
      const status = r.status as OperatorStatus;
      return {
        id: r.id as string,
        legalName: r.legal_name as string,
        brand: r.brand as string | null,
        status,
        statusReason:
          status === 'BLOCKED'
            ? (r.blocked_reason as string)
            : status === 'EXPIRING_SOON' && expiries[0]
              ? `${expiries[0].kind === 'NSOP' ? 'NSOP permit' : 'Insurance'} expires in ${expiries[0].daysLeft} days`
              : status === 'FOUND'
                ? 'Not verified yet'
                : null,
        bases: r.bases as string[],
        fleet: r.fleet as Record<string, number>,
        maxSeats: (r.max_seats as number | null) ?? null,
        nearestExpiry: expiries[0] ?? null,
        weddingsDone: r.weddings_done as number,
        avgReplyHours: (r.avg_reply_hours as number | null) ?? null,
        dgcaRank: (r.dgca_rank as number | null) ?? null,
      };
    });
  }

  async get(id: string) {
    const m = this.ds.manager;
    const op = await this.find(id, m);
    const [bases, contacts, aircraft, docs] = await Promise.all([
      m
        .getRepository(OperatorBase)
        .find({ where: { operatorId: id }, order: { airportIata: 'ASC' } }),
      m
        .getRepository(OperatorContact)
        .find({ where: { operatorId: id }, order: { isPrimary: 'DESC', createdAt: 'ASC' } }),
      m.getRepository(Aircraft).find({
        where: { operatorId: id, deletedAt: IsNull() },
        order: { category: 'ASC', seats: 'DESC' },
      }),
      this.docs(m, id),
    ]);
    const input = this.statusInput(op, docs);
    const today = this.today();
    const checklist: ChecklistItem[] = operatorChecklist(input, today);
    const stats = (await this.list({ q: undefined })).find((x) => x.id === id);
    return {
      id: op.id,
      legalName: op.legalName,
      brand: op.brand,
      cin: op.cin,
      gstin: op.gstin,
      nsopNo: op.nsopNo,
      nsopIssuedOn: op.nsopIssuedOn,
      website: op.website,
      safetyDisclosureUrl: op.safetyDisclosureUrl,
      sourceLink: op.sourceLink,
      dgcaRank: op.dgcaRank,
      dgcaRankCheckedOn: op.dgcaRankCheckedOn,
      dgcaRankSource: op.dgcaRankSource,
      cancellationTerms: op.cancellationTerms,
      notes: op.notes,
      status: op.status,
      statusReason: deriveOperatorStatus(input, today).reason,
      blockKind: op.blockKind,
      blockedReason: op.blockedReason,
      verifiedAt: op.verifiedAt,
      hasBankDetails: op.bankHint !== null,
      bankHint: op.bankHint,
      bases: bases.map((b) => b.airportIata),
      contacts,
      aircraft,
      documents: docs,
      checklist,
      readyToVerify: checklist.every((c) => !c.required || c.done),
      expiries: operatorExpiries(input, today),
      quotable: quotability(input, today),
      weddingsDone: stats?.weddingsDone ?? 0,
      avgReplyHours: stats?.avgReplyHours ?? null,
    };
  }

  private applyBank(op: Operator, bank: BankDetails | null | undefined) {
    if (bank === undefined) return;
    op.bankDetailsEnc = bank ? this.crypto.encryptJson(bank) : null;
    op.bankHint = bank ? bankHint(bank) : null;
  }

  private async setBases(m: EntityManager, id: string, bases: string[] | undefined) {
    if (!bases) return;
    const unique = [...new Set(bases)];
    if (unique.length) {
      const known: { iata: string }[] = await m.query(
        `SELECT iata FROM airport WHERE iata = ANY($1)`,
        [unique],
      );
      const missing = unique.filter((b) => !known.some((k) => k.iata === b));
      if (missing.length)
        throw fieldErrors({ bases: `Unknown airport code: ${missing.join(', ')}` });
    }
    const before = (await m.getRepository(OperatorBase).find({ where: { operatorId: id } }))
      .map((b) => b.airportIata)
      .sort();
    if (JSON.stringify(before) === JSON.stringify([...unique].sort())) return;
    await m.getRepository(OperatorBase).delete({ operatorId: id });
    if (unique.length)
      await m
        .getRepository(OperatorBase)
        .insert(unique.map((airportIata) => ({ operatorId: id, airportIata })));
    await this.audit.record(
      {
        entity: 'operator',
        entityId: id,
        action: 'UPDATED',
        diff: { bases: { from: before, to: [...unique].sort() } },
      },
      m,
    );
  }

  /** Imported or added operators always start as FOUND: only you can verify them. */
  async create(input: CreateOperatorInput, userId: string): Promise<{ id: string }> {
    try {
      return await this.ds.transaction(async (m) => {
        const repo = m.getRepository(Operator);
        const op = repo.create({
          status: 'FOUND',
          blockKind: null,
          blockedReason: null,
          blockedAt: null,
          verifiedAt: null,
          verifiedBy: null,
          bankDetailsEnc: null,
          bankHint: null,
          deletedAt: null,
          nsopExpiresOn: null,
          insuranceExpiresOn: null,
          createdBy: userId,
        });
        for (const f of PLAIN_FIELDS)
          (op as unknown as Record<string, unknown>)[f] = input[f] ?? null;
        this.applyBank(op, input.bankDetails);
        const saved = await repo.save(op);
        await this.setBases(m, saved.id, input.bases);
        return { id: saved.id };
      });
    } catch (err) {
      uniqueViolation(err);
    }
  }

  async update(id: string, input: UpdateOperatorInput): Promise<void> {
    try {
      await this.ds.transaction(async (m) => {
        const op = await this.find(id, m);
        for (const f of PLAIN_FIELDS) {
          const v = input[f];
          if (v === undefined) continue;
          if (f === 'legalName' && !v) continue;
          (op as unknown as Record<string, unknown>)[f] = v;
        }
        this.applyBank(op, input.bankDetails);
        await m.getRepository(Operator).save(op);
        await this.setBases(m, id, input.bases);
        // The NSOP number is part of the checklist, so status may change.
        await this.refreshStatus(id, m);
      });
    } catch (err) {
      uniqueViolation(err);
    }
  }

  /** "Mark as verified": allowed only when every required checklist item is done. */
  async verify(id: string, userId: string): Promise<void> {
    await this.ds.transaction(async (m) => {
      const op = await this.find(id, m);
      if (op.blockKind === 'MANUAL') throw new ConflictException('Unblock this operator first');
      const missing = operatorChecklist(
        this.statusInput(op, await this.docs(m, id)),
        this.today(),
      ).filter((c) => c.required && !c.done);
      if (missing.length) {
        throw new ConflictException({
          message: 'Finish the checklist before verifying',
          missing: missing.map((c) => c.label),
        });
      }
      if (!op.verifiedAt) {
        op.verifiedAt = this.now();
        op.verifiedBy = userId;
        await m.getRepository(Operator).save(op);
      }
      await this.refreshStatus(id, m);
    });
  }

  async block(id: string, reason: string): Promise<void> {
    await this.ds.transaction(async (m) => {
      const op = await this.find(id, m);
      op.status = 'BLOCKED';
      op.blockKind = 'MANUAL';
      op.blockedReason = reason;
      op.blockedAt = this.now();
      await m.getRepository(Operator).save(op);
    });
  }

  /** Lifts a manual block; status goes back to whatever the documents say. */
  async unblock(id: string): Promise<void> {
    await this.ds.transaction(async (m) => {
      const op = await this.find(id, m);
      if (op.blockKind !== 'MANUAL')
        throw new ConflictException('This operator is not blocked by you');
      op.blockKind = null;
      op.blockedReason = null;
      op.blockedAt = null;
      op.status = 'FOUND';
      await m.getRepository(Operator).save(op);
      await this.refreshStatus(id, m);
    });
  }

  /**
   * Hard rule 1: throws unless the operator may be chosen for a leg or quote.
   * Checks dates live, so it holds even if the daily job hasn't run yet today.
   */
  async assertQuotable(id: string, m: EntityManager = this.ds.manager): Promise<void> {
    const op = await this.find(id, m);
    const result = quotability(this.statusInput(op, await this.docs(m, id)), this.today());
    if (!result.ok) {
      const name = op.brand ?? op.legalName;
      throw new ConflictException({
        message: `${name} can't be quoted: ${result.reason}`,
        reason: result.reason,
      });
    }
  }

  // ---------- Documents ----------

  async addDocument(
    id: string,
    input: DocumentInput,
    upload: { buffer: Buffer; originalName: string },
  ): Promise<OperatorDocument> {
    await this.find(id);
    const file = await this.files.upload({ ...upload, purpose: 'operator-document' });
    return this.ds.transaction(async (m) => {
      const repo = m.getRepository(OperatorDocument);
      return repo.save(
        repo.create({
          operatorId: id,
          kind: input.kind,
          fileId: file.id,
          expiresOn: input.expiresOn ?? null,
          notes: input.notes ?? null,
          verifiedOn: null,
          verifiedBy: null,
        }),
      );
    });
  }

  /** "Verified by me on <today>": you have opened the document and checked it against the operator. */
  async verifyDocument(docId: string, userId: string): Promise<void> {
    await this.ds.transaction(async (m) => {
      const repo = m.getRepository(OperatorDocument);
      const doc = await repo.findOneBy({ id: docId });
      if (!doc) throw new NotFoundException('Document not found');
      if (!doc.verifiedOn) {
        if ((doc.kind === 'NSOP' || doc.kind === 'INSURANCE') && !doc.expiresOn) {
          throw fieldErrors({ expiresOn: 'Add the expiry date before verifying' });
        }
        doc.verifiedOn = this.today();
        doc.verifiedBy = userId;
        await repo.save(doc);
      }
      await this.refreshStatus(doc.operatorId, m);
    });
  }

  async updateDocument(
    docId: string,
    input: { expiresOn?: string | null; notes?: string | null },
  ): Promise<void> {
    await this.ds.transaction(async (m) => {
      const repo = m.getRepository(OperatorDocument);
      const doc = await repo.findOneBy({ id: docId });
      if (!doc) throw new NotFoundException('Document not found');
      if (input.expiresOn !== undefined && input.expiresOn !== doc.expiresOn) {
        doc.expiresOn = input.expiresOn;
        // A changed expiry date must be checked again.
        doc.verifiedOn = null;
        doc.verifiedBy = null;
      }
      if (input.notes !== undefined) doc.notes = input.notes;
      await repo.save(doc);
      await this.refreshStatus(doc.operatorId, m);
    });
  }

  async deleteDocument(docId: string): Promise<void> {
    const fileId = await this.ds.transaction(async (m) => {
      const repo = m.getRepository(OperatorDocument);
      const doc = await repo.findOneBy({ id: docId });
      if (!doc) throw new NotFoundException('Document not found');
      await repo.remove(doc);
      await this.refreshStatus(doc.operatorId, m);
      return doc.fileId;
    });
    if (fileId) await this.files.purge(fileId);
  }

  // ---------- Aircraft ----------

  async addAircraft(id: string, input: AircraftInput): Promise<Aircraft> {
    await this.find(id);
    try {
      const repo = this.ds.getRepository(Aircraft);
      return await repo.save(
        repo.create({
          operatorId: id,
          type: input.type,
          registration: input.registration ?? null,
          category: input.category as Aircraft['category'],
          seats: input.seats,
          year: input.year ?? null,
          baseAirport: input.baseAirport ?? null,
          deletedAt: null,
        }),
      );
    } catch (err) {
      uniqueViolation(err);
    }
  }

  async updateAircraft(aircraftId: string, input: Partial<AircraftInput>): Promise<Aircraft> {
    const repo = this.ds.getRepository(Aircraft);
    const a = await repo.findOneBy({ id: aircraftId, deletedAt: IsNull() });
    if (!a) throw new NotFoundException('Aircraft not found');
    for (const k of ['type', 'registration', 'category', 'seats', 'year', 'baseAirport'] as const) {
      if (input[k] !== undefined) (a as unknown as Record<string, unknown>)[k] = input[k];
    }
    try {
      return await repo.save(a);
    } catch (err) {
      uniqueViolation(err);
    }
  }

  /** Aircraft are archived, not deleted, because old rate replies may point at them. */
  async removeAircraft(aircraftId: string): Promise<void> {
    const repo = this.ds.getRepository(Aircraft);
    const a = await repo.findOneBy({ id: aircraftId, deletedAt: IsNull() });
    if (!a) throw new NotFoundException('Aircraft not found');
    a.deletedAt = this.now();
    await repo.save(a);
  }

  // ---------- Contacts ----------

  async addContact(id: string, input: ContactInput): Promise<OperatorContact> {
    await this.find(id);
    return this.ds.transaction(async (m) => {
      const repo = m.getRepository(OperatorContact);
      const first = (await repo.count({ where: { operatorId: id } })) === 0;
      const primary = input.isPrimary ?? first;
      if (primary) await this.clearPrimary(m, id);
      return repo.save(
        repo.create({
          operatorId: id,
          name: input.name,
          role: input.role ?? null,
          phone: input.phone ?? null,
          email: input.email ?? null,
          isPrimary: primary,
        }),
      );
    });
  }

  private async clearPrimary(m: EntityManager, operatorId: string) {
    const repo = m.getRepository(OperatorContact);
    for (const c of await repo.find({ where: { operatorId, isPrimary: true } })) {
      c.isPrimary = false;
      await repo.save(c);
    }
  }

  async updateContact(contactId: string, input: Partial<ContactInput>): Promise<OperatorContact> {
    return this.ds.transaction(async (m) => {
      const repo = m.getRepository(OperatorContact);
      const c = await repo.findOneBy({ id: contactId });
      if (!c) throw new NotFoundException('Contact not found');
      if (input.isPrimary && !c.isPrimary) await this.clearPrimary(m, c.operatorId);
      for (const k of ['name', 'role', 'phone', 'email', 'isPrimary'] as const) {
        if (input[k] !== undefined) (c as unknown as Record<string, unknown>)[k] = input[k];
      }
      return repo.save(c);
    });
  }

  async removeContact(contactId: string): Promise<void> {
    const repo = this.ds.getRepository(OperatorContact);
    const c = await repo.findOneBy({ id: contactId });
    if (!c) throw new NotFoundException('Contact not found');
    await repo.remove(c);
  }

  /** Full bank details for paying the operator; every view is audited. */
  async revealBankDetails(id: string): Promise<BankDetails | null> {
    const op = await this.ds
      .getRepository(Operator)
      .createQueryBuilder('o')
      .addSelect('o.bankDetailsEnc')
      .where('o.id = :id AND o.deleted_at IS NULL', { id })
      .getOne();
    if (!op) throw new NotFoundException('Operator not found');
    if (!op.bankDetailsEnc) return null;
    await this.audit.record({ entity: 'operator', entityId: id, action: 'BANK_DETAILS_VIEWED' });
    return this.crypto.decryptJson<BankDetails>(op.bankDetailsEnc);
  }

  /** Every operator id, for the daily expiry job. */
  async allIds(): Promise<string[]> {
    const rows: { id: string }[] = await this.ds.query(
      `SELECT id FROM operator WHERE deleted_at IS NULL`,
    );
    return rows.map((r) => r.id);
  }
}
