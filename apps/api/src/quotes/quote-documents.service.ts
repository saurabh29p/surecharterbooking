import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import { QuotesService } from './quotes.service.js';

export type ShareChannel =
  | 'WEB_SHARE'
  | 'WHATSAPP'
  | 'TELEGRAM'
  | 'EMAIL'
  | 'INSTAGRAM'
  | 'MESSENGER'
  | 'COPY_LINK'
  | 'DOWNLOAD';

/** Issuing and sending quotes. (The branded PDF and its leak scan are added next.) */
@Injectable()
export class QuoteDocumentsService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly quotes: QuotesService,
  ) {}

  async issue(id: string, confirmLooser: boolean) {
    await this.ds.transaction((m) => this.quotes.issue(m, id, confirmLooser));
    return this.quotes.get(id);
  }

  async markSent(id: string, _channel: ShareChannel, _recipient: string | null) {
    await this.ds.transaction((m) => this.quotes.markSent(m, id));
    return this.quotes.get(id);
  }
}
