<script setup lang="ts">
import {
  formatBps,
  formatDayMonth,
  formatDateTime,
  formatINR,
  GST_STATES,
  parseRupees,
  QUOTE_STATUS_LABELS,
  stateName,
  type CancellationSchedule,
} from '@shubhjets/shared';
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { api, ApiError, download, fetchFile } from '../../api/client';
import { useAirports } from '../../composables/airports';
import {
  PAYMENT_PLANS,
  SHARE_CHANNELS,
  relativeTime,
  type QuoteDetail,
  type QuoteSummary,
  type ShareRow,
} from '../../composables/quotes';
import { useToast } from '../../composables/toast';
import type { WeddingDetail } from '../../composables/weddings';
import ScheduleEditor from '../ScheduleEditor.vue';
import SjButton from '../SjButton.vue';
import SjConfirm from '../SjConfirm.vue';
import SjField from '../SjField.vue';
import SjSheet from '../SjSheet.vue';
import SjSkeleton from '../SjSkeleton.vue';
import QuoteCancellation from './QuoteCancellation.vue';
import QuoteJetRow from './QuoteJetRow.vue';

/**
 * The Quote tab (BRIEF.md §5.4 quote builder, §5.5 quote PDF): markup per jet, extras, GST from
 * Settings, totals with margin and commission (internal), our cancellation charges next to the
 * operators', then issue the branded PDF, share it, and record acceptance.
 */
const props = defineProps<{ wedding: WeddingDetail }>();
const emit = defineEmits<{ changed: []; goRates: [] }>();
const toast = useToast();
const { label: airportLabel } = useAirports();

const quotes = ref<QuoteSummary[] | null>(null);
const q = ref<QuoteDetail | null>(null);
const shares = ref<ShareRow[]>([]);
const busy = ref<string | null>(null);
const saveState = ref<'idle' | 'saving' | 'saved'>('idle');
const pdfFile = ref<File | null>(null);
const justIssued = ref(false);

const draft = computed(() => q.value?.status === 'DRAFT');
const live = computed(() => !!q.value && ['ISSUED', 'SHARED'].includes(q.value.status));
const expired = computed(
  () =>
    q.value?.status === 'EXPIRED' ||
    (live.value && !!q.value?.validUntil && new Date(q.value.validUntil) < new Date()),
);
const closedWedding = computed(() =>
  ['SIGNED_AND_PAID', 'FLYING', 'DONE', 'LOST'].includes(props.wedding.status),
);
const activeLegs = computed(() => props.wedding.legs.filter((l) => l.status !== 'CANCELLED'));
const buildBlocker = computed(() => {
  if (closedWedding.value)
    return props.wedding.status === 'LOST'
      ? 'This wedding is marked lost'
      : 'This wedding is confirmed';
  if (!activeLegs.value.length) return 'Add the legs first';
  const missing = activeLegs.value.filter((l) => !['CHOSEN', 'QUOTED'].includes(l.status));
  if (missing.length)
    return `Choose a jet for leg ${missing.map((l) => l.seq).join(', ')} on the Rates tab first`;
  return null;
});
const money = (p: number) => formatINR(p, { paise: 'never' });
const moneyExact = (p: number) => formatINR(p);

// ---------- Loading ----------

async function load() {
  try {
    quotes.value = await api<QuoteSummary[]>(`/weddings/${props.wedding.id}/quotes`);
    const current = quotes.value.find((x) => x.status === 'DRAFT') ?? quotes.value[0];
    q.value = current ? await api<QuoteDetail>(`/quotes/${current.id}`) : null;
    syncTerms();
    if (q.value && q.value.status !== 'DRAFT') await afterIssue();
  } catch (e) {
    quotes.value ??= [];
    toast.error(e instanceof ApiError ? e.message : "Couldn't load the quote");
  }
}
onMounted(load);

async function afterIssue() {
  if (!q.value) return;
  shares.value = await api<ShareRow[]>(`/quotes/${q.value.id}/shares`).catch(() => []);
  // Fetch the PDF now, so the phone's share sheet can open straight from the tap.
  pdfFile.value = null;
  if (!q.value.hasPdf) return;
  try {
    const { blob, name } = await fetchFile(`/quotes/${q.value.id}/pdf`, `${q.value.reference}.pdf`);
    pdfFile.value = new File([blob], name, { type: 'application/pdf' });
  } catch {
    // Share falls back to fetching on tap.
  }
}

async function startDraft() {
  busy.value = 'start';
  try {
    q.value = await api<QuoteDetail>(`/weddings/${props.wedding.id}/quotes`, { method: 'POST' });
    syncTerms();
    quotes.value = await api<QuoteSummary[]>(`/weddings/${props.wedding.id}/quotes`);
    toast.success(
      q.value.version > 1
        ? `Version ${q.value.version} started from the last quote. Change jets on the Rates tab or prices here.`
        : 'Draft quote ready. Prices update as you type.',
    );
    emit('changed');
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : "Couldn't start the quote");
  } finally {
    busy.value = null;
  }
}

// ---------- Saving a draft ----------

