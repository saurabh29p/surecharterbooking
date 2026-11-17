import { AsyncLocalStorage } from 'node:async_hooks';
import type { ActorType } from './audit-log.entity.js';

export interface Actor {
  type: ActorType;
  /** A user id for USER; an optional job/run id for AI and SYSTEM. */
  id: string | null;
}

interface Context {
  actor: Actor;
}

const storage = new AsyncLocalStorage<Context>();
const SYSTEM: Actor = { type: 'SYSTEM', id: null };

/** Who is acting right now. Outside any request or job this is SYSTEM. */
export function currentActor(): Actor {
  return storage.getStore()?.actor ?? SYSTEM;
}

/** Start a request: everyone is PUBLIC until the login guard says otherwise. */
export function runRequest<T>(fn: () => T): T {
  return storage.run({ actor: { type: 'PUBLIC', id: null } }, fn);
}

/** Called by the login guard once the access token checks out. */
export function setRequestUser(userId: string): void {
  const store = storage.getStore();
  if (store) store.actor = { type: 'USER', id: userId };
}

/**
 * Hook for background work: everything `fn` changes is attributed to `actor`.
 * E.g. `runAs({ type: 'AI', id: aiCallId }, () => saveDraft())` or the daily expiry job as SYSTEM.
 */
export function runAs<T>(actor: Actor, fn: () => T): T {
  return storage.run({ actor }, fn);
}
