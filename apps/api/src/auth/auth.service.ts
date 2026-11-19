import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, MoreThan, type EntityManager, type Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service.js';
import { isDemoEmail } from '../db/seed-data.js';

/** The automated test account is recognised by this name (see TEST_ACCOUNT_EMAIL). */
export const TEST_ACCOUNT_NAME = 'Automated test account';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { LoginLimiter } from './login-limiter.js';
import { dummyPasswordHash, hashPassword, passwordProblem, verifyPassword } from './password.js';
import { RefreshToken } from './refresh-token.entity.js';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_MS,
  ROTATION_GRACE_MS,
  hashToken,
  newRefreshToken,
  signAccessToken,
} from './tokens.js';
import { User } from './user.entity.js';

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: string;
  setupCompleted: boolean;
}

export interface Session {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  user: PublicUser;
}

export interface DeviceSession {
  id: string;
  userAgent: string | null;
  signedInAt: Date;
  lastUsedAt: Date | null;
  current: boolean;
}

const toPublic = (u: User): PublicUser => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
  setupCompleted: u.setupCompletedAt !== null,
});

@Injectable()
export class AuthService {
  /** Injectable clock for tests. */
  now: () => Date = () => new Date();

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @InjectDataSource() private readonly ds: DataSource,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(RefreshToken) private readonly tokens: Repository<RefreshToken>,
    private readonly limiter: LoginLimiter,
    private readonly audit: AuditService,
  ) {}

  private findByEmail(email: string, withHash = false) {
    const qb = this.users
      .createQueryBuilder('u')
      .where('lower(u.email) = lower(:email)', { email });
    if (withHash) qb.addSelect('u.passwordHash');
    return qb.getOne();
  }

  async login(email: string, password: string, userAgent: string | null): Promise<Session> {
    const lockedFor = this.limiter.lockedForMinutes(email);
    if (lockedFor > 0) {
      throw new HttpException(
        `Too many wrong passwords. Try again in ${lockedFor} minute${lockedFor === 1 ? '' : 's'}.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    // Demo accounts (seed data) never work in production, whatever their password.
    const demoBlocked = this.config.NODE_ENV === 'production' && isDemoEmail(email);
    const user = demoBlocked ? null : await this.findByEmail(email, true);
    const ok =
      user && !user.disabledAt
        ? await verifyPassword(user.passwordHash, password)
        : await verifyPassword(await dummyPasswordHash(), password).then(() => false);
    if (!user || !ok) {
      this.limiter.fail(email);
      if (user) {
        await this.audit.record({
          actorType: 'PUBLIC',
          entity: 'user',
          entityId: user.id,
          action: 'LOGIN_FAILED',
        });
      }
      throw new UnauthorizedException('Wrong email or password');
    }
    this.limiter.succeed(email);
    user.lastLoginAt = this.now();
    await this.users.update(user.id, { lastLoginAt: user.lastLoginAt });
    await this.audit.record({
      actorType: 'USER',
      actorId: user.id,
      entity: 'user',
      entityId: user.id,
      action: 'LOGIN',
    });
    return this.issue(user, randomUUID(), userAgent);
  }

  private async issue(
    user: User,
    familyId: string,
    userAgent: string | null,
    manager?: EntityManager,
  ): Promise<Session> {
    const refreshToken = newRefreshToken();
    const repo = manager ? manager.getRepository(RefreshToken) : this.tokens;
    await repo.insert({
      userId: user.id,
      familyId,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(this.now().getTime() + REFRESH_TOKEN_TTL_MS),
      userAgent: userAgent?.slice(0, 300) ?? null,
    });
    const accessToken = await signAccessToken(
      { sub: user.id, ver: user.tokenVersion, role: user.role },
      this.config.JWT_SECRET,
    );
    return { accessToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS, refreshToken, user: toPublic(user) };
  }

  /** Swap a refresh token for a new one (same device "family") plus a fresh access token. */
  async refresh(token: string | undefined, userAgent: string | null): Promise<Session> {
    if (!token) throw new UnauthorizedException('Please log in');
    // Decide inside the transaction, throw after it: a revocation must commit even though the request fails.
    const outcome = await this.ds.transaction(async (m): Promise<Session | { error: string }> => {
      const row = await m
        .getRepository(RefreshToken)
        .createQueryBuilder('t')
        .setLock('pessimistic_write')
        .where('t.tokenHash = :h', { h: hashToken(token) })
        .getOne();
      if (!row) return { error: 'Please log in' };
      const now = this.now();
      if (row.revokedAt) {
        const recentlyRotated =
          row.revokedReason === 'ROTATED' &&
          now.getTime() - row.revokedAt.getTime() < ROTATION_GRACE_MS;
        if (!recentlyRotated) {
          // An old token came back: it may have been stolen. End that device's session entirely.
          const killed = await this.revokeFamily(m, row.familyId, 'REUSE_DETECTED');
          if (killed > 0)
            await this.audit.record(
              {
                actorType: 'SYSTEM',
                entity: 'user',
                entityId: row.userId,
                action: 'SESSION_REUSE_DETECTED',
              },
              m,
            );
        }
        return { error: 'Please log in again' };
      }
      if (row.expiresAt <= now) return { error: 'Your session expired. Please log in again.' };
      const user = await m
        .getRepository(User)
        .findOne({ where: { id: row.userId, disabledAt: IsNull() } });
      if (!user) return { error: 'Please log in' };
      await m
        .getRepository(RefreshToken)
        .update(row.id, { revokedAt: now, revokedReason: 'ROTATED', lastUsedAt: now });
      return this.issue(user, row.familyId, userAgent ?? row.userAgent, m);
    });
    if ('error' in outcome) throw new UnauthorizedException(outcome.error);
    return outcome;
  }

  /** Returns how many live tokens were revoked. */
  private async revokeFamily(m: EntityManager, familyId: string, reason: string): Promise<number> {
    const res = await m
      .getRepository(RefreshToken)
      .update({ familyId, revokedAt: IsNull() }, { revokedAt: this.now(), revokedReason: reason });
    return res.affected ?? 0;
  }

  /** Log out this device. */
  async logout(token: string | undefined): Promise<void> {
    if (!token) return;
    const row = await this.tokens.findOne({ where: { tokenHash: hashToken(token) } });
    if (!row) return;
    await this.revokeFamily(this.ds.manager, row.familyId, 'LOGOUT');
    await this.audit.record({
      actorType: 'USER',
      actorId: row.userId,
      entity: 'user',
      entityId: row.userId,
      action: 'LOGOUT',
    });
  }

  /** Log out every device, including this one, and invalidate all access tokens immediately. */
  async logoutAll(userId: string): Promise<void> {
    await this.ds.transaction(async (m) => {
      await m
        .getRepository(RefreshToken)
        .update(
          { userId, revokedAt: IsNull() },
          { revokedAt: this.now(), revokedReason: 'LOGOUT_ALL' },
        );
      await m.getRepository(User).increment({ id: userId }, 'tokenVersion', 1);
      await this.audit.record(
        {
          actorType: 'USER',
          actorId: userId,
          entity: 'user',
          entityId: userId,
          action: 'LOGOUT_ALL',
        },
        m,
      );
    });
  }

  async sessions(userId: string, currentToken: string | undefined): Promise<DeviceSession[]> {
    const active = await this.tokens.find({
      where: { userId, revokedAt: IsNull(), expiresAt: MoreThan(this.now()) },
      order: { createdAt: 'DESC' },
    });
    if (active.length === 0) return [];
    const starts: { family_id: string; started: Date }[] = await this.ds.query(
      `SELECT family_id, min(created_at) AS started FROM refresh_token WHERE family_id = ANY($1) GROUP BY family_id`,
      [active.map((t) => t.familyId)],
    );
    const startOf = new Map(starts.map((s) => [s.family_id, new Date(s.started)]));
    const currentHash = currentToken ? hashToken(currentToken) : null;
    return active.map((t) => ({
      id: t.familyId,
      userAgent: t.userAgent,
      signedInAt: startOf.get(t.familyId) ?? t.createdAt,
      lastUsedAt: t.lastUsedAt ?? t.createdAt,
      current: t.tokenHash === currentHash,
    }));
  }

  async revokeSession(userId: string, familyId: string): Promise<void> {
    const res = await this.tokens.update(
      { userId, familyId, revokedAt: IsNull() },
      { revokedAt: this.now(), revokedReason: 'REVOKED_BY_USER' },
    );
    if (!res.affected) throw new BadRequestException('That device is already logged out');
    await this.audit.record({
      actorType: 'USER',
      actorId: userId,
      entity: 'user',
      entityId: userId,
      action: 'SESSION_REVOKED',
    });
  }

  async me(userId: string): Promise<PublicUser> {
    const user = await this.users.findOneByOrFail({ id: userId });
    return toPublic(user);
  }

  async completeSetup(userId: string): Promise<PublicUser> {
    await this.users.update(
      { id: userId, setupCompletedAt: IsNull() },
      { setupCompletedAt: this.now() },
    );
    return this.me(userId);
  }

  /** Change password; every other device is logged out. Returns a fresh session for this device. */
  async changePassword(
    userId: string,
    current: string,
    next: string,
    currentToken: string | undefined,
    userAgent: string | null,
  ): Promise<Session> {
    const user = await this.users
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.id = :id', { id: userId })
      .getOneOrFail();
    if (!(await verifyPassword(user.passwordHash, current))) {
      throw new BadRequestException({
        message: 'Please fix the highlighted fields',
        fields: { currentPassword: 'This is not your current password' },
      });
    }
    const problem = passwordProblem(next, user.email);
    if (problem)
      throw new BadRequestException({
        message: 'Please fix the highlighted fields',
        fields: { newPassword: problem },
      });
    const familyId =
      (currentToken &&
        (await this.tokens.findOne({ where: { tokenHash: hashToken(currentToken) } }))?.familyId) ||
      randomUUID();
    return this.ds.transaction(async (m) => {
      await m.getRepository(User).update(userId, {
        passwordHash: await hashPassword(next),
        tokenVersion: user.tokenVersion + 1,
      });
      await m
        .getRepository(RefreshToken)
        .update(
          { userId, revokedAt: IsNull() },
          { revokedAt: this.now(), revokedReason: 'PASSWORD_CHANGED' },
        );
      await this.audit.record(
        {
          actorType: 'USER',
          actorId: userId,
          entity: 'user',
          entityId: userId,
          action: 'PASSWORD_CHANGED',
        },
        m,
      );
      const fresh = await m.getRepository(User).findOneByOrFail({ id: userId });
      return this.issue(fresh, familyId, userAgent, m);
    });
  }

  /**
   * Production safety net: if demo accounts from the seed ever reach a production database,
   * disable them at boot. Returns the emails that were disabled.
   */
  async disableDemoAccounts(): Promise<string[]> {
    const demo = (await this.users.find({ where: { disabledAt: IsNull() } })).filter((u) =>
      isDemoEmail(u.email),
    );
    for (const u of demo) {
      await this.users.update(u.id, { disabledAt: this.now(), tokenVersion: u.tokenVersion + 1 });
      await this.tokens.update(
        { userId: u.id, revokedAt: IsNull() },
        { revokedAt: this.now(), revokedReason: 'DEMO_IN_PRODUCTION' },
      );
      await this.audit.record({
        actorType: 'SYSTEM',
        entity: 'user',
        entityId: u.id,
        action: 'DEMO_ACCOUNT_DISABLED',
      });
    }
    return demo.map((u) => u.email);
  }

  /**
   * The automated test account (TEST_ACCOUNT_EMAIL / TEST_ACCOUNT_PASSWORD): created or refreshed
   * when both are set, disabled (with its sessions ended) when they are not. Never touches the owner.
   */
  async syncTestAccount(email?: string, password?: string): Promise<'ready' | 'disabled' | 'none'> {
    const existing = await this.users.find({ where: { name: TEST_ACCOUNT_NAME } });
    if (email && password) {
      const problem = passwordProblem(password, email);
      if (problem) throw new Error(`TEST_ACCOUNT_PASSWORD is not acceptable: ${problem}`);
      // Never on a database without its owner: the test account must not become the first user.
      if (!(await this.users.count({ where: { role: 'OWNER' } })))
        throw new Error('TEST_ACCOUNT_EMAIL needs the owner account to exist first');
      const clash = await this.users.findOne({ where: { email: email.trim() } });
      if (clash && clash.name !== TEST_ACCOUNT_NAME)
        throw new Error('TEST_ACCOUNT_EMAIL belongs to a real account; use a separate address');
      const user =
        existing.find((u) => u.email === email.trim()) ??
        this.users.create({
          email: email.trim(),
          name: TEST_ACCOUNT_NAME,
          role: 'STAFF',
          tokenVersion: 0,
        });
      user.passwordHash = await hashPassword(password);
      user.disabledAt = null;
      user.setupCompletedAt ??= this.now();
      const saved = await this.users.save(user);
      await this.audit.record({
        actorType: 'SYSTEM',
        entity: 'user',
        entityId: saved.id,
        action: 'TEST_ACCOUNT_READY',
      });
      return 'ready';
    }
    const active = existing.filter((u) => !u.disabledAt);
    for (const u of active) {
      await this.users.update(u.id, { disabledAt: this.now(), tokenVersion: u.tokenVersion + 1 });
      await this.tokens.update(
        { userId: u.id, revokedAt: IsNull() },
        { revokedAt: this.now(), revokedReason: 'TEST_ACCOUNT_OFF' },
      );
      await this.audit.record({
        actorType: 'SYSTEM',
        entity: 'user',
        entityId: u.id,
        action: 'TEST_ACCOUNT_DISABLED',
      });
    }
    return active.length ? 'disabled' : 'none';
  }

  /**
   * Create the owner account from ADMIN_EMAIL / ADMIN_PASSWORD if no user exists yet.
   * Returns what happened, for the seed script's output.
   */
  async bootstrapAdmin(email: string, password: string): Promise<'created' | 'exists'> {
    const problem = passwordProblem(password, email);
    if (problem) throw new Error(`ADMIN_PASSWORD is not acceptable: ${problem}`);
    if (this.config.NODE_ENV === 'production' && isDemoEmail(email)) {
      throw new Error('ADMIN_EMAIL uses a .test demo domain; use your real email in production');
    }
    if ((await this.users.count()) > 0) return 'exists';
    const user = await this.users.save(
      this.users.create({
        email: email.trim(),
        passwordHash: await hashPassword(password),
        name: '',
        role: 'OWNER',
        tokenVersion: 0,
      }),
    );
    await this.audit.record({
      actorType: 'SYSTEM',
      entity: 'user',
      entityId: user.id,
      action: 'CREATED_FROM_ENV',
    });
    return 'created';
  }
}
