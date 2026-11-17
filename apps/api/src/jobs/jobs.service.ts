import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { PgBoss } from 'pg-boss';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { OperatorExpiryJob } from './operator-expiry.job.js';

/** Daily at 06:45 India time, before the working day starts. */
export const EXPIRY_CRON = '45 6 * * *';
export const JOBS_TIME_ZONE = 'Asia/Kolkata';

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
    this.boss = boss;
    this.log.log(`Background jobs started (operator expiry daily at 06:45 ${JOBS_TIME_ZONE})`);
    return boss;
  }

  async onApplicationShutdown() {
    await this.boss?.stop({ graceful: true });
    this.boss = null;
  }
}
