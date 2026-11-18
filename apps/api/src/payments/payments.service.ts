import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  applyBps,
  confirmationChecklist,
  formatINR,
  moneyPosition,
  outflow,
  payoutBlocker,
  toIstDate,
  type IsoDate,
  type PaymentDirection,
  type PaymentMode,
} from '@shubhjets/shared';
import { IsNull, type DataSource, type EntityManager } from 'typeorm';
import { FilesService } from '../files/files.service.js';
import { Quote } from '../quotes/quote.entities.js';
import { Leg, Wedding } from '../weddings/wedding.entities.js';
import { Payment } from './payment.entity.js';

export interface PaymentInput {
  direction: PaymentDirection;
  operatorId?: string | null;
  partnerId?: string | null;
  amount: number;
  gstAmount?: number;
  tdsBps?: number | null;
  /** Outgoing only: PAYABLE (approved, not yet sent) or PAID. Client payments are always received. */
  paid?: boolean;
  paidOn?: IsoDate | null;
  mode?: PaymentMode;
  reference?: string | null;
  notes?: string | null;
}

const money = (p: number) => formatINR(p, { paise: 'never' });
const conflict = (message: string, code?: string) =>
  new ConflictException(code ? { message, code } : { message });
const CONFIRMED = ['SIGNED_AND_PAID', 'FLYING', 'DONE'];

/**
 * Payments for a wedding (BRIEF.md §4 Payment, §5.2 rules 2 and 3): client money in, operator
 * payouts and partner commission out; confirming the wedding; marking flights flown.
 */
