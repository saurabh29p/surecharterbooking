import { Injectable, Logger } from '@nestjs/common';
import { runAs } from '../audit/request-context.js';
import { GuestsService } from './guests.service.js';

/** Daily: deletes guest ID files N days after the wedding's last flight (DPDP: keep no longer than needed). */
@Injectable()
export class GuestIdPurgeJob {
  static readonly NAME = 'guest-id-purge';
  private readonly log = new Logger('GuestIdPurge');

  constructor(private readonly guests: GuestsService) {}

  async run(): Promise<number> {
    const n = await runAs({ type: 'SYSTEM', id: GuestIdPurgeJob.NAME }, () =>
      this.guests.purgeDue(),
    );
    if (n) this.log.log(`Deleted ${n} guest ID file(s) past the keeping period`);
    return n;
  }
}
