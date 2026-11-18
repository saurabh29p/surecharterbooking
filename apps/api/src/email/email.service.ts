import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config.js';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  attachments?: { filename: string; content: Buffer }[];
  /** Same key = same email: a retry never sends twice. */
  idempotencyKey?: string;
}

/**
 * Email from the app through Resend (POST /emails, bearer key, base64 attachments). Configured by
 * RESEND_API_KEY and EMAIL_FROM (a verified sender on your own domain). Without them the desk
 * falls back to the phone's mail app.
 */
@Injectable()
export class EmailService {
  private readonly log = new Logger('Email');
  /** Replaceable in tests. */
  fetchImpl: typeof fetch = (...args) => fetch(...args);
  options: { apiKey?: string; from?: string; replyTo?: string; url: string };

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.options = {
      apiKey: config.RESEND_API_KEY,
      from: config.EMAIL_FROM,
      replyTo: config.EMAIL_REPLY_TO,
      url: config.RESEND_API_URL,
    };
  }

  configured(): boolean {
    return !!(this.options.apiKey && this.options.from);
  }

  async send(msg: EmailMessage): Promise<{ id: string }> {
    if (!this.configured()) throw new ServiceUnavailableException('Email sending is not set up');
    const res = await this.fetchImpl(`${this.options.url.replace(/\/$/, '')}/emails`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.options.apiKey}`,
        'Content-Type': 'application/json',
        ...(msg.idempotencyKey ? { 'Idempotency-Key': msg.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from: this.options.from,
        to: [msg.to],
        subject: msg.subject,
        text: msg.text,
        html: msg.html,
        ...(this.options.replyTo ? { reply_to: this.options.replyTo } : {}),
        attachments: (msg.attachments ?? []).map((a) => ({
          filename: a.filename,
          content: a.content.toString('base64'),
        })),
      }),
    }).catch((err: unknown) => {
      this.log.error(`Email service unreachable: ${String(err)}`);
      throw new ServiceUnavailableException(
        "Couldn't reach the email service. Try again, or send it from your mail app.",
      );
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok || !body.id) {
      this.log.error(`Email refused (${res.status}): ${body.message ?? 'no message'}`);
      throw new ServiceUnavailableException(
        `The email service refused it${body.message ? `: ${body.message}` : ''}. Try again, or send it from your mail app.`,
      );
    }
    return { id: body.id };
  }
}