@Injectable()
export class PaymentsService {
  now: () => Date = () => new Date();

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly files: FilesService,
  ) {}

  private today() {
    return toIstDate(this.now());
  }

  private async wedding(m: EntityManager, id: string): Promise<Wedding> {
    const w = await m.getRepository(Wedding).findOneBy({ id });
    if (!w || w.deletedAt) throw new NotFoundException('Wedding not found');
    return w;
  }

  private async acceptedQuote(m: EntityManager, weddingId: string): Promise<Quote | null> {
    return m
      .getRepository(Quote)
      .findOne({ where: { weddingId, status: 'ACCEPTED' }, order: { version: 'DESC' } });
  }

  private async live(m: EntityManager, weddingId: string): Promise<Payment[]> {
    return m
      .getRepository(Payment)
      .find({ where: { weddingId, deletedAt: IsNull() }, order: { createdAt: 'ASC' } });
  }

  private async position(m: EntityManager, w: Wedding, payments?: Payment[]) {
    const q = await this.acceptedQuote(m, w.id);
    const total = q && 'total' in q.totals ? q.totals.total : 0;
    return {
      quote: q,
      pos: moneyPosition(total, w.requiredPaymentBps, payments ?? (await this.live(m, w.id))),
    };
  }

  private async termsSigned(m: EntityManager, weddingId: string): Promise<boolean> {
    const [d] = await m.query(
      `SELECT 1 FROM document WHERE wedding_id = $1 AND type = 'CLIENT_TERMS' AND status = 'SIGNED' LIMIT 1`,
      [weddingId],
    );
    return !!d;
  }

  /** Everything the Money tab shows. */
  async summary(weddingId: string) {
    const m = this.ds.manager;
    const w = await this.wedding(m, weddingId);
    const payments = await this.live(m, weddingId);
    const { quote, pos } = await this.position(m, w, payments);
    const names: { id: string; name: string }[] = await m.query(
      `SELECT id, coalesce(brand, legal_name) AS name FROM operator
        UNION ALL SELECT id, firm FROM partner WHERE id = ANY($1)`,
      [[w.partnerId].filter(Boolean)],
    );
    const nameOf = (id: string | null) => names.find((n) => n.id === id)?.name ?? null;

    // What each operator on the accepted quote is owed (net), and what is already committed.
    const owed: { operator_id: string; name: string; net: string }[] = quote
      ? await m.query(
          `SELECT rr.operator_id, coalesce(o.brand, o.legal_name) AS name, sum(ql.cost)::bigint AS net
             FROM quote_line ql JOIN rate_response rr ON rr.id = ql.rate_response_id
             JOIN operator o ON o.id = rr.operator_id
            WHERE ql.quote_id = $1 GROUP BY rr.operator_id, o.brand, o.legal_name ORDER BY name`,
          [quote.id],
        )
      : [];
    const operators = owed.map((o) => {
      const mine = payments.filter(
        (p) => p.direction === 'OPERATOR_OUT' && p.operatorId === o.operator_id,
      );
      const committedNet = mine.reduce((s, p) => s + p.amount, 0);
      return {
        operatorId: o.operator_id,
        name: o.name,
        owedNet: Number(o.net),
        committedNet,
        paidNet: mine.filter((p) => p.status === 'PAID').reduce((s, p) => s + p.amount, 0),
        remainingNet: Math.max(0, Number(o.net) - committedNet),
      };
    });
    const commission = quote && 'commission' in quote.totals ? quote.totals.commission : 0;
    const partnerPaid = payments.filter((p) => p.direction === 'PARTNER_OUT');
    const flown = w.status === 'DONE';
    const checklist =
      w.status === 'QUOTED' || CONFIRMED.includes(w.status)
        ? confirmationChecklist({
            hasAcceptedQuote: !!quote,
            termsSigned: await this.termsSigned(m, w.id),
            position: pos,
          })
        : [];
    return {
      status: w.status,
      confirmedAt: w.confirmedAt,
      requiredPaymentBps: w.requiredPaymentBps,
      quote: quote ? { id: quote.id, version: quote.version } : null,
      position: pos,
      checklist,
      canConfirm: w.status === 'QUOTED' && checklist.length > 0 && checklist.every((c) => c.done),
      operators,
      partner:
        w.partnerId && commission > 0
          ? {
              partnerId: w.partnerId,
              name: nameOf(w.partnerId),
              owed: commission,
              committed: partnerPaid.reduce((s, p) => s + p.amount, 0),
              remaining: Math.max(0, commission - partnerPaid.reduce((s, p) => s + p.amount, 0)),
              flown,
            }
          : null,
      payments: payments
        .slice()
        .reverse()
        .map((p) => ({
          id: p.id,
          direction: p.direction,
          name: p.direction === 'CLIENT_IN' ? null : nameOf(p.operatorId ?? p.partnerId),
          operatorId: p.operatorId,
          partnerId: p.partnerId,
          amount: p.amount,
          gstAmount: p.gstAmount,
          tdsBps: p.tdsBps,
          tds: p.tdsBps ? applyBps(p.amount, p.tdsBps) : 0,
          outflow: p.direction === 'CLIENT_IN' ? 0 : outflow(p),
          status: p.status,
          paidOn: p.paidOn,
          mode: p.mode,
          reference: p.reference,
          notes: p.notes,
          hasReceipt: !!p.receiptFileId,
          createdAt: p.createdAt,
        })),
    };
  }

  // ---------- Recording ----------

  async record(weddingId: string, input: PaymentInput, userId: string): Promise<{ id: string }> {
    return this.ds.transaction(async (m) => {
      await m.query(`SELECT 1 FROM wedding WHERE id = $1 FOR UPDATE`, [weddingId]);
      const w = await this.wedding(m, weddingId);
      if (w.status === 'LOST') throw conflict('This wedding is marked lost.');
      const payments = await this.live(m, weddingId);
      const { quote, pos } = await this.position(m, w, payments);
      if (!quote) throw conflict('Record the client’s acceptance on the Quote tab first.');
      if (input.paidOn && input.paidOn > this.today())
        throw new BadRequestException({
          message: 'The date cannot be in the future',
          fields: { paidOn: 'The date cannot be in the future' },
        });

      const repo = m.getRepository(Payment);
      const base = {
        weddingId,
        amount: input.amount,
        gstAmount: 0,
        tdsBps: null as number | null,
        mode: input.mode ?? 'BANK_TRANSFER',
        reference: input.reference ?? null,
        notes: input.notes ?? null,
        receiptFileId: null,
        deletedAt: null,
        createdBy: userId,
        operatorId: null as string | null,
        partnerId: null as string | null,
      };

      if (input.direction === 'CLIENT_IN') {
        if (!input.paidOn)
          throw new BadRequestException({
            message: 'When was it received?',
            fields: { paidOn: 'When was it received?' },
          });
        if (input.amount > pos.balance)
          throw new BadRequestException({
            message: `That's more than the balance of ${money(pos.balance)}`,
            fields: { amount: `That's more than the balance of ${money(pos.balance)}` },
          });
        const p = await repo.save(
          repo.create({
            ...base,
            direction: 'CLIENT_IN',
            status: 'RECORDED',
            paidOn: input.paidOn,
            payableAt: null,
          }),
        );
        return { id: p.id };
      }

      // Outgoing: rule 3.
      const paid = input.paid === true;
      if (paid && !input.paidOn)
        throw new BadRequestException({
          message: 'When was it paid?',
          fields: { paidOn: 'When was it paid?' },
        });
      if (input.direction === 'OPERATOR_OUT') {
        const [onQuote] = await m.query(
          `SELECT 1 FROM quote_line ql JOIN rate_response rr ON rr.id = ql.rate_response_id
            WHERE ql.quote_id = $1 AND rr.operator_id = $2 LIMIT 1`,
          [quote.id, input.operatorId],
        );
        if (!onQuote) throw conflict('That operator is not on the accepted quote.');
        const gst = input.gstAmount ?? 0;
        const blocker = payoutBlocker(pos, input.amount + gst);
        if (blocker) throw conflict(blocker, 'PAYOUT_NOT_COVERED');
        const p = await repo.save(
          repo.create({
            ...base,
            direction: 'OPERATOR_OUT',
            operatorId: input.operatorId!,
            gstAmount: gst,
            status: paid ? 'PAID' : 'PAYABLE',
            paidOn: paid ? input.paidOn! : null,
            payableAt: this.now(),
          }),
        );
        return { id: p.id };
      }
      // PARTNER_OUT
      if (!w.partnerId || input.partnerId !== w.partnerId)
        throw conflict('Commission goes to the partner who brought this wedding.');
      const blocker = payoutBlocker(pos, input.amount, {
        partner: true,
        flown: w.status === 'DONE',
      });
      if (blocker) throw conflict(blocker, 'PAYOUT_NOT_COVERED');
      const p = await repo.save(
        repo.create({
          ...base,
          direction: 'PARTNER_OUT',
          partnerId: w.partnerId,
          tdsBps: input.tdsBps ?? null,
          status: paid ? 'PAID' : 'PAYABLE',
          paidOn: paid ? input.paidOn! : null,
          payableAt: this.now(),
        }),
      );
      return { id: p.id };
    });
  }

  private async find(m: EntityManager, id: string): Promise<Payment> {
    const p = await m.getRepository(Payment).findOneBy({ id });
    if (!p) throw new NotFoundException('Payment not found');
    return p;
  }

  /** A payable payout has been sent. */
  async markPaid(
    id: string,
    input: { paidOn: IsoDate; mode?: PaymentMode; reference?: string | null },
  ) {
    await this.ds.transaction(async (m) => {
      const p = await this.find(m, id);
      if (p.deletedAt) throw conflict('This payment was removed.');
      if (p.status !== 'PAYABLE') throw conflict('Only a payable payout can be marked paid.');
      if (input.paidOn > this.today())
        throw new BadRequestException({
          message: 'The date cannot be in the future',
          fields: { paidOn: 'The date cannot be in the future' },
        });
      p.status = 'PAID';
      p.paidOn = input.paidOn;
      if (input.mode) p.mode = input.mode;
      if (input.reference !== undefined) p.reference = input.reference;
      await m.getRepository(Payment).save(p);
    });
  }

  /** Removes a payment (kept for the record, can be restored). Refused when it would break rule 2 or 3. */
  async remove(id: string) {
    await this.ds.transaction(async (m) => {
      const p = await this.find(m, id);
      if (p.deletedAt) return;
      await m.query(`SELECT 1 FROM wedding WHERE id = $1 FOR UPDATE`, [p.weddingId]);
      const w = await this.wedding(m, p.weddingId);
      if (p.direction === 'CLIENT_IN') {
        const rest = (await this.live(m, w.id)).filter((x) => x.id !== p.id);
        const { pos } = await this.position(m, w, rest);
        if (pos.uncommitted < 0)
          throw conflict(
            `Payouts of ${money(pos.operatorCommitted + pos.partnerCommitted)} rely on this money. Remove those payouts first.`,
          );
        if (CONFIRMED.includes(w.status) && pos.dueToConfirm > 0)
          throw conflict('This wedding is confirmed with this payment. It cannot be removed.');
      }
      p.deletedAt = this.now();
      await m.getRepository(Payment).save(p);
    });
  }

  /** Undo a removal (rule 3 is checked again for payouts). */
  async restore(id: string) {
    await this.ds.transaction(async (m) => {
      const p = await this.find(m, id);
      if (!p.deletedAt) return;
      await m.query(`SELECT 1 FROM wedding WHERE id = $1 FOR UPDATE`, [p.weddingId]);
      const w = await this.wedding(m, p.weddingId);
      const { pos } = await this.position(m, w);
      if (p.direction === 'CLIENT_IN' && p.amount > pos.balance)
        throw conflict(`That's more than the balance of ${money(pos.balance)}.`);
      if (p.direction !== 'CLIENT_IN') {
        const blocker = payoutBlocker(pos, outflow(p));
        if (blocker) throw conflict(blocker, 'PAYOUT_NOT_COVERED');
      }
      p.deletedAt = null;
      await m.getRepository(Payment).save(p);
    });
  }

  async setReceipt(id: string, upload: { buffer: Buffer; originalName: string }) {
    const p = await this.find(this.ds.manager, id);
    const file = await this.files.upload({ ...upload, purpose: 'receipt' });
    const old = p.receiptFileId;
    p.receiptFileId = file.id;
    await this.ds.getRepository(Payment).save(p);
    if (old) await this.files.purge(old);
  }

  async receiptLink(id: string) {
    const p = await this.find(this.ds.manager, id);
    if (!p.receiptFileId) throw new NotFoundException('No receipt uploaded');
    return this.files.link(p.receiptFileId, 'payment receipt');
  }

  // ---------- Confirming and flying ----------

  /** Rule 2: signed client terms and the required payment, then the wedding is confirmed. */
  async confirm(weddingId: string) {
    await this.ds.transaction(async (m) => {
      await m.query(`SELECT 1 FROM wedding WHERE id = $1 FOR UPDATE`, [weddingId]);
      const w = await this.wedding(m, weddingId);
      if (w.status !== 'QUOTED')
        throw conflict(
          CONFIRMED.includes(w.status)
            ? 'This wedding is already confirmed.'
            : 'Only a quoted wedding can be confirmed.',
        );
      const { quote, pos } = await this.position(m, w);
      const list = confirmationChecklist({
        hasAcceptedQuote: !!quote,
        termsSigned: await this.termsSigned(m, w.id),
        position: pos,
      });
      const missing = list.filter((c) => !c.done);
      if (missing.length)
        throw new ConflictException({
          code: 'NOT_READY',
          message: `Not yet: ${missing.map((c) => c.hint ?? c.label).join('; ')}.`,
          missing: missing.map((c) => c.key),
        });
      w.status = 'SIGNED_AND_PAID';
      w.confirmedAt = this.now();
      await m.getRepository(Wedding).save(w);
      const legRepo = m.getRepository(Leg);
      for (const leg of await legRepo.find({ where: { weddingId } })) {
        if (leg.status === 'QUOTED') {
          leg.status = 'CONFIRMED';
          await legRepo.save(leg);
        }
      }
    });
  }

  private async afterFlights(m: EntityManager, w: Wedding) {
    const legs = (await m.getRepository(Leg).find({ where: { weddingId: w.id } })).filter(
      (l) => l.status !== 'CANCELLED',
    );
    const flown = legs.filter((l) => l.status === 'FLOWN').length;
    const next = flown === 0 ? 'SIGNED_AND_PAID' : flown === legs.length ? 'DONE' : 'FLYING';
    if (w.status !== next) {
      w.status = next;
      await m.getRepository(Wedding).save(w);
    }
  }

  /** A confirmed leg has flown (from its flight date). The wedding becomes Flying, then Done. */
  async markFlown(legId: string) {
    await this.ds.transaction(async (m) => {
      const leg = await m.getRepository(Leg).findOneBy({ id: legId });
      if (!leg) throw new NotFoundException('Leg not found');
      await m.query(`SELECT 1 FROM wedding WHERE id = $1 FOR UPDATE`, [leg.weddingId]);
      const w = await this.wedding(m, leg.weddingId);
      if (!CONFIRMED.includes(w.status) || leg.status !== 'CONFIRMED')
        throw conflict(
          leg.status === 'FLOWN'
            ? 'This leg is already marked flown.'
            : 'Confirm the wedding first.',
        );
      if (leg.flightDate > this.today()) throw conflict('This flight is in the future.');
      leg.status = 'FLOWN';
      await m.getRepository(Leg).save(leg);
      await this.afterFlights(m, w);
    });
  }

  /** Undo "flown" (a mistake), as long as no commission has been made payable since. */
  async unmarkFlown(legId: string) {
    await this.ds.transaction(async (m) => {
      const leg = await m.getRepository(Leg).findOneBy({ id: legId });
      if (!leg) throw new NotFoundException('Leg not found');
      if (leg.status !== 'FLOWN') throw conflict('This leg is not marked flown.');
      const w = await this.wedding(m, leg.weddingId);
      const [commission] = await m.query(
        `SELECT 1 FROM payment WHERE wedding_id = $1 AND direction = 'PARTNER_OUT' AND deleted_at IS NULL LIMIT 1`,
        [w.id],
      );
      if (commission)
        throw conflict('Commission is already payable for this wedding; remove it first.');
      leg.status = 'CONFIRMED';
      await m.getRepository(Leg).save(leg);
      await this.afterFlights(m, w);
    });
  }
}
