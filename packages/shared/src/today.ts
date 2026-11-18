/**
 * The Today screen (BRIEF.md §5.4): "Do now" actions made by code rules from the records, each with
 * one button, most urgent first; and what you keep this month against the target.
 */
import {
  addDays,
  daysBetween,
  formatDate,
  formatDayMonth,
  formatTime,
  toIstDate,
  type IsoDate,
} from './dates.js';
import { formatINR, formatINRShort, type Paise } from './money.js';
import type { ConfirmationItem } from './payments.js';
import { whatsappUrl } from './sharing.js';

export type ActionUrgency = 'NOW' | 'TODAY' | 'SOON';
export const URGENCY_LABELS: Record<ActionUrgency, string> = {
  NOW: 'Now',
  TODAY: 'Today',
  SOON: 'Coming up',
};

export type ActionKind =
  | 'ACCEPTANCE'
  | 'NEW_ENQUIRY'
  | 'QUOTE_EXPIRING'
  | 'MARK_FLOWN'
  | 'GUEST_IDS'
  | 'CONFIRM'
  | 'OPERATOR_EXPIRY'
  | 'CHASE_OPERATOR'
  | 'PAYMENT_DUE'
  | 'CONFIRM_STEP'
  | 'SHARE_QUOTE'
  | 'BUILD_QUOTE'
  | 'QUOTE_EXPIRED'
  | 'PAY_OPERATOR'
  | 'FOLLOW_UP'
  | 'ASK_RATES'
  | 'ADD_LEGS'
  | 'COMMISSION'
  | 'PROFILE';

/** Within one urgency, earlier kinds come first: a client waiting beats paperwork. */
const KIND_ORDER: ActionKind[] = [
  'ACCEPTANCE',
  'NEW_ENQUIRY',
  'QUOTE_EXPIRING',
  'MARK_FLOWN',
  'GUEST_IDS',
  'CONFIRM',
  'OPERATOR_EXPIRY',
  'CHASE_OPERATOR',
  'PAYMENT_DUE',
  'CONFIRM_STEP',
  'SHARE_QUOTE',
  'BUILD_QUOTE',
  'QUOTE_EXPIRED',
  'PAY_OPERATOR',
  'FOLLOW_UP',
  'ASK_RATES',
  'ADD_LEGS',
  'COMMISSION',
  'PROFILE',
];
const URGENCY_ORDER: ActionUrgency[] = ['NOW', 'TODAY', 'SOON'];

/** The one button on an action. */
export type ActionButton =
  | { type: 'OPEN'; label: string; to: string }
  | { type: 'LINK'; label: string; href: string }
  | { type: 'MARK_FLOWN'; label: string; legId: string };

export interface TodayAction {
  /** Stable per thing-to-do, so "Later" can hide it until tomorrow. */
  key: string;
  kind: ActionKind;
  urgency: ActionUrgency;
  title: string;
  detail: string | null;
  /** Where the card itself opens. */
  to: string;
  button: ActionButton;
  /** For ordering within a kind (soonest first). */
  dueAt: string | null;
}

export interface Contact {
  name: string | null;
  phone: string | null;
}