async function patch(body: Record<string, unknown>, ok?: string): Promise<boolean> {
  if (!q.value) return false;
  saveState.value = 'saving';
  try {
    q.value = await api<QuoteDetail>(`/quotes/${q.value.id}`, { method: 'PATCH', json: body });
    saveState.value = 'saved';
    if (ok) toast.success(ok);
    return true;
  } catch (e) {
    saveState.value = 'idle';
    toast.error(
      e instanceof ApiError ? (Object.values(e.fields)[0] ?? e.message) : "Couldn't save",
    );
    return false;
  }
}

const pendingLines = new Map<string, Record<string, unknown>>();
let lineTimer: ReturnType<typeof setTimeout> | null = null;
function onMarkup(
  legId: string,
  rateResponseId: string,
  v: { markupType: string; markupValue: number },
) {
  pendingLines.set(`${legId}:${rateResponseId}`, { legId, rateResponseId, ...v });
  saveState.value = 'saving';
  if (lineTimer) clearTimeout(lineTimer);
  lineTimer = setTimeout(flushLines, 600);
}
async function flushLines() {
  if (lineTimer) clearTimeout(lineTimer);
  lineTimer = null;
  if (!pendingLines.size) return;
  const lines = [...pendingLines.values()];
  pendingLines.clear();
  await patch({ lines });
}
onBeforeUnmount(() => void flushLines());

// Terms (validity, payment, client's state, included, conditions)
const terms = reactive({
  validityHours: '24',
  plan: '0',
  state: '',
  inclusions: '',
  exclusions: '',
  note: '',
});
function syncTerms() {
  if (!q.value) return;
  terms.validityHours = String(q.value.validityHours);
  const i = PAYMENT_PLANS.findIndex((p) => p.plan.join() === q.value!.paymentPlanBps.join());
  terms.plan = i >= 0 ? String(i) : 'custom';
  terms.state = q.value.gst.placeOfSupplyState ?? '';
  terms.inclusions = q.value.inclusions ?? '';
  terms.exclusions = q.value.exclusions ?? '';
  terms.note = q.value.cancellation.note ?? '';
}
function saveValidity() {
  const n = Number(terms.validityHours);
  if (!Number.isInteger(n) || n < 1 || n > 720) {
    toast.error('Validity: enter whole hours from 1 to 720');
    terms.validityHours = String(q.value?.validityHours ?? 24);
    return;
  }
  if (n !== q.value?.validityHours) void patch({ validityHours: n });
}
function savePlan() {
  const plan = PAYMENT_PLANS[Number(terms.plan)]?.plan;
  if (plan) void patch({ paymentPlanBps: plan });
}
function saveText(key: 'inclusions' | 'exclusions' | 'cancellationTerms', value: string) {
  const current = key === 'cancellationTerms' ? q.value?.cancellation.note : q.value?.[key];
  if ((current ?? '') !== value.trim()) void patch({ [key]: value });
}

// ---------- Extras ----------
const extrasOpen = ref(false);
const extras = ref<{ description: string; cost: string; sell: string }[]>([]);
const extrasError = ref<string | null>(null);
function openExtras() {
  extras.value = (q.value?.extras ?? []).map((e) => ({
    description: e.description,
    cost: formatINR(e.cost, { symbol: false }),
    sell: formatINR(e.sell, { symbol: false }),
  }));
  if (!extras.value.length) extras.value.push({ description: '', cost: '', sell: '' });
  extrasError.value = null;
  extrasOpen.value = true;
}
async function saveExtras() {
  extrasError.value = null;
  const body: { description: string; cost: number; sell: number }[] = [];
  for (const [i, e] of extras.value.entries()) {
    if (!e.description.trim() && !e.cost.trim() && !e.sell.trim()) continue;
    try {
      body.push({
        description: e.description.trim(),
        cost: parseRupees(e.cost || '0'),
        sell: parseRupees(e.sell || '0'),
      });
    } catch {
      extrasError.value = `Extra ${i + 1}: enter amounts in rupees, e.g. 25,000`;
      return;
    }
  }
  busy.value = 'extras';
  if (await patch({ extras: body }, body.length ? 'Extras saved' : 'Extras removed'))
    extrasOpen.value = false;
  busy.value = null;
}

// ---------- Cancellation ----------
const oursOpen = ref(false);
const oursDraft = ref<CancellationSchedule>([]);
const oursValid = ref(true);
function editOurs() {
  oursDraft.value = q.value ? [...q.value.cancellation.ours] : [];
  oursValid.value = true;
  oursOpen.value = true;
}
async function saveOurs() {
  busy.value = 'ours';
  if (await patch({ cancellationSchedule: oursDraft.value }, 'Your cancellation charges saved'))
    oursOpen.value = false;
  busy.value = null;
}
async function applyFix() {
  if (!q.value?.cancellation.fix) return;
  const before = q.value.cancellation.ours;
  busy.value = 'fix';
  const ok = await patch({ cancellationSchedule: q.value.cancellation.fix });
  busy.value = null;
  if (ok)
    toast.success('Your charges now cover every operator’s', () => {
      void patch({ cancellationSchedule: before }, 'Change undone');
    });
}

