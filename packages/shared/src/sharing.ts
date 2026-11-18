/**
 * Sharing (BRIEF.md §5.6): the app prepares the message and a secure link; you press send.
 * Message texts never contain internal figures (no costs, margins or commission).
 */
import type { DocumentType } from './documents.js';

export const SHARE_CHANNELS = [
  'WHATSAPP',
  'TELEGRAM',
  'EMAIL',
  'INSTAGRAM',
  'MESSENGER',
  'WEB_SHARE',
  'COPY_LINK',
  'DOWNLOAD',
] as const;
export type ShareChannel = (typeof SHARE_CHANNELS)[number];

export const SHARE_CHANNEL_LABELS: Record<ShareChannel, string> = {
  WHATSAPP: 'WhatsApp',
  TELEGRAM: 'Telegram',
  EMAIL: 'Email',
  INSTAGRAM: 'Instagram',
  MESSENGER: 'Messenger',
  WEB_SHARE: 'Phone share sheet',
  COPY_LINK: 'Copied link',
  DOWNLOAD: 'Downloaded PDF',
};

export interface ShareContext {
  type: DocumentType;
  /** Greeting name (first name or firm); omitted when unknown. */
  recipientName?: string | null;
  brand: string;
  weddingCode?: string | null;
  city?: string | null;
  /** e.g. "W-102 · Q1" or an invoice number. */
  reference?: string | null;
  /** Client price incl. GST, already formatted (quotes only). */
  total?: string | null;
  /** Already formatted, e.g. "19 Nov 2026, 2:30 pm IST". */
  validUntil?: string | null;
  link: string;
}

/** The message sent with the link, ready to edit. */
export function shareMessage(c: ShareContext): string {
  const hi = c.recipientName ? `Namaste ${c.recipientName},` : 'Namaste,';
  const wedding = c.city ? `the ${c.city} wedding` : 'the wedding';
  const body: Record<DocumentType, string> = {
    QUOTE: `here is our quote ${c.reference ?? ''} for ${wedding} flights${c.total ? `: ${c.total} including GST` : ''}${c.validUntil ? `, valid until ${c.validUntil}` : ''}. You can view it and accept it here:`,
    CLIENT_TERMS: `here are the charter terms and booking confirmation for ${wedding} (${c.weddingCode ?? ''}). Please review them and sign:`,
    INVOICE: `here is tax invoice ${c.reference ?? ''} for ${wedding} flights (${c.weddingCode ?? ''}):`,
    RATE_REQUEST: `rate request from ${c.brand} for ${wedding} (ref ${c.weddingCode ?? ''}). Details are here:`,
    OPERATOR_AGREEMENT: `here is the Operator–Broker Agreement with ${c.brand} for your review and signature:`,
    REFERRAL_AGREEMENT: `here is the Partner Referral Agreement with ${c.brand} for your review and signature:`,
  };
  return `${hi}\n\n${body[c.type].replace(/\s+([:,.])/g, '$1').replace(/\s{2,}/g, ' ')}\n${c.link}\n\nThank you,\n${c.brand}`;
}

/** wa.me link with the message; phone in +91… form, or none to pick a chat. */
export function whatsappUrl(text: string, phone?: string | null): string {
  const digits = (phone ?? '').replace(/\D/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/** Telegram's share link: the link plus the message text. */
export function telegramUrl(link: string, text: string): string {
  const withoutLink = text.replace(link, '').trim();
  return `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(withoutLink)}`;
}

export function mailtoUrl(to: string | null | undefined, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(to ?? '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** Instagram DM and Messenger don't accept pre-filled text: copy the message, then open them. */
export const INSTAGRAM_INBOX_URL = 'https://www.instagram.com/direct/inbox/';
export const MESSENGER_URL = 'https://www.messenger.com/';

/** Default email subject per document. */
export function shareSubject(
  c: Pick<ShareContext, 'type' | 'brand' | 'reference' | 'weddingCode'>,
): string {
  const labels: Record<DocumentType, string> = {
    QUOTE: `Your charter quote ${c.reference ?? ''}`,
    CLIENT_TERMS: `Charter terms and booking confirmation ${c.weddingCode ?? ''}`,
    INVOICE: `Tax invoice ${c.reference ?? ''}`,
    RATE_REQUEST: `Rate request ${c.weddingCode ?? ''}`,
    OPERATOR_AGREEMENT: 'Operator–Broker Agreement',
    REFERRAL_AGREEMENT: 'Partner Referral Agreement',
  };
  return `${labels[c.type].trim()} · ${c.brand}`;
}

export type LinkState = 'ACTIVE' | 'EXPIRED' | 'REVOKED';

export function linkState(
  s: { expiresAt: Date | string | null; revokedAt: Date | string | null },
  now: Date,
): LinkState {
  if (s.revokedAt) return 'REVOKED';
  if (s.expiresAt && new Date(s.expiresAt) <= now) return 'EXPIRED';
  return 'ACTIVE';
}
