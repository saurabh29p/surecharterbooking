import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { PgBoss } from 'pg-boss';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { GuestIdPurgeJob } from '../guests/guest-id-purge.job.js';
import { OperatorExpiryJob } from './operator-expiry.job.js';

/** Daily at 06:45 India time, before the working day starts. */
export const EXPIRY_CRON = '45 6 * * *';
export const JOBS_TIME_ZONE = 'Asia/Kolkata';
/** Daily at 03:30 India time, while nobody is working. */
export const GUEST_ID_PURGE_CRON = '30 3 * * *';

/**
 * Background jobs on pg-boss (a queue stored in Postgres, so no extra service to run).
 * Schedules survive restarts; a run missed while the server was down happens once on the next start.
 */
@Injectable()
export class JobsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger('Jobs');
  private boss: PgBoss | null = null;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly expiry: OperatorExpiryJob,
    private readonly guestIds: GuestIdPurgeJob,
  ) {}

  async onApplicationBootstrap() {
    if (!this.config.JOBS_ENABLED) return;
    await this.start();
  }

  async start(): Promise<PgBoss> {
    const boss = new PgBoss({ connectionString: this.config.DATABASE_URL, schema: 'pgboss' });
    boss.on('error', (err) => this.log.error(err));
    await boss.start();
    await boss.createQueue(OperatorExpiryJob.NAME);
    await boss.schedule(OperatorExpiryJob.NAME, EXPIRY_CRON, null, {
      tz: JOBS_TIME_ZONE,
      missed: 'once',
    });
    await boss.work(OperatorExpiryJob.NAME, async () => {
      await this.expiry.run();
    });
    await boss.createQueue(GuestIdPurgeJob.NAME);
    await boss.schedule(GuestIdPurgeJob.NAME, GUEST_ID_PURGE_CRON, null, {
      tz: JOBS_TIME_ZONE,
      missed: 'once',
    });
    await boss.work(GuestIdPurgeJob.NAME, async () => {
      await this.guestIds.run();
    });
    this.boss = boss;
    this.log.log(
      `Background jobs started (operator expiry 06:45, guest ID deletion 03:30, ${JOBS_TIME_ZONE})`,
    );
    return boss;
  }

  async onApplicationShutdown() {
    await this.boss?.stop({ graceful: true });
    this.boss = null;
  }
}