const opOpen = ref<string | null>(null);
const opDraft = ref<CancellationSchedule>([]);
const opValid = ref(true);
const opSaveForOperator = ref(true);
const opName = computed(
  () =>
    q.value?.cancellation.operators.find((o) => o.rateResponseId === opOpen.value)?.operator.name ??
    '',
);
const opTerms = computed(
  () =>
    q.value?.cancellation.operators.find((o) => o.rateResponseId === opOpen.value)?.terms ?? null,
);
function editOperator(rr: string) {
  const o = q.value?.cancellation.operators.find((x) => x.rateResponseId === rr);
  opDraft.value = o?.schedule
    ? [...o.schedule]
    : [
        { minDays: 7, chargeBps: 1000 },
        { minDays: 0, chargeBps: 10_000 },
      ];
  opValid.value = true;
  opSaveForOperator.value = true;
  opOpen.value = rr;
}
async function saveOperator() {
  if (!q.value || !opOpen.value) return;
  busy.value = 'op';
  try {
    await api(`/rate-responses/${opOpen.value}/cancellation-schedule`, {
      method: 'PUT',
      json: { schedule: opDraft.value, saveForOperator: opSaveForOperator.value },
    });
    q.value = await api<QuoteDetail>(`/quotes/${q.value.id}`);
    toast.success(`${opName.value}'s charges saved`);
    opOpen.value = null;
  } catch (e) {
    toast.error(
      e instanceof ApiError ? (Object.values(e.fields)[0] ?? e.message) : "Couldn't save",
    );
  } finally {
    busy.value = null;
  }
}

// ---------- Preview, issue ----------

async function preview() {
  if (!q.value) return;
  await flushLines();
  // Open the tab right away so phone browsers don't block it.
  const tab = window.open('', '_blank');
  busy.value = 'preview';
  try {
    const path = draft.value ? `/quotes/${q.value.id}/preview` : `/quotes/${q.value.id}/pdf`;
    const { blob } = await fetchFile(path, 'quote.pdf');
    const url = URL.createObjectURL(blob);
    if (tab) tab.location.href = url;
    else window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e) {
    tab?.close();
    toast.error(e instanceof ApiError ? e.message : "Couldn't make the preview");
  } finally {
    busy.value = null;
  }
}

const looserOpen = ref(false);
const looserGaps = ref<string[]>([]);
async function issue(confirmLooser = false) {
  if (!q.value) return;
  await flushLines();
  busy.value = 'issue';
  try {
    q.value = await api<QuoteDetail>(`/quotes/${q.value.id}/issue`, {
      method: 'POST',
      json: { confirmLooser },
    });
    looserOpen.value = false;
    quotes.value = await api<QuoteSummary[]>(`/weddings/${props.wedding.id}/quotes`);
    justIssued.value = true;
    setTimeout(() => (justIssued.value = false), 1600);
    toast.success(`${q.value.reference} is ready to send`);
    emit('changed');
    await afterIssue();
  } catch (e) {
    if (e instanceof ApiError && e.body.code === 'LOOSER_TERMS') {
      looserGaps.value = (e.body.gaps as string[]) ?? [];
      looserOpen.value = true;
    } else toast.error(e instanceof ApiError ? e.message : "Couldn't issue the quote");
  } finally {
    busy.value = null;
  }
}

const discardOpen = ref(false);
async function discard() {
  if (!q.value) return;
  busy.value = 'discard';
  try {
    await api(`/quotes/${q.value.id}`, { method: 'DELETE' });
    discardOpen.value = false;
    toast.success('Draft discarded');
    await load();
    emit('changed');
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : "Couldn't discard the draft");
  } finally {
    busy.value = null;
  }
}

// ---------- Share, sent, accepted ----------

const shareText = computed(() =>
  q.value
    ? `${props.wedding.venueCity ? `${props.wedding.venueCity} wedding` : 'Wedding'} flights: our quote ${q.value.reference}, ${money(q.value.totals.total)} including GST.${q.value.validUntil ? ` Valid until ${formatDateTime(new Date(q.value.validUntil))}.` : ''}`
    : '',
);

async function share() {
  if (!q.value) return;
  let file = pdfFile.value;
  if (!file) {
    await afterIssue();
    file = pdfFile.value;
  }
  const data = file ? { files: [file], title: q.value.reference, text: shareText.value } : null;
  if (data && navigator.canShare?.(data)) {
    try {
      await navigator.share(data);
      await markSent('WEB_SHARE', null, 'Quote shared');
    } catch (e) {
      if ((e as DOMException).name !== 'AbortError')
        toast.error("Couldn't open the share sheet. Download the PDF and send it yourself.");
    }
    return;
  }
  // No share sheet (desktop): download it, then say how it was sent.
  await downloadPdf();
  sentChannel.value = 'WHATSAPP';
  sentOpen.value = true;
}

async function downloadPdf() {
  if (!q.value) return;
  busy.value = 'download';
  try {
    await download(`/quotes/${q.value.id}/pdf`, `${q.value.reference}.pdf`);
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : "Couldn't download the PDF");
  } finally {
    busy.value = null;
  }
}

const sentOpen = ref(false);
const sentChannel = ref('WHATSAPP');
const sentTo = ref('');
async function markSent(channel: string, recipient: string | null, ok?: string) {
  if (!q.value) return;
  busy.value = 'sent';
  try {
    q.value = await api<QuoteDetail>(`/quotes/${q.value.id}/sent`, {
      method: 'POST',
      json: { channel, recipient },
    });
    shares.value = await api<ShareRow[]>(`/quotes/${q.value.id}/shares`);
    quotes.value = await api<QuoteSummary[]>(`/weddings/${props.wedding.id}/quotes`);
    sentOpen.value = false;
    sentTo.value = '';
    toast.success(
      ok ??
        `Marked as sent on ${SHARE_CHANNELS.find((c) => c.value === channel)?.label ?? channel}`,
    );
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : "Couldn't record it");
  } finally {
    busy.value = null;
  }
}

