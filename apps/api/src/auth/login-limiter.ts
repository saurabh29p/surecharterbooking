import { Injectable } from '@nestjs/common';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 8;

/**
 * Locks an email after repeated wrong passwords (on top of the per-IP request throttle).
 * In memory: fine for the single API instance; resets on restart.
 */
@Injectable()
export class LoginLimiter {
  private readonly failures = new Map<string, number[]>();
  now: () => number = () => Date.now();

  private recent(key: string): number[] {
    const cutoff = this.now() - WINDOW_MS;
    const list = (this.failures.get(key) ?? []).filter((t) => t > cutoff);
    if (list.length) this.failures.set(key, list);
    else this.failures.delete(key);
    return list;
  }

  /** Minutes until the email may try again, or 0 if it may try now. */
  lockedForMinutes(email: string): number {
    const list = this.recent(email.toLowerCase());
    if (list.length < MAX_FAILURES) return 0;
    const oldest = list[0] ?? this.now();
    return Math.max(1, Math.ceil((oldest + WINDOW_MS - this.now()) / 60_000));
  }

  fail(email: string): void {
    const key = email.toLowerCase();
    this.failures.set(key, [...this.recent(key), this.now()]);
  }

  succeed(email: string): void {
    this.failures.delete(email.toLowerCase());
  }
}