/** Everything the rules look at, gathered by the API. */
export interface TodayFacts {
  /** Weddings in "Enquiry". */
  enquiries: Array<{
    weddingId: string;
    code: string;
    city: string | null;
    contact: Contact;
    fromWebsite: boolean;
    createdAt: Date;
    legs: number;
    rateRequests: number;
  }>;
  /** Rate requests with no reply yet from that operator, on weddings still collecting rates. */
  rateWaits: Array<{
    weddingId: string;
    code: string;
    city: string | null;
    operatorId: string;
    operator: string;
    contact: Contact;
    sentAt: Date;
    repliesIn: number;
    asked: number;
  }>;
  /** Weddings collecting rates, with no live or accepted quote. */
  quoteNeeded: Array<{
    weddingId: string;
    code: string;
    legs: number;
    legsWithRates: number;
    legsChosen: number;
    hasDraft: boolean;
  }>;
  /** The newest issued quote of each wedding not yet confirmed. */
  quotes: Array<{
    weddingId: string;
    code: string;
    city: string | null;
    quoteId: string;
    label: string;
    status: 'ISSUED' | 'SHARED' | 'ACCEPTED' | 'EXPIRED';
    validUntil: Date | null;
    contact: Contact;
    linkAcceptances: Array<{ name: string; at: Date }>;
  }>;
  /** Weddings with an accepted quote that aren't confirmed yet. */
  confirmations: Array<{
    weddingId: string;
    code: string;
    contact: Contact;
    checklist: ConfirmationItem[];
    dueToConfirm: Paise;
    firstFlight: IsoDate | null;
  }>;
  /** Weddings flying soon with guest IDs still missing. */
  guestIds: Array<{
    weddingId: string;
    code: string;
    contact: Contact;
    firstFlight: IsoDate;
    missing: number;
  }>;
  /** Confirmed legs whose flight date has passed. */
  flown: Array<{
    weddingId: string;
    code: string;
    legId: string;
    seq: number;
    route: string;
    flightDate: IsoDate;
  }>;
  /** Operator payouts made payable but not yet paid. */
  payouts: Array<{
    weddingId: string;
    code: string;
    paymentId: string;
    operator: string;
    amount: Paise;
    firstFlight: IsoDate | null;
  }>;
  /** Commission still owed on flown weddings. */
  commissions: Array<{ weddingId: string; code: string; partner: string; remaining: Paise }>;
  followUps: Array<{
    partnerId: string;
    firm: string;
    contact: Contact;
    due: IsoDate;
    status: string;
  }>;
  expiries: Array<{
    operatorId: string;
    operator: string;
    kind: 'NSOP' | 'INSURANCE';
    expiresOn: IsoDate;
    contact: Contact;
  }>;
  profile: { id: string; warnings: string[] } | null;
}

export interface TodayRules {
  now: Date;
  today: IsoDate;
  brand: string;
  chaseAfterHours: number;
  quoteWarnHours: number;
  guestIdsDueDays: number;
}

const HOUR = 3_600_000;

