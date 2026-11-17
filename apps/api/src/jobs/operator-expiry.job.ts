import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { EXPIRY_ALERT_DAYS, operatorExpiries, toIstDate } from '@shubhjets/shared';
import type { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service.js';
import { runAs } from '../audit/request-context.js';
import { OperatorsService } from '../operators/operators.service.js';

export interface ExpiryAlert {
  operatorId: string;
  kind: 'NSOP' | 'INSURANCE';
  expiresOn: string;
  daysLeft: number;
  /** 30 or 7 days before, or 0 = expired (operator blocked). */
  threshold: number;
}

export interface ExpiryRunResult {
  checked: number;
  alerts: ExpiryAlert[];
  statusChanges: { operatorId: string; from: string; to: string }[];
}

/** Which alert (if any) a document is due for today. Raised once each; a late start skips straight to the nearer one. */
export function alertThreshold(daysLeft: number): number | null {
  if (daysLeft < 0) return 0;
  const [far, near] = [...EXPIRY_ALERT_DAYS].sort((a, b) => b - a) as [number, number];
  if (daysLeft <= near) return near;
  if (daysLeft <= far) return far;
  return null;
}

/**
 * Hard rule 8, run daily: permit and insurance expiry alerts at 30 and 7 days, EXPIRING_SOON within 30 days,
 * automatic block once expired. Safe to run any number of times a day. Everything it changes is
 * attributed to SYSTEM in the audit log.
 */
@Injectable()
export class OperatorExpiryJob {
  static readonly NAME = 'operator-expiry';
  private readonly log = new Logger('OperatorExpiryJob');

  constructor(
    private readonly operators: OperatorsService,
    private readonly audit: AuditService,
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  run(): Promise<ExpiryRunResult> {
    return runAs({ type: 'SYSTEM', id: OperatorExpiryJob.NAME }, () => this.runInner());
  }

  private async runInner(): Promise<ExpiryRunResult> {
    const result: ExpiryRunResult = { checked: 0, alerts: [], statusChanges: [] };
    const today = toIstDate(this.operators.now());
    for (const id of await this.operators.allIds()) {
      result.checked++;
      await this.ds.transaction(async (m) => {
        const [before] = await m.query(
          `SELECT status, verified_at FROM operator WHERE id = $1 FOR UPDATE`,
          [id],
        );
        const after = await this.operators.refreshStatus(id, m);
        if (before.status !== after.status)
          result.statusChanges.push({ operatorId: id, from: before.status, to: after.status });
        if (!before.verified_at) return; // alerts only matter for operators you have verified
        const docs: {
          kind: 'NSOP' | 'INSURANCE' | 'OPERATOR_AGREEMENT';
          expires_on: string | null;
          verified_on: string | null;
        }[] = await m.query(
          `SELECT kind, expires_on, verified_on FROM operator_document WHERE operator_id = $1`,
          [id],
        );
        const expiries = operatorExpiries(
          {
            nsopNo: null,
            safetyDisclosureUrl: null,
            docs: docs.map((d) => ({
              kind: d.kind,
              expiresOn: d.expires_on,
              verifiedOn: d.verified_on,
            })),
          },
          today,
        );
        for (const e of expiries) {
          const threshold = alertThreshold(e.daysLeft);
          if (threshold === null) continue;
          const inserted: unknown[] = await m.query(
            `INSERT INTO operator_expiry_alert (operator_id, kind, expires_on, threshold_days) VALUES ($1, $2, $3, $4)
             ON CONFLICT DO NOTHING RETURNING id`,
            [id, e.kind, e.expiresOn, threshold],
          );
          if (inserted.length === 0) continue;
          const alert = {
            operatorId: id,
            kind: e.kind,
            expiresOn: e.expiresOn,
            daysLeft: e.daysLeft,
            threshold,
          };
          result.alerts.push(alert);
          await this.audit.record(
            { entity: 'operator', entityId: id, action: 'EXPIRY_ALERT', diff: { ...alert } },
            m,
          );
        }
      });
    }
    if (result.alerts.length || result.statusChanges.length) {
      this.log.log(
        `Checked ${result.checked} operators: ${result.alerts.length} alerts, ${result.statusChanges.length} status changes`,
      );
    }
    return result;
  }
}
