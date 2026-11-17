import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import type { DataSource, EntityManager, Repository } from 'typeorm';
import { AuditLog, type ActorType } from './audit-log.entity.js';
import { redact } from './redact.js';
import { currentActor, runAs, type Actor } from './request-context.js';

export { redact } from './redact.js';

export interface AuditEntry {
  /** Defaults to whoever is acting in the current request or job. */
  actorType?: ActorType;
  actorId?: string | null;
  entity: string;
  entityId: string;
  action: string;
  diff?: Record<string, unknown> | null;
}

export interface AuditItem {
  id: string;
  at: Date;
  actorType: ActorType;
  actorId: string | null;
  actorLabel: string;
  entity: string;
  entityId: string;
  action: string;
  diff: Record<string, unknown> | null;
}

export interface AuditQuery {
  entity?: string;
  entityId?: string;
  /** Return entries older than this id (for "Load more"). */
  before?: string;
  limit?: number;
}

const ACTOR_LABELS: Record<ActorType, string> = {
  USER: 'You',
  AI: 'AI assistant',
  SYSTEM: 'System',
  PUBLIC: 'Website visitor',
};

/**
 * Explicit audit entries for things that aren't record changes (logins, viewing bank details, sharing).
 * Record changes on @Audited entities are logged automatically by AuditSubscriber.
 */
@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog) private readonly repo: Repository<AuditLog>,
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  /** Pass `manager` to write inside the caller's transaction. */
  async record(entry: AuditEntry, manager?: EntityManager): Promise<void> {
    const actor = currentActor();
    const actorType = entry.actorType ?? actor.type;
    const actorId =
      entry.actorId !== undefined ? entry.actorId : actorType === 'USER' ? actor.id : null;
    await (manager ?? this.ds.manager).query(
      `INSERT INTO audit_log (actor_type, actor_id, entity, entity_id, action, diff) VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        actorType,
        actorId,
        entry.entity,
        entry.entityId,
        entry.action,
        entry.diff ? JSON.stringify(redact(entry.diff)) : null,
      ],
    );
  }

  /** Attribute everything `fn` does to `actor` (AI jobs, scheduled system jobs). */
  runAs<T>(actor: Actor, fn: () => T): T {
    return runAs(actor, fn);
  }

  async list(q: AuditQuery): Promise<{ items: AuditItem[]; nextBefore: string | null }> {
    const limit = Math.min(Math.max(q.limit ?? 50, 1), 100);
    const qb = this.repo
      .createQueryBuilder('a')
      .leftJoin('app_user', 'u', 'u.id = a.actor_id')
      .addSelect(['u.email AS u_email', 'u.name AS u_name'])
      .orderBy('a.id', 'DESC')
      .limit(limit + 1);
    if (q.entity) qb.andWhere('a.entity = :entity', { entity: q.entity });
    if (q.entityId) qb.andWhere('a.entity_id = :entityId', { entityId: q.entityId });
    if (q.before) qb.andWhere('a.id < :before', { before: q.before });
    const { entities, raw } = await qb.getRawAndEntities<{
      u_email: string | null;
      u_name: string | null;
    }>();
    const items = entities.slice(0, limit).map((a, i) => ({
      id: a.id,
      at: a.at,
      actorType: a.actorType,
      actorId: a.actorId,
      actorLabel:
        a.actorType === 'USER'
          ? raw[i]?.u_name || raw[i]?.u_email || 'A user'
          : ACTOR_LABELS[a.actorType],
      entity: a.entity,
      entityId: a.entityId,
      action: a.action,
      diff: a.diff,
    }));
    return { items, nextBefore: entities.length > limit ? (items.at(-1)?.id ?? null) : null };
  }
}