function hoursText(ms: number): string {
  const h = Math.max(0, ms) / HOUR;
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${Math.round(h)} h`;
  return `${Math.round(h / 24)} days`;
}

function inDays(today: IsoDate, date: IsoDate): string {
  const d = daysBetween(today, date);
  if (d === 0) return 'today';
  if (d === 1) return 'tomorrow';
  if (d < 0) return `${-d} day${d === -1 ? '' : 's'} ago`;
  return `in ${d} days`;
}

const hello = (c: Contact, greeting = 'Namaste') =>
  c.name ? `${greeting} ${c.name},` : `${greeting},`;

/** A WhatsApp button when there is a number, otherwise open the record. */
function whatsappOr(c: Contact, label: string, text: string, fallback: ActionButton): ActionButton {
  return c.phone ? { type: 'LINK', label, href: whatsappUrl(text, c.phone) } : fallback;
}

const wedding = (id: string, tab?: string) => `/weddings/${id}${tab ? `?tab=${tab}` : ''}`;

/** Turns the facts into the "Do now" list, most urgent first. */
export function buildTodayActions(f: TodayFacts, r: TodayRules): TodayAction[] {
  const out: TodayAction[] = [];
  const nowMs = r.now.getTime();
  const sign = `\n\nThank you,\n${r.brand}`;

  // A client said "I accept" on a secure link: confirm it while they are warm.
  for (const q of f.quotes) {
    if (q.status === 'ACCEPTED' || !q.linkAcceptances.length) continue;
    const a = q.linkAcceptances[0]!;
    out.push({
      key: `acceptance:${q.quoteId}`,
      kind: 'ACCEPTANCE',
      urgency: 'NOW',
      title: `${q.code}: ${a.name} accepted the quote on the link`,
      detail: `Check and confirm the acceptance (${formatDayMonth(a.at)}, ${formatTime(a.at)}).`,
      to: wedding(q.weddingId, 'quote'),
      button: { type: 'OPEN', label: 'Confirm acceptance', to: wedding(q.weddingId, 'quote') },
      dueAt: a.at.toISOString(),
    });
  }

  // Enquiries: reply to new website ones within the hour; otherwise get the rates moving.
  for (const e of f.enquiries) {
    const ageMs = nowMs - e.createdAt.getTime();
    if (e.fromWebsite && e.rateRequests === 0 && ageMs < 48 * HOUR) {
      out.push({
        key: `enquiry:${e.weddingId}`,
        kind: 'NEW_ENQUIRY',
        urgency: 'NOW',
        title: `${e.code}: new website enquiry${e.contact.name ? ` from ${e.contact.name}` : ''}`,
        detail: `${e.city ?? 'City not given'} · came in ${hoursText(ageMs)} ago. Reply within the hour.`,
        to: wedding(e.weddingId),
        button: whatsappOr(
          e.contact,
          'Reply on WhatsApp',
          `${hello(e.contact)}\n\nThank you for your enquiry about guest flights for ${e.city ? `the ${e.city} wedding` : 'your wedding'}. I'm putting together options now. Could you confirm the dates and where your guests fly from?${sign}`,
          { type: 'OPEN', label: 'Open enquiry', to: wedding(e.weddingId) },
        ),
        dueAt: e.createdAt.toISOString(),
      });
      continue;
    }
    if (e.rateRequests > 0) continue;
    out.push(
      e.legs === 0
        ? {
            key: `add-legs:${e.weddingId}`,
            kind: 'ADD_LEGS',
            urgency: 'TODAY',
            title: `${e.code}: add the flights`,
            detail: `${e.city ?? 'New enquiry'}${e.contact.name ? ` · ${e.contact.name}` : ''}: no legs yet.`,
            to: wedding(e.weddingId),
            button: { type: 'OPEN', label: 'Add flights', to: wedding(e.weddingId) },
            dueAt: e.createdAt.toISOString(),
          }
        : {
            key: `ask-rates:${e.weddingId}`,
            kind: 'ASK_RATES',
            urgency: 'TODAY',
            title: `${e.code}: ask operators for rates`,
            detail: `${e.legs} leg${e.legs === 1 ? '' : 's'} ready${e.city ? ` · ${e.city}` : ''}.`,
            to: wedding(e.weddingId, 'rates'),
            button: { type: 'OPEN', label: 'Ask for rates', to: wedding(e.weddingId, 'rates') },
            dueAt: e.createdAt.toISOString(),
          },
    );
  }

  // Operators who haven't replied to a rate request in time.
  for (const w of f.rateWaits) {
    const waited = nowMs - w.sentAt.getTime();
    if (waited < r.chaseAfterHours * HOUR) continue;
    out.push({
      key: `chase:${w.weddingId}:${w.operatorId}`,
      kind: 'CHASE_OPERATOR',
      urgency: 'NOW',
      title: `${w.code}: ${w.repliesIn} of ${w.asked} rates in, chase ${w.operator}`,
      detail: `Asked ${hoursText(waited)} ago, no reply yet.`,
      to: wedding(w.weddingId, 'rates'),
      button: whatsappOr(
        w.contact,
        `WhatsApp ${w.operator}`,
        `${hello(w.contact, 'Hello')}\n\nFollowing up on our rate request for ${w.code}${w.city ? ` (${w.city} wedding)` : ''}. Could you share your rates and availability today?${sign}`,
        { type: 'OPEN', label: 'Open rates', to: wedding(w.weddingId, 'rates') },
      ),
      dueAt: w.sentAt.toISOString(),
    });
  }

  // Rates are in: choose and quote.
  for (const q of f.quoteNeeded) {
    if (q.legs === 0 || q.legsWithRates < q.legs) continue;
    const ready = q.legsChosen === q.legs;
    out.push({
      key: `quote:${q.weddingId}`,
      kind: 'BUILD_QUOTE',
      urgency: 'TODAY',
      title: ready
        ? `${q.code}: jets chosen, ${q.hasDraft ? 'finish' : 'build'} the quote`
        : `${q.code}: rates in for every leg, choose and quote`,
      detail: ready
        ? 'Check the markup and issue the quote.'
        : `${q.legsChosen} of ${q.legs} legs chosen.`,
      to: wedding(q.weddingId, ready ? 'quote' : 'rates'),
      button: ready
        ? {
            type: 'OPEN',
            label: q.hasDraft ? 'Finish quote' : 'Build quote',
            to: wedding(q.weddingId, 'quote'),
          }
        : { type: 'OPEN', label: 'Compare rates', to: wedding(q.weddingId, 'rates') },
      dueAt: null,
    });
  }

  // Issued quotes: share them, remind before they lapse, revise when they have.
  for (const q of f.quotes) {
    if (q.status === 'ACCEPTED') continue;
    const left = q.validUntil ? q.validUntil.getTime() - nowMs : null;
    const expired = q.status === 'EXPIRED' || (left !== null && left <= 0);
    if (expired) {
      if (q.validUntil && nowMs - q.validUntil.getTime() > 3 * 24 * HOUR) continue;
      out.push({
        key: `quote-expired:${q.quoteId}`,
        kind: 'QUOTE_EXPIRED',
        urgency: 'TODAY',
        title: `${q.code}: quote ${q.label} has expired`,
        detail: 'Check the operator rates again and send a new version, or mark the wedding lost.',
        to: wedding(q.weddingId, 'quote'),
        button: { type: 'OPEN', label: 'Revise quote', to: wedding(q.weddingId, 'quote') },
        dueAt: q.validUntil?.toISOString() ?? null,
      });
      continue;
    }
    if (q.status === 'ISSUED') {
      out.push({
        key: `share-quote:${q.quoteId}`,
        kind: 'SHARE_QUOTE',
        urgency: left !== null && left < r.quoteWarnHours * HOUR ? 'NOW' : 'TODAY',
        title: `${q.code}: quote ${q.label} is ready, share it`,
        detail: left !== null ? `Valid for ${hoursText(left)} more.` : null,
        to: wedding(q.weddingId, 'quote'),
        button: { type: 'OPEN', label: 'Share quote', to: wedding(q.weddingId, 'quote') },
        dueAt: q.validUntil?.toISOString() ?? null,
      });
      continue;
    }
    if (left !== null && left < r.quoteWarnHours * HOUR) {
      const until = q.validUntil!;
      out.push({
        key: `quote-expiring:${q.quoteId}`,
        kind: 'QUOTE_EXPIRING',
        urgency: 'NOW',
        title: `${q.code}: quote expires in ${hoursText(left)}`,
        detail: `Valid until ${formatTime(until)}${toIstDate(until) !== r.today ? `, ${formatDayMonth(until)}` : ''}. Nudge ${q.contact.name ?? 'the client'}.`,
        to: wedding(q.weddingId, 'quote'),
        button: whatsappOr(
          q.contact,
          'Remind on WhatsApp',
          `${hello(q.contact)}\n\nA gentle reminder: our quote ${q.label} for ${q.city ? `the ${q.city} wedding` : 'the wedding'} flights is valid until ${formatTime(until)}, ${formatDate(until)}. Shall I hold the aircraft for you?${sign}`,
          { type: 'OPEN', label: 'Open quote', to: wedding(q.weddingId, 'quote') },
        ),
        dueAt: until.toISOString(),
      });
    }
  }

  // Accepted quotes: what still stands between them and "Signed and paid" (rule 2).
  for (const c of f.confirmations) {
    const missing = c.checklist.filter((i) => !i.done);
    const soon = !!c.firstFlight && daysBetween(r.today, c.firstFlight) <= 7;
    if (!missing.length) {
      out.push({
        key: `confirm:${c.weddingId}`,
        kind: 'CONFIRM',
        urgency: 'NOW',
        title: `${c.code} is ready to confirm`,
        detail: 'Quote accepted, terms signed and payment in. Book the aircraft with the operator.',
        to: wedding(c.weddingId, 'money'),
        button: { type: 'OPEN', label: 'Confirm wedding', to: wedding(c.weddingId, 'money') },
        dueAt: null,
      });
      continue;
    }
    const pay = missing.find((i) => i.key === 'payment');
    if (pay) {
      out.push({
        key: `payment:${c.weddingId}`,
        kind: 'PAYMENT_DUE',
        urgency: soon ? 'NOW' : 'TODAY',
        title: `${c.code}: ${formatINRShort(c.dueToConfirm)} to receive before confirming`,
        detail: c.firstFlight ? `First flight ${inDays(r.today, c.firstFlight)}.` : null,
        to: wedding(c.weddingId, 'money'),
        button: whatsappOr(
          c.contact,
          'Remind on WhatsApp',
          `${hello(c.contact)}\n\nThank you for confirming the quote for ${c.code}. A payment of ${formatINR(c.dueToConfirm, { paise: 'never' })} confirms the aircraft. Shall I send the payment details?${sign}`,
          { type: 'OPEN', label: 'Open money', to: wedding(c.weddingId, 'money') },
        ),
        dueAt: c.firstFlight,
      });
    }
    const other = missing.find((i) => i.key !== 'payment');
    if (other) {
      out.push({
        key: `confirm-step:${c.weddingId}:${other.key}`,
        kind: 'CONFIRM_STEP',
        urgency: soon ? 'NOW' : 'TODAY',
        title: `${c.code}: ${other.key === 'terms' ? 'get the client terms signed' : other.label.toLowerCase()}`,
        detail: other.hint,
        to: wedding(c.weddingId, other.key === 'terms' ? 'docs' : 'quote'),
        button: {
          type: 'OPEN',
          label: other.key === 'terms' ? 'Open terms' : 'Open quote',
          to: wedding(c.weddingId, other.key === 'terms' ? 'docs' : 'quote'),
        },
        dueAt: c.firstFlight,
      });
    }
  }

  // Guest IDs for flights coming up.
  for (const g of f.guestIds) {
    const days = daysBetween(r.today, g.firstFlight);
    if (days > r.guestIdsDueDays || days < 0 || g.missing <= 0) continue;
    out.push({
      key: `guest-ids:${g.weddingId}`,
      kind: 'GUEST_IDS',
      urgency: days <= 2 ? 'NOW' : 'TODAY',
      title: `${g.code} flies ${inDays(r.today, g.firstFlight)}: ${g.missing} guest ID${g.missing === 1 ? '' : 's'} missing`,
      detail: 'Operators need every passenger’s ID before departure.',
      to: wedding(g.weddingId, 'guests'),
      button: whatsappOr(
        g.contact,
        'Ask for IDs',
        `${hello(g.contact)}\n\nFor the flights on ${formatDate(g.firstFlight)} we still need ID copies for ${g.missing} guest${g.missing === 1 ? '' : 's'} (Aadhaar, passport or another government photo ID). Could you send them today?${sign}`,
        { type: 'OPEN', label: 'Open guests', to: wedding(g.weddingId, 'guests') },
      ),
      dueAt: g.firstFlight,
    });
  }

  // Flights that have happened: one tap marks them flown.
  for (const l of f.flown) {
    if (l.flightDate >= r.today) continue;
    out.push({
      key: `flown:${l.legId}`,
      kind: 'MARK_FLOWN',
      urgency: 'NOW',
      title: `${l.code}: did leg ${l.seq} fly?`,
      detail: `${l.route} · ${formatDate(l.flightDate)}`,
      to: wedding(l.weddingId),
      button: { type: 'MARK_FLOWN', label: 'Mark flown', legId: l.legId },
      dueAt: l.flightDate,
    });
  }

  // Operator payouts made payable but not paid yet.
  for (const p of f.payouts) {
    const soon = !!p.firstFlight && daysBetween(r.today, p.firstFlight) <= 3;
    out.push({
      key: `payout:${p.paymentId}`,
      kind: 'PAY_OPERATOR',
      urgency: soon ? 'NOW' : 'TODAY',
      title: `${p.code}: pay ${p.operator} ${formatINRShort(p.amount)}`,
      detail: p.firstFlight ? `Next flight ${inDays(r.today, p.firstFlight)}.` : null,
      to: wedding(p.weddingId, 'money'),
      button: { type: 'OPEN', label: 'Record payment', to: wedding(p.weddingId, 'money') },
      dueAt: p.firstFlight,
    });
  }

  for (const c of f.commissions) {
    if (c.remaining <= 0) continue;
    out.push({
      key: `commission:${c.weddingId}`,
      kind: 'COMMISSION',
      urgency: 'SOON',
      title: `${c.code}: pay ${c.partner} commission ${formatINRShort(c.remaining)}`,
      detail: 'The wedding has flown and the client has paid.',
      to: wedding(c.weddingId, 'money'),
      button: { type: 'OPEN', label: 'Pay commission', to: wedding(c.weddingId, 'money') },
      dueAt: null,
    });
  }

  for (const p of f.followUps) {
    if (p.due > r.today) continue;
    const late = daysBetween(p.due, r.today);
    const who = p.contact.name ? `${p.contact.name} (${p.firm})` : p.firm;
    out.push({
      key: `follow-up:${p.partnerId}:${p.due}`,
      kind: 'FOLLOW_UP',
      urgency: 'TODAY',
      title: `Call ${who}: follow-up ${late === 0 ? 'due today' : `${late} day${late === 1 ? '' : 's'} late`}`,
      detail: null,
      to: `/partners/${p.partnerId}`,
      button: p.contact.phone
        ? { type: 'LINK', label: 'Call', href: `tel:${p.contact.phone}` }
        : { type: 'OPEN', label: 'Open partner', to: `/partners/${p.partnerId}` },
      dueAt: p.due,
    });
  }

  for (const e of f.expiries) {
    const days = daysBetween(r.today, e.expiresOn);
    if (days > 30) continue;
    const what = e.kind === 'NSOP' ? 'NSOP permit' : 'insurance';
    out.push({
      key: `expiry:${e.operatorId}:${e.kind}:${e.expiresOn}`,
      kind: 'OPERATOR_EXPIRY',
      urgency: days <= 7 ? 'NOW' : 'SOON',
      title:
        days < 0
          ? `${e.operator}: ${what} expired, operator blocked`
          : `${e.operator}: ${what} expires ${inDays(r.today, e.expiresOn)}`,
      detail:
        days < 0
          ? 'Upload the renewed document to use them again.'
          : `On ${formatDate(e.expiresOn)}. Ask for the renewed copy.`,
      to: `/operators/${e.operatorId}`,
      button: whatsappOr(
        e.contact,
        'Ask for renewal',
        `${hello(e.contact, 'Hello')}\n\nOur records show your ${what} ${days < 0 ? 'expired' : 'expires'} on ${formatDate(e.expiresOn)}. Could you send the renewed copy so we can keep offering your aircraft?${sign}`,
        { type: 'OPEN', label: 'Open operator', to: `/operators/${e.operatorId}` },
      ),
      dueAt: e.expiresOn,
    });
  }

  if (f.profile?.warnings.length) {
    out.push({
      key: `profile:${f.profile.id}`,
      kind: 'PROFILE',
      urgency: 'SOON',
      title: 'Finish your business profile',
      detail: f.profile.warnings.join(' · '),
      to: `/settings/profiles/${f.profile.id}`,
      button: { type: 'OPEN', label: 'Open profile', to: `/settings/profiles/${f.profile.id}` },
      dueAt: null,
    });
  }

  return sortActions(out);
}