const acceptOpen = ref(false);
const acceptName = ref('');
const acceptError = ref<string | null>(null);
function openAccept() {
  acceptName.value = props.wedding.client?.name ?? props.wedding.partner?.firm ?? '';
  acceptError.value = null;
  acceptOpen.value = true;
}
async function accept() {
  if (!q.value) return;
  busy.value = 'accept';
  acceptError.value = null;
  try {
    q.value = await api<QuoteDetail>(`/quotes/${q.value.id}/accept`, {
      method: 'POST',
      json: { name: acceptName.value },
    });
    acceptOpen.value = false;
    quotes.value = await api<QuoteSummary[]>(`/weddings/${props.wedding.id}/quotes`);
    toast.success(`Accepted by ${q.value.acceptedName}. Next: signed terms and payment.`);
    emit('changed');
  } catch (e) {
    if (e instanceof ApiError && e.fields.name) acceptError.value = e.fields.name;
    else toast.error(e instanceof ApiError ? e.message : "Couldn't record the acceptance");
  } finally {
    busy.value = null;
  }
}

async function openVersion(id: string) {
  if (q.value?.id === id) return;
  try {
    q.value = await api<QuoteDetail>(`/quotes/${id}`);
    syncTerms();
    if (q.value.status !== 'DRAFT') await afterIssue();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : "Couldn't open that version");
  }
}

const statusClass = (s: string) =>
  ({
    DRAFT: 'sj-badge--muted',
    ISSUED: 'sj-badge--gold',
    SHARED: 'sj-badge--gold',
    ACCEPTED: 'sj-badge--ok',
    EXPIRED: 'sj-badge--bad',
    SUPERSEDED: 'sj-badge--muted',
  })[s] ?? 'sj-badge--muted';
const gstLabel = computed(() => {
  if (!q.value) return '';
  const g = q.value.totals.gst;
  return g.intraState
    ? `GST: CGST ${formatBps(g.rateBps / 2)} + SGST ${formatBps(g.rateBps / 2)}`
    : `GST: IGST ${formatBps(g.rateBps)}`;
});
const commissionLabel = computed(() => {
  const c = q.value?.commission;
  if (!c) return null;
  return `${props.wedding.partner?.firm ?? 'Partner'} (${formatBps(c.bps)} ${c.basis === 'MARGIN_SHARE' ? 'of margin' : 'of booking'})`;
});
const issueBlocker = computed(() =>
  !q.value ? null : (q.value.blockers[0] ?? (saveState.value === 'saving' ? 'Saving…' : null)),
);
</script>

