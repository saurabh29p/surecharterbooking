import {
  EventSubscriber,
  type EntityManager,
  type EntitySubscriberInterface,
  type InsertEvent,
  type ObjectLiteral,
  type RemoveEvent,
  type SoftRemoveEvent,
  type UpdateEvent,
} from 'typeorm';
import { auditedInfo } from './audited.js';
import { auditValue } from './redact.js';
import { currentActor } from './request-context.js';

const same = (a: unknown, b: unknown) =>
  a instanceof Date && b instanceof Date
    ? a.getTime() === b.getTime()
    : Buffer.isBuffer(a) && Buffer.isBuffer(b)
      ? a.equals(b)
      : JSON.stringify(a) === JSON.stringify(b);

/**
 * Writes every change to an @Audited entity into audit_log, inside the same transaction,
 * so a change and its audit entry are saved (or rolled back) together.
 * Changes must go through repository save()/remove(); bulk query-builder updates are logged
 * as BULK_UPDATED with the values that were set.
 */
@EventSubscriber()
export class AuditSubscriber implements EntitySubscriberInterface {
  private async write(
    manager: EntityManager,
    entity: string,
    entityId: string,
    action: string,
    diff: Record<string, unknown> | null,
  ) {
    const actor = currentActor();
    await manager.query(
      `INSERT INTO audit_log (actor_type, actor_id, entity, entity_id, action, diff) VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        actor.type,
        actor.type === 'USER' ? actor.id : null,
        entity,
        entityId,
        action,
        diff ? JSON.stringify(diff) : null,
      ],
    );
  }

  private snapshot(row: ObjectLiteral, ignore: Set<string>) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      if (ignore.has(k) || v === undefined) continue;
      out[k] = auditValue(k, v);
    }
    return out;
  }

  async afterInsert(event: InsertEvent<ObjectLiteral>) {
    const info = auditedInfo(event.metadata.target);
    if (!info || !event.entity) return;
    const id = String(event.entity.id ?? event.entity.key ?? '');
    await this.write(
      event.manager,
      info.name,
      id,
      'CREATED',
      this.snapshot(event.entity, info.ignore),
    );
  }

  async afterUpdate(event: UpdateEvent<ObjectLiteral>) {
    const info = auditedInfo(event.metadata.target);
    if (!info || !event.entity) return;
    const before = event.databaseEntity;
    if (!before) {
      await this.write(
        event.manager,
        info.name,
        '*',
        'BULK_UPDATED',
        this.snapshot(event.entity, info.ignore),
      );
      return;
    }
    const diff: Record<string, unknown> = {};
    for (const col of event.updatedColumns) {
      const key = col.propertyName;
      if (info.ignore.has(key) || col.isCreateDate || col.isUpdateDate) continue;
      const from = before[key];
      const to = event.entity[key];
      if (same(from, to)) continue;
      diff[key] = { from: auditValue(key, from), to: auditValue(key, to) };
    }
    if (Object.keys(diff).length === 0) return;
    const id = String(before.id ?? before.key ?? '');
    await this.write(event.manager, info.name, id, 'UPDATED', diff);
  }

  async beforeRemove(event: RemoveEvent<ObjectLiteral>) {
    const info = auditedInfo(event.metadata.target);
    const row = event.databaseEntity ?? event.entity;
    if (!info || !row) return;
    await this.write(
      event.manager,
      info.name,
      String(row.id ?? row.key ?? event.entityId ?? ''),
      'DELETED',
      this.snapshot(row, info.ignore),
    );
  }

  async afterSoftRemove(event: SoftRemoveEvent<ObjectLiteral>) {
    const info = auditedInfo(event.metadata.target);
    const row = event.databaseEntity ?? event.entity;
    if (!info || !row) return;
    await this.write(event.manager, info.name, String(row.id ?? ''), 'DELETED', null);
  }
}