export function sortActions(actions: TodayAction[]): TodayAction[] {
  return actions
    .map((a, i) => ({ a, i }))
    .sort(
      (x, y) =>
        URGENCY_ORDER.indexOf(x.a.urgency) - URGENCY_ORDER.indexOf(y.a.urgency) ||
        KIND_ORDER.indexOf(x.a.kind) - KIND_ORDER.indexOf(y.a.kind) ||
        (x.a.dueAt ?? '￿').localeCompare(y.a.dueAt ?? '￿') ||
        x.i - y.i,
    )
    .map((x) => x.a);
}

/** "Later": hidden until 7 am IST tomorrow. */
export function snoozeUntil(today: IsoDate): Date {
  return new Date(`${addDays(today, 1)}T07:00:00+05:30`);
}

export interface MonthTracker {
  /** "Nov 2026" */
  label: string;
  /** What you keep: margin after partner commission. The target applies to this. */
  keep: Paise;
  /** Margin before commission. */
  margin: Paise;
  target: Paise;
  /** 0–100+, whole percent of target reached by what you keep. */
  percent: number;
  daysLeft: number;
  /** At the pace so far, what you would keep by the month end. */
  projected: Paise;
  /** Still needed to hit the target (0 when hit). */
  toGo: Paise;
}

/**
 * The month against the target. The target is measured on what you keep (after the partner's
 * commission); margin before commission is shown beside it. Straight-line projection.
 */
export function monthTracker(
  today: IsoDate,
  amounts: { keep: Paise; margin: Paise },
  target: Paise,
): MonthTracker {
  const [y, m, d] = today.split('-').map(Number) as [number, number, number];
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const { keep, margin } = amounts;
  return {
    label,
    keep,
    margin,
    target,
    percent: target > 0 ? Math.floor((keep * 100) / target) : 0,
    daysLeft: days - d,
    projected: Math.round((keep * days) / d),
    toGo: Math.max(0, target - keep),
  };
}

/** First and last day of the month containing `today`. */
export function monthRange(today: IsoDate): { from: IsoDate; to: IsoDate } {
  const [y, m] = today.split('-').map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, '0');
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, '0')}` };
}
