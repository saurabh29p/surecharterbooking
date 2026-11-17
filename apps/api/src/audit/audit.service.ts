import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import { AuditLog, type ActorType } from './audit-log.entity.js';

export interface AuditEntry {
  actorType: ActorType;
  actorId?: string | null;
  entity: string;
  entityId: string;
  action: string;
  diff?: Record<string, unknown> | null;
}

/** Fields that must never be written into the audit log, even as part of a diff. */
const SECRET_KEYS = /password|token|secret|bank|account_?number|ifsc/i;

export function redact(
  diff: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!diff) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(diff)) {
    out[k] = SECRET_KEYS.test(k) ? '[redacted]' : v;
  }
  return out;
}

@Injectable()
export class AuditService {
  constructor(@InjectRepository(AuditLog) private readonly repo: Repository<AuditLog>) {}

  /** Pass `manager` to write inside the caller's transaction. */
  async record(entry: AuditEntry, manager?: EntityManager): Promise<void> {
    const repo = manager ? manager.getRepository(AuditLog) : this.repo;
    await repo.save(
      repo.create({
        actorType: entry.actorType,
        actorId: entry.actorId ?? null,
        entity: entry.entity,
        entityId: entry.entityId,
        action: entry.action,
        diff: redact(entry.diff),
      }),
    );
  }
}
