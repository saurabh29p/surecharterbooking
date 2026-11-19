import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  IMPORT_COLUMNS,
  parseCategory,
  parsePartnerType,
  suggestMapping,
  websiteDomain,
  type ImportAction,
  type ImportKind,
} from '@shubhjets/shared';
import { parse } from 'csv-parse/sync';
import { QueryFailedError, type DataSource, type EntityManager } from 'typeorm';
import { AuditService } from '../audit/audit.service.js';
import { ConsentService } from '../clients/consent.service.js';
import { AircraftBody, ContactBody, CreateOperatorBody } from '../operators/operator.dto.js';
import {
  Aircraft,
  Operator,
  OperatorBase,
  OperatorContact,
} from '../operators/operator.entities.js';
import { PartnerFields, type PartnerInput } from '../partners/partner.dto.js';
import { Partner } from '../partners/partner.entities.js';
import { PartnersService } from '../partners/partners.service.js';

export const MAX_CSV_BYTES = 2 * 1024 * 1024;
export const MAX_CSV_ROWS = 2000;

export type Mapping = Record<string, number | null>;

export interface Duplicate {
  id: string;
  name: string;
  matchedOn: string[];
}

export interface PreviewRow {
  /** Line number in the file (the header is line 1). */
  row: number;
  values: Record<string, string>;
  problems: string[];
  duplicates: Duplicate[];
  /** An earlier line in the same file with the same phone / email / website / NSOP number. */
  sameAsRow: number | null;
  suggested: ImportAction;
}

export interface Preview {
  kind: ImportKind;
  headers: string[];
  mapping: Mapping;
  /** Required fields with no matching column. */
  unmapped: string[];
  rows: PreviewRow[];
  summary: { total: number; ready: number; withProblems: number; duplicates: number };
}

interface OperatorRow {
  op: ReturnType<typeof CreateOperatorBody.parse>;
  aircraft: ReturnType<typeof AircraftBody.parse>[];
  contacts: ReturnType<typeof ContactBody.parse>[];
}

const PARTNER_FIELD_KEYS: Record<string, string> = {
  type: 'type',
  firm: 'firm',
  city: 'city',
  contactPerson: 'contact_person',
  phone: 'phone',
  email: 'email',
  website: 'website',
  instagram: 'instagram',
  sourceLink: 'source_link',
  fitNote: 'fit_note',
};
const OPERATOR_FIELD_KEYS: Record<string, string> = {
  legalName: 'legal_name',
  brand: 'brand',
  nsopNo: 'nsop_no',
  bases: 'bases',
  website: 'website',
  safetyDisclosureUrl: 'safety_disclosure_url',
  sourceLink: 'source_link',
};

const label = (kind: ImportKind, key: string) =>
  IMPORT_COLUMNS[kind].find((c) => c.key === key)?.label ?? key;