<template>
  <div>
    <SjSkeleton v-if="quotes === null" :lines="5" height="4rem" />

    <!-- No quote yet -->
    <section v-else-if="!q" class="card mb-3">
      <div class="card-body text-center py-4">
        <div class="sj-empty-icon" aria-hidden="true">₹</div>
        <h2 class="h3">No quote yet</h2>
        <p class="text-secondary mb-3">
          Once every leg has its jet chosen, build the quote: add your markup, extras and terms,
          then issue the branded PDF.
        </p>
        <div class="d-flex flex-column gap-2 align-items-center">
          <SjButton
            :loading="busy === 'start'"
            loading-label="Building…"
            :disabled-reason="buildBlocker"
            @click="startDraft"
          >
            Build quote
          </SjButton>
          <SjButton
            v-if="buildBlocker && !closedWedding"
            variant="ghost"
            size="sm"
            @click="emit('goRates')"
          >
            Go to Rates
          </SjButton>
        </div>
      </div>
    </section>

    <template v-else>
      <!-- Header -->
      <section class="card mb-3" :class="{ 'sj-pop': justIssued }">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-start gap-2">
            <div>
              <h2 class="h3 mb-0">{{ q.reference }}</h2>
              <div class="small text-secondary">{{ q.businessProfile.label }}</div>
            </div>
            <span class="sj-badge" :class="expired ? 'sj-badge--bad' : statusClass(q.status)">
              {{ expired ? 'Expired' : QUOTE_STATUS_LABELS[q.status] }}
            </span>
          </div>
          <div class="sj-total mt-2">
            <div class="small text-secondary">Client pays, including GST</div>
            <div class="sj-total__amount">{{ moneyExact(q.totals.total) }}</div>
          </div>
          <div class="small mt-1">
            <template v-if="draft">
              Valid for {{ q.validityHours }} h once issued.
              <span class="text-secondary ms-1" aria-live="polite">
                {{ saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? '✓ Saved' : '' }}
              </span>
            </template>
            <template v-else-if="q.validUntil && q.status !== 'SUPERSEDED'">
              <span :class="expired ? 'text-danger fw-bold' : ''">
                {{ expired ? 'Expired' : 'Valid until' }}
                {{ formatDateTime(new Date(q.validUntil)) }} ({{ relativeTime(q.validUntil) }})
              </span>
            </template>
            <div v-if="q.acceptedAt" class="text-success fw-bold mt-1">
              ✓ Accepted by {{ q.acceptedName }} on {{ formatDateTime(new Date(q.acceptedAt)) }}
            </div>
          </div>
        </div>
      </section>

      <!-- What stops issuing, and what to check -->
      <div v-if="draft && q.blockers.length" class="sj-alert sj-alert--danger mb-3" role="alert">
        <div class="fw-bold mb-1">Before you can issue it</div>
        <ul class="mb-0 ps-3">
          <li v-for="b in q.blockers" :key="b">{{ b }}</li>
        </ul>
      </div>
      <details v-if="draft && q.warnings.length" class="sj-alert sj-alert--warn mb-3">
        <summary class="fw-bold">
          ⚠ {{ q.warnings.length }} thing{{ q.warnings.length === 1 ? '' : 's' }} to check
        </summary>
        <ul class="mb-0 mt-1 ps-3 small">
          <li v-for="w in q.warnings" :key="w">{{ w }}</li>
        </ul>
      </details>

      <!-- Legs and jets -->
      <section
        v-for="leg in q.legs"
        :key="leg.legId"
        class="card mb-3"
        :aria-label="`Leg ${leg.seq} price`"
      >
        <div class="card-body">
          <h3 class="h4 mb-0">
            Leg {{ leg.seq }}: {{ airportLabel(leg.from) }} → {{ airportLabel(leg.to) }}
          </h3>
          <div class="small text-secondary">
            {{ formatDayMonth(leg.date)
            }}<template v-if="leg.windowFrom || leg.windowTo">
              · {{ leg.windowFrom ?? '' }}–{{ leg.windowTo ?? '' }}</template
            >
            · {{ leg.pax }} guests ·
            <span :class="leg.seats < leg.pax ? 'text-danger fw-bold' : ''"
              >{{ leg.seats }} seats</span
            >
          </div>
          <p v-if="!leg.lines.length" class="text-danger small mb-0 mt-2">
            No jet chosen for this leg.
          </p>
          <QuoteJetRow
            v-for="line in leg.lines"
            :key="line.id"
            :line="line"
            :editable="draft"
            @change="(v) => onMarkup(leg.legId, line.rateResponseId, v)"
          />
        </div>
      </section>

      <!-- Extras -->
      <section class="card mb-3" aria-labelledby="extras-h">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-center gap-2">
            <h3 id="extras-h" class="h4 mb-0">Extras</h3>
            <SjButton v-if="draft" variant="secondary" size="sm" @click="openExtras">
              {{ q.extras.length ? 'Edit extras' : 'Add an extra' }}
            </SjButton>
          </div>
          <p v-if="!q.extras.length" class="small text-secondary mb-0 mt-1">
            Catering upgrades, décor, ground transfers… each with your cost and the client's price.
          </p>
          <div v-for="e in q.extras" :key="e.id" class="d-flex justify-content-between gap-2 mt-2">
            <span>{{ e.description }}</span>
            <span class="text-end">
              <b>{{ money(e.sell) }}</b>
              <span class="d-block small text-secondary">cost {{ money(e.cost) }}</span>
            </span>
          </div>
        </div>
      </section>

      <!-- Totals -->
      <section class="card mb-3 sj-sum" aria-labelledby="totals-h">
        <div class="card-body">
          <h3 id="totals-h" class="h4">Totals</h3>
          <div class="sj-line">
            <span>Charter{{ q.extras.length ? ' and extras' : '' }}</span
            ><span>{{ moneyExact(q.totals.sellSubtotal) }}</span>
          </div>
          <div class="sj-line">
            <span>{{ gstLabel }}</span><span>{{ moneyExact(q.totals.gst.total) }}</span>
          </div>
          <div class="sj-line sj-line--grand">
            <span>Client pays</span><span>{{ moneyExact(q.totals.total) }}</span>
          </div>
          <div class="sj-internal">
            <div class="sj-internal__label">Internal: never on the PDF</div>
            <div class="sj-line">
              <span>Operator cost</span><span>{{ money(q.totals.cost) }}</span>
            </div>
            <div class="sj-line">
              <span>Your margin</span>
              <span :class="q.totals.margin > 0 ? 'text-success fw-bold' : 'text-danger fw-bold'">
                {{ money(q.totals.margin) }} · {{ formatBps(q.totals.marginBps) }}
              </span>
            </div>
            <div v-if="commissionLabel" class="sj-line">
              <span>Commission: {{ commissionLabel }}</span
              ><span>−{{ money(q.totals.commission) }}</span>
            </div>
            <div class="sj-line fw-bold">
              <span>You keep</span><span>{{ money(q.totals.netMargin) }}</span>
            </div>
          </div>
        </div>
      </section>

      <QuoteCancellation
        :quote="q"
        :editable="draft"
        :fixing="busy === 'fix'"
        @edit-ours="editOurs"
        @edit-operator="editOperator"
        @apply-fix="applyFix"
      />

      <!-- Terms -->
      <section class="card mb-3" aria-labelledby="terms-h">
        <div class="card-body">
          <h3 id="terms-h" class="h4">Terms on the quote</h3>
          <template v-if="draft">
            <div class="d-flex gap-2">
              <div style="flex: 0 0 120px">
                <label class="form-label" for="q-valid">Valid for</label>
                <div class="input-group">
                  <input
                    id="q-valid"
                    v-model="terms.validityHours"
                    class="form-control"
                    inputmode="numeric"
                    @change="saveValidity"
                  />
                  <span class="input-group-text">h</span>
                </div>
              </div>
              <div class="flex-fill">
                <label class="form-label" for="q-plan">Payment</label>
                <select id="q-plan" v-model="terms.plan" class="form-select" @change="savePlan">
                  <option v-for="(p, i) in PAYMENT_PLANS" :key="p.label" :value="String(i)">
                    {{ p.label }}
                  </option>
                  <option v-if="terms.plan === 'custom'" value="custom" disabled>
                    Custom plan
                  </option>
                </select>
              </div>
            </div>
            <div class="mt-3">
              <label class="form-label" for="q-state">Client's state (for GST)</label>
              <select
                id="q-state"
                v-model="terms.state"
                class="form-select"
                @change="patch({ placeOfSupplyState: terms.state || null })"
              >
                <option value="">Not known: treat as my state (CGST + SGST)</option>
                <option v-for="s in GST_STATES" :key="s.code" :value="s.code">{{ s.name }}</option>
              </select>
            </div>
            <div class="mt-3">
              <SjField
                v-model="terms.inclusions"
                label="Included"
                optional
                multiline
                :maxlength="2000"
                placeholder="One per line, e.g. Fuel, crew and airport charges"
                @blur="saveText('inclusions', terms.inclusions)"
              />
              <SjField
                v-model="terms.exclusions"
                label="Not included"
                optional
                multiline
                :maxlength="2000"
                placeholder="One per line"
                @blur="saveText('exclusions', terms.exclusions)"
              />
              <SjField
                v-model="terms.note"
                label="Extra cancellation conditions"
                optional
                multiline
                :maxlength="2000"
                placeholder="e.g. Date changes are subject to aircraft availability."
                @blur="saveText('cancellationTerms', terms.note)"
              />
            </div>
          </template>
          <template v-else>
            <div class="sj-line">
              <span>Payment</span
              ><span class="text-end" style="white-space: normal">{{
                q.payment.map((p) => p.label).join(' · ')
              }}</span>
            </div>
            <div class="sj-line">
              <span>Client's state</span>
              <span>{{
                q.gst.placeOfSupplyState ? stateName(q.gst.placeOfSupplyState) : 'Not known'
              }}</span>
            </div>
            <div v-if="q.inclusions" class="small mt-2">
              <b>Included:</b> {{ q.inclusions.split('\n').join(' · ') }}
            </div>
            <div v-if="q.exclusions" class="small mt-1">
              <b>Not included:</b> {{ q.exclusions.split('\n').join(' · ') }}
            </div>
          </template>
          <div class="mt-2">
            <span class="small text-secondary">Payment schedule: </span>
            <span v-for="p in q.payment" :key="p.label" class="small d-block"
              >{{ p.label }}: <b>{{ moneyExact(p.amount) }}</b></span
            >
          </div>
        </div>
      </section>

      <!-- Sent log -->
      <section v-if="!draft" class="card mb-3" aria-labelledby="sent-h">
        <div class="card-body">
          <h3 id="sent-h" class="h4">Sent</h3>
          <p v-if="!shares.length" class="small text-secondary mb-0">
            Not sent yet. Share the PDF, then it is logged here.
          </p>
          <div
            v-for="s in shares"
            :key="s.id"
            class="d-flex justify-content-between small py-1 sj-row"
          >
            <span
              >{{ SHARE_CHANNELS.find((c) => c.value === s.channel)?.label ?? s.channel
              }}<template v-if="s.recipient"> · {{ s.recipient }}</template></span
            >
            <span class="text-secondary">{{ formatDateTime(new Date(s.sharedAt)) }}</span>
          </div>
        </div>
      </section>

      <!-- Versions -->
      <section v-if="(quotes?.length ?? 0) > 1" class="card mb-3" aria-labelledby="versions-h">
        <div class="card-body">
          <h3 id="versions-h" class="h4">Versions</h3>
          <button
            v-for="v in quotes"
            :key="v.id"
            type="button"
            class="sj-version"
            :class="{ 'is-current': v.id === q.id }"
            @click="openVersion(v.id)"
          >
            <span>{{ v.reference }}</span>
            <span class="sj-badge" :class="statusClass(v.status)">{{
              QUOTE_STATUS_LABELS[v.status]
            }}</span>
            <span class="ms-auto fw-bold">{{ money(v.total) }}</span>
          </button>
        </div>
      </section>
      <p v-if="draft" class="text-center mb-3">
        <SjButton variant="ghost" size="sm" @click="discardOpen = true"
          >Discard this draft</SjButton
        >
      </p>

      <!-- Actions -->
      <div v-if="draft" class="sj-actionbar">
        <SjButton
          variant="secondary"
          class="flex-fill"
          :loading="busy === 'preview'"
          loading-label="Making…"
          @click="preview"
          >Preview PDF</SjButton
        >
        <SjButton
          class="flex-fill"
          :loading="busy === 'issue'"
          loading-label="Issuing…"
          :disabled-reason="issueBlocker"
          @click="issue()"
        >
          Issue quote
        </SjButton>
      </div>
      <div v-else-if="(live || q.status === 'ACCEPTED') && !expired" class="sj-actionbar">
        <SjButton
          variant="secondary"
          class="flex-fill"
          :loading="busy === 'download'"
          loading-label="Downloading…"
          @click="downloadPdf"
          >PDF</SjButton
        >
        <SjButton
          class="flex-fill"
          :loading="busy === 'sent'"
          loading-label="Sharing…"
          @click="share"
          >Share quote</SjButton
        >
      </div>
      <div v-else-if="!closedWedding" class="sj-actionbar">
        <SjButton
          class="flex-fill"
          :loading="busy === 'start'"
          loading-label="Starting…"
          @click="startDraft"
          >New version</SjButton
        >
      </div>
      <div
        v-if="!draft && (live || q.status === 'ACCEPTED') && !expired"
        class="d-flex flex-wrap gap-2 justify-content-center mb-3"
      >
        <SjButton variant="ghost" size="sm" @click="sentOpen = true"
          >I sent it another way</SjButton
        >
        <SjButton v-if="q.status !== 'ACCEPTED'" variant="ghost" size="sm" @click="openAccept"
          >Client accepted</SjButton
        >
        <SjButton
          v-if="!closedWedding"
          variant="ghost"
          size="sm"
          :loading="busy === 'start'"
          loading-label="Starting…"
          @click="startDraft"
          >New version</SjButton
        >
      </div>
    </template>

    <!-- Sheets -->
    <SjSheet :open="extrasOpen" title="Extras" @close="extrasOpen = false">
      <div v-for="(e, i) in extras" :key="i" class="sj-extra">
        <div class="d-flex gap-2 align-items-end">
          <div class="flex-fill">
            <label class="form-label" :for="`x-d${i}`">What</label>
            <input
              :id="`x-d${i}`"
              v-model="e.description"
              class="form-control"
              maxlength="200"
              placeholder="e.g. Floral welcome on board"
            />
          </div>
          <button
            type="button"
            class="sj-x"
            :aria-label="`Remove extra ${i + 1}`"
            @click="extras.splice(i, 1)"
          >
            ×
          </button>
        </div>
        <div class="d-flex gap-2 mt-2">
          <div class="flex-fill">
            <label class="form-label" :for="`x-c${i}`">Your cost (₹)</label>
            <input
              :id="`x-c${i}`"
              v-model="e.cost"
              class="form-control"
              inputmode="decimal"
              placeholder="0"
            />
          </div>
          <div class="flex-fill">
            <label class="form-label" :for="`x-s${i}`">Client price (₹)</label>
            <input :id="`x-s${i}`" v-model="e.sell" class="form-control" inputmode="decimal" />
          </div>
        </div>
      </div>
      <button
        type="button"
        class="sj-linkbtn mb-2"
        :disabled="extras.length >= 10"
        @click="extras.push({ description: '', cost: '', sell: '' })"
      >
        + Add another
      </button>
      <div v-if="extrasError" class="text-danger small mb-2" role="alert">{{ extrasError }}</div>
      <SjButton block :loading="busy === 'extras'" loading-label="Saving…" @click="saveExtras"
        >Save extras</SjButton
      >
      <p class="small text-secondary mt-2 mb-0">The client sees only the description and price.</p>
    </SjSheet>

    <SjSheet :open="oursOpen" title="Your cancellation charges" @close="oursOpen = false">
      <p class="small text-secondary">
        What the client pays if they cancel, by how long before departure. Printed on the quote.
      </p>
      <ScheduleEditor v-model="oursDraft" id-prefix="ours" @valid="(v) => (oursValid = v)" />
      <SjButton
        block
        class="mt-3"
        :loading="busy === 'ours'"
        loading-label="Saving…"
        :disabled-reason="oursValid ? null : 'Fix the lines first'"
        @click="saveOurs"
      >
        Save my charges
      </SjButton>
    </SjSheet>

    <SjSheet :open="!!opOpen" :title="`${opName}'s cancellation charges`" @close="opOpen = null">
      <div v-if="opTerms" class="sj-quote-terms small mb-3">
        <div class="fw-bold mb-1">Their terms as written</div>
        <div style="white-space: pre-wrap">{{ opTerms }}</div>
      </div>
      <ScheduleEditor v-model="opDraft" id-prefix="op" @valid="(v) => (opValid = v)" />
      <label class="form-check mt-2">
        <input v-model="opSaveForOperator" type="checkbox" class="form-check-input" />
        <span class="form-check-label"
          >Also save as {{ opName }}'s usual charges for future replies</span
        >
      </label>
      <SjButton
        block
        class="mt-3"
        :loading="busy === 'op'"
        loading-label="Saving…"
        :disabled-reason="opValid ? null : 'Fix the lines first'"
        @click="saveOperator"
      >
        Save their charges
      </SjButton>
    </SjSheet>

    <SjSheet :open="sentOpen" title="How did you send it?" @close="sentOpen = false">
      <div class="mb-3">
        <label class="form-label" for="s-ch">Sent by</label>
        <select id="s-ch" v-model="sentChannel" class="form-select">
          <option v-for="c in SHARE_CHANNELS" :key="c.value" :value="c.value">{{ c.label }}</option>
        </select>
      </div>
      <SjField
        v-model="sentTo"
        label="To"
        optional
        placeholder="e.g. Planner P1"
        :maxlength="200"
      />
      <SjButton
        block
        :loading="busy === 'sent'"
        loading-label="Saving…"
        @click="markSent(sentChannel, sentTo.trim() || null)"
        >Mark as sent</SjButton
      >
    </SjSheet>

    <SjSheet :open="acceptOpen" title="Client accepted the quote" @close="acceptOpen = false">
      <p class="small text-secondary">
        Records who said yes and when. The wedding is confirmed later, once terms are signed and the
        payment is in.
      </p>
      <SjField
        v-model="acceptName"
        label="Accepted by"
        :server-error="acceptError ?? undefined"
        :maxlength="120"
      />
      <SjButton
        block
        :loading="busy === 'accept'"
        loading-label="Saving…"
        :disabled-reason="acceptName.trim().length < 2 ? 'Enter who accepted' : null"
        @click="accept"
      >
        Record acceptance
      </SjButton>
    </SjSheet>

    <SjSheet
      :open="looserOpen"
      title="Your terms are looser than the operator’s"
      @close="looserOpen = false"
    >
      <ul class="ps-3 small">
        <li v-for="g in looserGaps" :key="g">{{ g }}</li>
      </ul>
      <p class="small">
        If the client cancels in these windows, you pay the difference to the operator.
      </p>
      <SjButton
        v-if="q?.cancellation.fix"
        block
        class="mb-2"
        :loading="busy === 'fix'"
        loading-label="Fixing…"
        @click="((looserOpen = false), applyFix())"
      >
        Raise mine where needed
      </SjButton>
      <SjButton
        block
        variant="danger"
        :loading="busy === 'issue'"
        loading-label="Issuing…"
        @click="issue(true)"
        >Issue anyway</SjButton
      >
    </SjSheet>

    <SjConfirm
      :open="discardOpen"
      title="Discard this draft?"
      body="Your markups, extras and terms on this draft are deleted. The chosen jets stay on the Rates tab."
      confirm-label="Discard draft"
      :busy="busy === 'discard'"
      @confirm="discard"
      @cancel="discardOpen = false"
    />
  </div>
