import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { ConsentSource } from '@shubhjets/shared';
import { IsNull, type DataSource, type EntityManager } from 'typeorm';
import type { ClientInput, UpdateClientInput } from './client.dto.js';
import { Client } from './client.entities.js';
import { ConsentService } from './consent.service.js';

@Injectable()
export class ClientsService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly consents: ConsentService,
  ) {}

  private async find(id: string, m: EntityManager = this.ds.manager) {
    const c = await m.getRepository(Client).findOne({ where: { id, deletedAt: IsNull() } });
    if (!c) throw new NotFoundException('Client not found');
    return c;
  }

  private async assertPartner(m: EntityManager, partnerId: string | null | undefined) {
    if (!partnerId) return;
    const [p] = await m.query(`SELECT 1 FROM partner WHERE id = $1 AND deleted_at IS NULL`, [
      partnerId,
    ]);
    if (!p) {
      throw new BadRequestException({
        message: 'Please fix the highlighted fields',
        fields: { partnerId: 'Choose a partner from the list' },
      });
    }
  }

  async list(f: { q?: string; partnerId?: string }) {
    const params: unknown[] = [];
    const where = ['c.deleted_at IS NULL'];
    if (f.partnerId) {
      params.push(f.partnerId);
      where.push(`c.partner_id = $${params.length}`);
    }
    if (f.q) {
      params.push(`%${f.q.replace(/[%_\\]/g, '\\$&')}%`);
      const n = params.length;
      where.push(`(c.name ILIKE $${n} OR c.phone ILIKE $${n} OR c.email ILIKE $${n})`);
    }
    return this.ds.query(
      `SELECT c.id, c.name, c.type, c.phone, c.email, c.partner_id AS "partnerId", p.firm AS "partnerFirm",
              (SELECT count(*)::int FROM wedding w WHERE w.client_id = c.id AND w.deleted_at IS NULL) AS "weddings",
              EXISTS (SELECT 1 FROM consent k WHERE k.subject_type = 'CLIENT' AND k.subject_id = c.id AND k.withdrawn_at IS NULL) AS "hasConsent"
         FROM client c LEFT JOIN partner p ON p.id = c.partner_id
        WHERE ${where.join(' AND ')}
        ORDER BY c.name`,
      params,
    );
  }

  async get(id: string) {
    const c = await this.find(id);
    const partnerRows: { id: string; firm: string }[] = c.partnerId
      ? await this.ds.query(`SELECT id, firm FROM partner WHERE id = $1`, [c.partnerId])
      : [];
    const weddings = await this.ds.query(
      `SELECT id, code, status, venue_city AS "venueCity", starts_on AS "startsOn"
         FROM wedding WHERE client_id = $1 AND deleted_at IS NULL ORDER BY starts_on DESC NULLS LAST`,
      [id],
    );
    return {
      id: c.id,
      name: c.name,
      type: c.type,
      phone: c.phone,
      email: c.email,
      gstin: c.gstin,
      address: c.address,
      notes: c.notes,
      partner: partnerRows[0] ?? null,
      weddings,
      consents: await this.consents.list('CLIENT', id),
    };
  }

  async create(input: ClientInput, userId: string): Promise<{ id: string }> {
    return this.ds.transaction(async (m) => {
      await this.assertPartner(m, input.partnerId);
      const repo = m.getRepository(Client);
      const c = await repo.save(
        repo.create({
          name: input.name,
          type: input.type,
          phone: input.phone ?? null,
          email: input.email ?? null,
          gstin: input.gstin ?? null,
          address: input.address ?? null,
          partnerId: input.partnerId ?? null,
          notes: input.notes ?? null,
          deletedAt: null,
          createdBy: userId,
        }),
      );
      if (input.consent) {
        await this.consents.record(
          {
            subjectType: 'CLIENT',
            subjectId: c.id,
            source: input.consent.source as ConsentSource,
            givenAt: input.consent.givenAt,
          },
          m,
        );
      }
      return { id: c.id };
    });
  }

  async update(id: string, input: UpdateClientInput): Promise<void> {
    await this.ds.transaction(async (m) => {
      const c = await this.find(id, m);
      await this.assertPartner(m, input.partnerId);
      for (const k of [
        'name',
        'type',
        'phone',
        'email',
        'gstin',
        'address',
        'partnerId',
        'notes',
      ] as const) {
        const v = input[k];
        if (v === undefined || ((k === 'name' || k === 'type') && v === null)) continue;
        (c as unknown as Record<string, unknown>)[k] = v;
      }
      await m.getRepository(Client).save(c);
    });
  }
}