const blank = (v: string | undefined) => !v || v.trim() === '';
const splitList = (v: string | undefined) =>
  (v ?? '')
    .split(/[;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * CSV import (BRIEF.md §5.3): upload → preview with column mapping and duplicates →
 * you choose skip / merge / add per row → import in one transaction.
 * Nothing is stored at preview time; commit re-reads and re-checks the same file.
 */
@Injectable()
export class ImportsService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly partners: PartnersService,
    private readonly consents: ConsentService,
    private readonly audit: AuditService,
  ) {}

  /** Read the CSV text into a header row and data rows, with plain-language errors. */
  parseCsv(text: string): { headers: string[]; rows: string[][] } {
    if (Buffer.byteLength(text, 'utf8') > MAX_CSV_BYTES) {
      throw new BadRequestException('That file is bigger than 2 MB. Split it into smaller files.');
    }
    let records: string[][];
    try {
      records = parse(text, {
        bom: true,
        skip_empty_lines: true,
        relax_column_count: true,
        trim: true,
      }) as string[][];
    } catch (err) {
      throw new BadRequestException(
        `This doesn't look like a valid CSV file: ${(err as Error).message.split('\n')[0]}`,
      );
    }
    records = records.filter((r) => r.some((c) => c !== ''));
    if (records.length === 0) throw new BadRequestException('The file is empty');
    const [headers, ...rows] = records as [string[], ...string[][]];
    if (rows.length === 0)
      throw new BadRequestException('The file has a header row but no data rows');
    if (rows.length > MAX_CSV_ROWS)
      throw new BadRequestException(
        `At most ${MAX_CSV_ROWS} rows per file; this one has ${rows.length}.`,
      );
    return { headers, rows };
  }

  async preview(
    kind: ImportKind,
    csv: string,
    mapping?: Mapping,
    m: EntityManager = this.ds.manager,
  ): Promise<Preview> {
    const { headers, rows } = this.parseCsv(csv);
    const used = this.resolveMapping(kind, headers, mapping);
    const unmapped = IMPORT_COLUMNS[kind]
      .filter((c) => c.required && used[c.key] === null)
      .map((c) => c.label);
    const known = await this.airportCodes(m);
    const seen = new Map<string, number>();
    const out: PreviewRow[] = [];
    for (const [i, cells] of rows.entries()) {
      const rowNo = i + 2;
      const values: Record<string, string> = {};
      for (const col of IMPORT_COLUMNS[kind]) {
        const idx = used[col.key];
        values[col.key] = idx === null || idx === undefined ? '' : (cells[idx] ?? '').trim();
      }
      const problems: string[] = [];
      let keys: string[] = [];
      let duplicates: Duplicate[] = [];
      if (kind === 'partners') {
        const parsed = this.parsePartner(values, problems);
        if (parsed) {
          keys = [
            parsed.phone && `phone:${parsed.phone}`,
            parsed.email && `email:${parsed.email}`,
            websiteDomain(parsed.website) && `web:${websiteDomain(parsed.website)}`,
          ].filter((k): k is string => !!k);
          duplicates = (await this.partners.findDuplicates(parsed, undefined, m)).map((d) => ({
            id: d.id,
            name: d.firm,
            matchedOn: d.matchedOn,
          }));
        }
      } else {
        const parsed = this.parseOperator(values, problems, known);
        if (parsed) {
          const domain = websiteDomain(parsed.op.website);
          keys = [parsed.op.nsopNo && `nsop:${parsed.op.nsopNo}`, domain && `web:${domain}`].filter(
            (k): k is string => !!k,
          );
          duplicates = await this.operatorDuplicates(m, parsed.op.nsopNo ?? null, domain);
        }
      }
      const sameAsRow = keys.map((k) => seen.get(k)).find((r) => r !== undefined) ?? null;
      for (const k of keys) if (!seen.has(k)) seen.set(k, rowNo);
      const suggested: ImportAction =
        problems.length || sameAsRow ? 'skip' : duplicates.length ? 'merge' : 'add';
      out.push({ row: rowNo, values, problems, duplicates, sameAsRow, suggested });
    }
    return {
      kind,
      headers,
      mapping: used,
      unmapped,
      rows: out,
      summary: {
        total: out.length,
        ready: out.filter((r) => r.suggested === 'add').length,
        withProblems: out.filter((r) => r.problems.length).length,
        duplicates: out.filter((r) => r.duplicates.length || r.sameAsRow).length,
      },
    };
  }

  private async airportCodes(m: EntityManager): Promise<Set<string>> {
    const rows: { iata: string }[] = await m.query(`SELECT iata FROM airport`);
    return new Set(rows.map((r) => r.iata));
  }

  private resolveMapping(kind: ImportKind, headers: string[], given?: Mapping): Mapping {
    const auto = suggestMapping(kind, headers);
    if (!given) return auto;
    const out: Mapping = {};
    for (const col of IMPORT_COLUMNS[kind]) {
      const v = given[col.key] === undefined ? auto[col.key] : given[col.key];
      if (v !== null && v !== undefined && (!Number.isInteger(v) || v < 0 || v >= headers.length)) {
        throw new BadRequestException(`Column choice for ${col.label} is not in the file`);
      }
      out[col.key] = v ?? null;
    }
    return out;
  }

  private issues(
    kind: ImportKind,
    keys: Record<string, string>,
    error: { issues: { path: PropertyKey[]; message: string }[] },
    problems: string[],
  ) {
    for (const issue of error.issues) {
      const field = String(issue.path[0] ?? '');
      problems.push(`${label(kind, keys[field] ?? field)}: ${issue.message}`);
    }
  }

  private parsePartner(v: Record<string, string>, problems: string[]): PartnerInput | null {
    const type = parsePartnerType(v.type ?? '');
    if (!type)
      problems.push(
        blank(v.type)
          ? 'Type: required (planner, hotel or other)'
          : `Type: "${v.type}" is not planner, hotel or other`,
      );
    const res = PartnerFields.safeParse({
      type: type ?? 'OTHER',
      firm: v.firm ?? '',
      city: v.city,
      contactPerson: v.contact_person,
      phone: v.phone,
      email: v.email,
      website: v.website,
      instagram: v.instagram,
      sourceLink: v.source_link,
      fitNote: v.fit_note,
    });
    if (!res.success) this.issues('partners', PARTNER_FIELD_KEYS, res.error, problems);
    return res.success && type ? res.data : null;
  }

  private parseOperator(
    v: Record<string, string>,
    problems: string[],
    known: Set<string>,
  ): OperatorRow | null {
    const bases = splitList(v.bases).map((b) => b.toUpperCase());
    const unknown = bases.filter((b) => !known.has(b));
    if (unknown.length) problems.push(`Bases: unknown airport code ${unknown.join(', ')}`);
    const res = CreateOperatorBody.safeParse({
      legalName: v.legal_name ?? '',
      brand: v.brand,
      nsopNo: v.nsop_no,
      website: v.website,
      safetyDisclosureUrl: v.safety_disclosure_url,
      sourceLink: v.source_link,
      bases: bases.filter((b) => known.has(b)),
    });
    if (!res.success) this.issues('operators', OPERATOR_FIELD_KEYS, res.error, problems);

    const aircraft: OperatorRow['aircraft'] = [];
    for (const [i, entry] of splitList(v.aircraft).entries()) {
      const [type = '', registration = '', category = '', seats = ''] = entry
        .split('|')
        .map((s) => s.trim());
      const cat = parseCategory(category);
      const a = AircraftBody.safeParse({
        type,
        registration,
        category: cat ?? category,
        seats: Number(seats),
      });
      if (!cat)
        problems.push(
          `Aircraft ${i + 1}: category "${category}" should be turboprop, light, midsize, super-midsize, heavy, helicopter or twin helicopter`,
        );
      else if (!a.success)
        problems.push(...a.error.issues.map((x) => `Aircraft ${i + 1}: ${x.message}`));
      else aircraft.push(a.data);
    }
    const contacts: OperatorRow['contacts'] = [];
    for (const [i, entry] of splitList(v.contacts).entries()) {
      const [name = '', phone = '', email = ''] = entry.split('|').map((s) => s.trim());
      const c = ContactBody.safeParse({ name, phone, email });
      if (!c.success) problems.push(...c.error.issues.map((x) => `Contact ${i + 1}: ${x.message}`));
      else contacts.push(c.data);
    }
    return res.success && problems.length === 0 ? { op: res.data, aircraft, contacts } : null;
  }

  private async operatorDuplicates(
    m: EntityManager,
    nsopNo: string | null,
    domain: string | null,
  ): Promise<Duplicate[]> {
    if (!nsopNo && !domain) return [];
    const rows: {
      id: string;
      legal_name: string;
      nsop_no: string | null;
      website: string | null;
    }[] = await m.query(
      `SELECT id, legal_name, nsop_no, website FROM operator
        WHERE deleted_at IS NULL
          AND (($1::text IS NOT NULL AND nsop_no IS NOT NULL AND upper(nsop_no) = upper($1))
            OR ($2::text IS NOT NULL AND website ILIKE $2))`,
      [nsopNo ?? null, domain ? `%${domain}%` : null],
    );
    return rows
      .map((r) => ({
        id: r.id,
        name: r.legal_name,
        matchedOn: [
          ...(nsopNo && r.nsop_no?.toUpperCase() === nsopNo.toUpperCase() ? ['NSOP number'] : []),
          ...(domain && websiteDomain(r.website) === domain ? ['website'] : []),
        ],
      }))
      .filter((d) => d.matchedOn.length > 0);
  }

  /**
   * Import with your choices (row number → add / merge / skip; missing rows use the suggestion).
   * All or nothing: if any row fails, nothing is saved.
   */
  async commit(
    kind: ImportKind,
    csv: string,
    mapping: Mapping | undefined,
    decisions: Record<string, ImportAction>,
    userId: string,
  ) {
    const result = { added: [] as string[], merged: [] as string[], skipped: 0 };
    await this.ds.transaction(async (m) => {
      const preview = await this.preview(kind, csv, mapping, m);
      if (preview.unmapped.length)
        throw new BadRequestException(`Choose a column for: ${preview.unmapped.join(', ')}`);
      const known = await this.airportCodes(m);
      for (const row of preview.rows) {
        const action = decisions[String(row.row)] ?? row.suggested;
        if (action === 'skip') {
          result.skipped++;
          continue;
        }
        if (row.problems.length) {
          throw new BadRequestException(
            `Line ${row.row} has problems (${row.problems[0]}). Fix the file or skip that line.`,
          );
        }
        if (action === 'merge' && !row.duplicates.length) {
          throw new BadRequestException(
            `Line ${row.row} has nothing to merge into. Choose add or skip.`,
          );
        }
        try {
          if (kind === 'partners') {
            const input = this.parsePartner(row.values, [])!;
            const id =
              action === 'merge'
                ? await this.mergePartner(m, row.duplicates[0]!.id, input)
                : await this.addPartner(m, input, userId);
            (action === 'merge' ? result.merged : result.added).push(id);
          } else {
            const input = this.parseOperator(row.values, [], known)!;
            const id =
              action === 'merge'
                ? await this.mergeOperator(m, row.duplicates[0]!.id, input)
                : await this.addOperator(m, input, userId);
            (action === 'merge' ? result.merged : result.added).push(id);
          }
        } catch (err) {
          if (err instanceof QueryFailedError) {
            throw new BadRequestException(
              `Line ${row.row} clashes with an existing record (same NSOP number or registration). Merge or skip it.`,
            );
          }
          throw err;
        }
      }
      await this.audit.record(
        {
          entity: 'import',
          entityId: kind,
          action: 'IMPORTED',
          diff: {
            kind,
            rows: preview.rows.length,
            added: result.added.length,
            merged: result.merged.length,
            skipped: result.skipped,
          },
        },
        m,
      );
    });
    return {
      added: result.added.length,
      merged: result.merged.length,
      skipped: result.skipped,
      addedIds: result.added,
      mergedIds: result.merged,
    };
  }

  private async addPartner(m: EntityManager, input: PartnerInput, userId: string): Promise<string> {
    const { id } = await this.partners.create({ ...input, status: 'IMPORTED' }, userId, m);
    // Contact details from a public business listing: recorded as such (see docs/DECISIONS.md).
    await this.consents.record(
      { subjectType: 'PARTNER', subjectId: id, source: 'RESEARCH_IMPORT' },
      m,
    );
    return id;
  }

  /** Merge fills empty fields only; it never overwrites what you already have. */
  private async mergePartner(m: EntityManager, id: string, input: PartnerInput): Promise<string> {
    const repo = m.getRepository(Partner);
    const p = await repo.findOneByOrFail({ id });
    for (const k of [
      'city',
      'contactPerson',
      'phone',
      'email',
      'website',
      'instagram',
      'sourceLink',
      'fitNote',
    ] as const) {
      if (!p[k] && input[k]) p[k] = input[k] ?? null;
    }
    await repo.save(p);
    return id;
  }

  private async addOperator(m: EntityManager, row: OperatorRow, userId: string): Promise<string> {
    const repo = m.getRepository(Operator);
    const op = await repo.save(
      repo.create({
        legalName: row.op.legalName,
        brand: row.op.brand ?? null,
        nsopNo: row.op.nsopNo ?? null,
        website: row.op.website ?? null,
        safetyDisclosureUrl: row.op.safetyDisclosureUrl ?? null,
        sourceLink: row.op.sourceLink ?? null,
        // Imported operators are never verified: you check their documents first (rule 1).
        status: 'FOUND',
        blockKind: null,
        blockedReason: null,
        blockedAt: null,
        verifiedAt: null,
        verifiedBy: null,
        bankDetailsEnc: null,
        bankHint: null,
        deletedAt: null,
        cin: null,
        gstin: null,
        nsopIssuedOn: null,
        nsopExpiresOn: null,
        insuranceExpiresOn: null,
        dgcaRank: null,
        dgcaRankCheckedOn: null,
        dgcaRankSource: null,
        cancellationTerms: null,
        notes: null,
        createdBy: userId,
      }),
    );
    await this.addOperatorExtras(m, op.id, row);
    return op.id;
  }

  private async addOperatorExtras(m: EntityManager, id: string, row: OperatorRow) {
    const bases = new Set(
      (await m.getRepository(OperatorBase).find({ where: { operatorId: id } })).map(
        (b) => b.airportIata,
      ),
    );
    const newBases = (row.op.bases ?? []).filter((b) => !bases.has(b));
    if (newBases.length)
      await m
        .getRepository(OperatorBase)
        .insert(newBases.map((airportIata) => ({ operatorId: id, airportIata })));

    const fleet = await m.getRepository(Aircraft).find({ where: { operatorId: id } });
    for (const a of row.aircraft) {
      const exists = fleet.some((f) =>
        a.registration
          ? f.registration === a.registration
          : !f.registration &&
            f.type.toLowerCase() === a.type.toLowerCase() &&
            f.category === a.category,
      );
      if (exists) continue;
      await m.getRepository(Aircraft).save(
        m.getRepository(Aircraft).create({
          operatorId: id,
          type: a.type,
          registration: a.registration ?? null,
          category: a.category as Aircraft['category'],
          seats: a.seats,
          year: null,
          baseAirport: row.op.bases?.[0] ?? null,
          deletedAt: null,
        }),
      );
    }

    const people = await m.getRepository(OperatorContact).find({ where: { operatorId: id } });
    for (const [i, c] of row.contacts.entries()) {
      const exists = people.some(
        (p) => (c.phone && p.phone === c.phone) || p.name.toLowerCase() === c.name.toLowerCase(),
      );
      if (exists) continue;
      await m.getRepository(OperatorContact).save(
        m.getRepository(OperatorContact).create({
          operatorId: id,
          name: c.name,
          role: null,
          phone: c.phone ?? null,
          email: c.email ?? null,
          isPrimary: people.length === 0 && i === 0,
        }),
      );
    }
  }

  private async mergeOperator(m: EntityManager, id: string, row: OperatorRow): Promise<string> {
    const repo = m.getRepository(Operator);
    const op = await repo.findOneByOrFail({ id });
    for (const k of ['brand', 'nsopNo', 'website', 'safetyDisclosureUrl', 'sourceLink'] as const) {
      if (!op[k] && row.op[k]) op[k] = row.op[k] ?? null;
    }
    await repo.save(op);
    await this.addOperatorExtras(m, id, row);
    return id;
  }
}