</template>

<style scoped>
.sj-total__amount {
  font-family: 'Bodoni Moda', Georgia, serif;
  font-weight: 600;
  font-size: 2rem;
  line-height: 1.1;
}
.sj-line {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 0;
  font-size: 0.9375rem;
}
.sj-line > span:last-child {
  white-space: nowrap;
  text-align: right;
}
.sj-line--grand {
  border-top: 1px solid #1a1a22;
  margin-top: 4px;
  padding-top: 8px;
  font-weight: 700;
  font-size: 1.0625rem;
}
.sj-internal {
  margin-top: 12px;
  background: #f6f7f9;
  border: 1px dashed #c9ccd4;
  border-radius: 10px;
  padding: 8px 12px;
}
.sj-internal__label {
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 700;
  color: #6b6f7a;
}
.sj-alert {
  border-radius: 10px;
  padding: 10px 12px;
}
.sj-alert--danger {
  background: #fdecea;
  color: #6b1a12;
  border: 1px solid #f3c2bc;
}
.sj-alert--warn {
  background: #fff6e0;
  color: #5c4310;
  border: 1px solid #f0d9a0;
}
.sj-alert--warn summary {
  cursor: pointer;
}
.sj-badge--ok {
  background: #dcf2e4;
  color: #145c36;
}
.sj-badge--bad {
  background: #fde2df;
  color: #8a1c12;
}
.sj-row {
  border-top: 1px solid #eceef2;
}
.sj-version {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 44px;
  border: 1px solid #e3e5ea;
  border-radius: 10px;
  background: #fff;
  padding: 8px 12px;
  margin-bottom: 6px;
  text-align: left;
  transition:
    border-color var(--sj-fast),
    transform var(--sj-fast);
}
.sj-version:hover {
  border-color: var(--sj-gold);
  transform: translateY(-1px);
}
.sj-version:active {
  transform: scale(0.98);
}
.sj-version.is-current {
  border-color: var(--sj-gold);
  background: #fbf6ea;
}
.sj-extra {
  border-bottom: 1px solid #eceef2;
  padding-bottom: 10px;
  margin-bottom: 10px;
}
.sj-x {
  width: 44px;
  height: 44px;
  border: 0;
  background: transparent;
  font-size: 1.25rem;
  color: var(--tblr-secondary);
  border-radius: 8px;
}
.sj-x:hover {
  background: #f1f2f5;
}
.sj-linkbtn {
  border: 0;
  background: none;
  padding: 10px 0;
  color: var(--sj-gold-dark);
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 3px;
}
.sj-quote-terms {
  background: #f6f7f9;
  border-radius: 10px;
  padding: 8px 12px;
}
.sj-empty-icon {
  width: 56px;
  height: 56px;
  margin: 0 auto 8px;
  border-radius: 50%;
  background: #fbf6ea;
  color: var(--sj-gold-dark);
  font-family: 'Bodoni Moda', Georgia, serif;
  font-size: 1.75rem;
  display: grid;
  place-items: center;
}
.sj-pop {
  animation: sj-pop 0.5s ease-out;
}
@keyframes sj-pop {
  0% {
    transform: scale(0.98);
    box-shadow: 0 0 0 0 rgba(212, 178, 106, 0.6);
  }
  60% {
    transform: scale(1.01);
    box-shadow: 0 0 0 8px rgba(212, 178, 106, 0);
  }
  100% {
    transform: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .sj-pop {
    animation: none;
  }
}
</style>
