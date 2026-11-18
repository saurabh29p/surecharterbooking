import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  addDays,
  idDeletionDate,
  istToInstant,
  normalizePhone,
  toIstDate,
  type IsoDate,
} from '@shubhjets/shared';
import { In, IsNull, Not, type DataSource, type EntityManager } from 'typeorm';
import { FilesService } from '../files/files.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { Leg } from '../weddings/wedding.entities.js';
import { Guest } from './guest.entity.js';

export interface GuestInput {
  name: string;
  phone?: string | null;
}

const MAX_PER_LEG = 400;

/**
 * Guest manifests per leg (BRIEF.md §4 Guest, §5.8): names, phones, whether the ID was received,
 * and the ID file itself, encrypted by the app, opened only through logged links, and deleted
 * automatically N days (Settings, default 30) after the wedding's last flight.
 */
@Injectable()
export class GuestsService {
  now: () => Date = () => new Date();

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly files: FilesService,
    private readonly settings: SettingsService,
  ) {}

  private async leg(m: EntityManager, id: string): Promise<Leg> {
    const l = await m.getRepository(Leg).findOneBy({ id });
    if (!l) throw new NotFoundException('Leg not found');
    return l;
  }

  private async guest(m: EntityManager, id: string): Promise<Guest> {
    const g = await m.getRepository(Guest).findOneBy({ id });
    if (!g) throw new NotFoundException('Guest not found');
    return g;
  }

  /** The day the wedding's guest ID files are deleted: last flight + retention days. */
  private async deletionDate(m: EntityManager, weddingId: string): Promise<IsoDate | null> {
    const [r] = await m.query(
      `SELECT max(flight_date)::text AS last FROM leg WHERE wedding_id = $1 AND status <> 'CANCELLED'`,
      [weddingId],
    );
    if (!r?.last) return null;
    return idDeletionDate(r.last, await this.settings.get<number>('guest_id.retention_days'));
  }

  async manifest(weddingId: string) {
    const m = this.ds.manager;
    const legs = (
      await m.getRepository(Leg).find({ where: { weddingId }, order: { seq: 'ASC' } })
    ).filter((l) => l.status !== 'CANCELLED');
    const guests = legs.length
      ? await m.getRepository(Guest).find({
          where: { legId: In(legs.map((l) => l.id)) },
          // Same-instant inserts (a pasted list) keep a stable order.
          order: { createdAt: 'ASC', name: 'ASC' },
        })
      : [];
    const dueDays = await this.settings.get<number>('today.guest_ids_due_days');
    const first = legs.map((l) => l.flightDate).sort()[0];
    return {
      idsDueOn: first ? addDays(first, -dueDays) : null,
      idsDeletedOn: await this.deletionDate(m, weddingId),
      legs: legs.map((l) => {
        const mine = guests.filter((g) => g.legId === l.id);
        return {
          legId: l.id,
          seq: l.seq,
          from: l.fromIata,
          to: l.toIata,
          date: l.flightDate,
          pax: l.pax,
          status: l.status,
          count: mine.length,
          idsReceived: mine.filter((g) => g.idReceived).length,
          guests: mine.map((g) => ({
            id: g.id,
            name: g.name,
            phone: g.phone,
            idReceived: g.idReceived,
            hasIdFile: !!g.idFileId,
            idDeletedAt: g.idDeletedAt,
          })),
        };
      }),
    };
  }

  /** Adds guests to a leg, skipping names already on it (case-insensitive). */
  async add(legId: string, input: GuestInput[]) {
    return this.ds.transaction(async (m) => {
      const leg = await this.leg(m, legId);
      const repo = m.getRepository(Guest);
      const existing = await repo.find({ where: { legId } });
      const seen = new Set(existing.map((g) => g.name.trim().toLowerCase()));
      const added: string[] = [];
      const skipped: string[] = [];
      for (const g of input) {
        const name = g.name.trim().replace(/\s+/g, ' ');
        if (!name) continue;
        if (seen.has(name.toLowerCase())) {
          skipped.push(name);
          continue;
        }
        if (existing.length + added.length >= MAX_PER_LEG)
          throw new ConflictException(`A leg can have at most ${MAX_PER_LEG} guests`);
        seen.add(name.toLowerCase());
        const phone = g.phone ? (normalizePhone(g.phone) ?? g.phone.trim()) : null;
        await repo.save(
          repo.create({
            legId,
            name,
            phone,
            idReceived: false,
            idFileId: null,
            idPurgeAt: null,
            idDeletedAt: null,
          }),
        );
        added.push(name);
      }
      const total = existing.length + added.length;
      return {
        added: added.length,
        skipped,
        warning:
          total > leg.pax
            ? `Leg ${leg.seq} now has ${total} guests but is booked for ${leg.pax}. Update the leg if more are flying.`
            : null,
      };
    });
  }

  /** Copies guests (names and phones, not IDs) from another leg of the same wedding. */
  async copy(toLegId: string, fromLegId: string) {
    const m = this.ds.manager;
    const [to, from] = [await this.leg(m, toLegId), await this.leg(m, fromLegId)];
    if (to.weddingId !== from.weddingId || to.id === from.id)
      throw new ConflictException('Copy from another leg of the same wedding');
    const source = await m
      .getRepository(Guest)
      .find({ where: { legId: fromLegId }, order: { createdAt: 'ASC', name: 'ASC' } });
    return this.add(
      toLegId,
      source.map((g) => ({ name: g.name, phone: g.phone })),
    );
  }

  async update(id: string, input: { name?: string; phone?: string | null; idReceived?: boolean }) {
    await this.ds.transaction(async (m) => {
      const g = await this.guest(m, id);
      if (input.name !== undefined) g.name = input.name.trim().replace(/\s+/g, ' ');
      if (input.phone !== undefined) g.phone = input.phone;
      if (input.idReceived !== undefined) {
        if (!input.idReceived && g.idFileId)
          throw new ConflictException('Delete the ID file first, then untick it.');
        g.idReceived = input.idReceived;
      }
      await m.getRepository(Guest).save(g);
    });
  }

  async remove(id: string) {
    const g = await this.guest(this.ds.manager, id);
    if (g.idFileId) await this.files.purge(g.idFileId);
    await this.ds.getRepository(Guest).remove(g);
  }

  /** Stores the ID file encrypted and marks the ID received. */
  async uploadId(id: string, upload: { buffer: Buffer; originalName: string }) {
    const m = this.ds.manager;
    const g = await this.guest(m, id);
    const leg = await this.leg(m, g.legId);
    const deleteOn = await this.deletionDate(m, leg.weddingId);
    if (deleteOn && deleteOn < toIstDate(this.now()))
      throw new ConflictException(
        'This wedding is past the ID keeping period; IDs are no longer stored.',
      );
    const purgeAt = deleteOn ? istToInstant(deleteOn) : null;
    const file = await this.files.upload({ ...upload, purpose: 'guest-id', purgeAt });
    const old = g.idFileId;
    g.idFileId = file.id;
    g.idReceived = true;
    g.idPurgeAt = purgeAt;
    g.idDeletedAt = null;
    await this.ds.getRepository(Guest).save(g);
    if (old) await this.files.purge(old);
  }

  /** A short-lived link to view the ID. Every opening is logged. */
  async idLink(id: string) {
    const g = await this.guest(this.ds.manager, id);
    if (!g.idFileId) throw new NotFoundException('No ID file for this guest');
    return this.files.link(g.idFileId, `guest ID viewed: ${g.name}`);
  }

  async deleteId(id: string) {
    const g = await this.guest(this.ds.manager, id);
    if (!g.idFileId) return;
    await this.files.purge(g.idFileId);
    g.idFileId = null;
    g.idDeletedAt = this.now();
    await this.ds.getRepository(Guest).save(g);
  }

  /** Daily: deletes ID files of weddings whose last flight is more than N days ago. */
  async purgeDue(): Promise<number> {
    const today = toIstDate(this.now());
    const days = await this.settings.get<number>('guest_id.retention_days');
    const due: { id: string }[] = await this.ds.query(
      `SELECT g.id FROM guest g JOIN leg l ON l.id = g.leg_id
        WHERE g.id_file_id IS NOT NULL
          AND (SELECT max(l2.flight_date) FROM leg l2 WHERE l2.wedding_id = l.wedding_id AND l2.status <> 'CANCELLED')
              + $2::int < $1::date`,
      [today, days],
    );
    for (const { id } of due) await this.deleteId(id);
    return due.length;
  }

  /** Guests with ID files still stored (for checks). */
  async storedCount(): Promise<number> {
    return this.ds.getRepository(Guest).count({ where: { idFileId: Not(IsNull()) } });
  }
}
