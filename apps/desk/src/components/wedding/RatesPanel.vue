<script setup lang="ts">
import {
  CATEGORY_LABELS,
  formatDateTime,
  formatDayMonth,
  formatINR,
  siteLabel,
} from '@shubhjets/shared';
import { computed, onMounted, reactive, ref } from 'vue';
import { api, ApiError } from '../../api/client';
import { useAirports } from '../../composables/airports';
import {
  blocker,
  hourlyBreakdown,
  hoursText,
  type ComparisonRow,
  type LegComparison,
  type RatesOverview,
  type RequestResult,
} from '../../composables/rates';
import { useToast } from '../../composables/toast';
import type { WeddingDetail } from '../../composables/weddings';
import ShareSheet from '../ShareSheet.vue';
import SjButton from '../SjButton.vue';
import SjSkeleton from '../SjSkeleton.vue';
import AddReplySheet from './AddReplySheet.vue';
import RequestRatesSheet from './RequestRatesSheet.vue';

/**
 * The Rates tab (BRIEF.md §2 steps 3–5): who you asked and who replied, then each leg's rates
 * side by side, cheapest first, and the jet(s) you choose. Net rates are internal only.
 */
const props = defineProps<{ wedding: WeddingDetail }>();
const emit = defineEmits<{ changed: [] }>();
const toast = useToast();
const { label: airportLabel } = useAirports();
/** The venue or helipad when the leg has one, else the airport. */
function endOf(legId: string, end: 'from' | 'to', iata: string): string {
  const l = props.wedding.legs.find((x) => x.id === legId);
  const site = end === 'from' ? l?.fromSite : l?.toSite;
  return site ? siteLabel(site) : airportLabel(iata);
}

const data = ref<RatesOverview | null>(null);
const requestOpen = ref(false);
const replyOpen = ref(false);
const replyOperator = ref<string | null>(null);
const busy = ref<string | null>(null);
/** Ticked rows per leg, for choosing several jets. */
const ticked = reactive<Record<string, string[]>>({});

async function load() {
  try {
    data.value = await api<RatesOverview>(`/weddings/${props.wedding.id}/rates`);
    for (const leg of data.value.comparison)
      ticked[leg.legId] = leg.rows.filter((r) => r.chosen).map((r) => r.responseId);
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : "Couldn't load rates");
  }
}
onMounted(load);

const closed = computed(() =>
  ['SIGNED_AND_PAID', 'FLYING', 'DONE', 'LOST'].includes(props.wedding.status),
);

async function refresh() {
  await load();
  emit('changed');
}

const pdfBusy = ref<string | null>(null);
const rrDoc = ref<{ id: string; operator: string } | null>(null);
/** The request as a branded PDF for the operator, then the Share sheet (WhatsApp, email…). */
async function requestPdf(requestId: string, operatorName: string) {
  pdfBusy.value = requestId;
  try {
    const r = await api<{ documentId: string }>(`/rate-requests/${requestId}/pdf`, {
      method: 'POST',
    });
    rrDoc.value = { id: r.documentId, operator: operatorName };
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : "Couldn't make the PDF");
  } finally {
    pdfBusy.value = null;
  }
}

async function chase(requestId: string) {
  // Open the tab right away so phone browsers don't block it.
  const tab = window.open('', '_blank');
  try {
    const r = await api<RequestResult>(`/rate-requests/${requestId}/message`);
    const url = r.whatsappUrl ?? r.mailtoUrl;
    if (url && tab) tab.location.href = url;
    else {
      tab?.close();
      await navigator.clipboard.writeText(r.message).catch(() => undefined);
      toast.show({
        tone: 'info',
        message: 'No phone or email saved: the message is copied, paste it where you talk to them.',
      });
    }
  } catch (e) {
    tab?.close();
    toast.error(e instanceof ApiError ? e.message : "Couldn't prepare the message");
  }
}

function addReply(operatorId: string | null = null) {
  replyOperator.value = operatorId;
  replyOpen.value = true;
}

async function setChoice(leg: LegComparison, ids: string[], message: string) {
  busy.value = leg.legId;
  try {
    await api(`/legs/${leg.legId}/choices`, { method: 'PUT', json: { rateResponseIds: ids } });
    await refresh();
    toast.success(message);
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : "Couldn't save the choice");
    ticked[leg.legId] = leg.rows.filter((r) => r.chosen).map((r) => r.responseId);
  } finally {
    busy.value = null;
  }
}

function chooseOne(leg: LegComparison, row: ComparisonRow) {
  void setChoice(leg, [row.responseId], `${row.operator.name} chosen for leg ${leg.seq}`);
}

/** "Valid till … · replied in 2 h", skipping whatever is missing. */
const rowNote = (row: ComparisonRow) =>
  [
    row.validUntil && !row.expired
      ? `Valid till ${formatDateTime(new Date(row.validUntil))}`
      : null,
    row.replyHours !== null ? `Replied in ${hoursText(row.replyHours)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

const tickedSeats = (leg: LegComparison) =>
  leg.rows
    .filter((r) => ticked[leg.legId]?.includes(r.responseId))
    .reduce((s, r) => s + (r.seats ?? 0), 0);
const tickedChanged = (leg: LegComparison) =>
  JSON.stringify([...(ticked[leg.legId] ?? [])].sort()) !==
  JSON.stringify(
    leg.rows
      .filter((r) => r.chosen)
      .map((r) => r.responseId)
      .sort(),
  );
const multiBlocker = (leg: LegComparison) => {
  const n = ticked[leg.legId]?.length ?? 0;
  if (!n) return 'Tick the jets to use';
  if (tickedSeats(leg) < leg.pax) return `Ticked jets seat ${tickedSeats(leg)}; ${leg.pax} guests`;
  return null;
};
</script>

<template>
  <div>
    <SjSkeleton v-if="!data" :lines="5" height="4rem" />
    <template v-else>
      <!-- Who you asked -->
      <section class="card mb-3" aria-labelledby="asked-h">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <h2 id="asked-h" class="h3 mb-0">Asked</h2>
            <span class="small text-secondary"
              >{{ data.summary.replied }} of {{ data.summary.asked }} replied</span
            >
          </div>
          <p v-if="!data.requests.length" class="text-secondary mb-0">
            Nobody asked yet. Ask two to four verified operators so you can compare.
          </p>
          <div v-for="r in data.requests" :key="r.id" class="sj-row">
            <div class="flex-fill">
              <span class="fw-bold">{{ r.operator.name }}</span>
              <span v-if="r.replied" class="small text-success d-block"
                >✓ Replied in {{ hoursText(r.replyHours ?? 0) }}</span
              >
              <span
                v-else
                class="small d-block"
                :class="r.overdue ? 'text-danger fw-bold' : 'text-secondary'"
              >
                {{ r.overdue ? '⚠ No reply for' : 'Waiting' }} {{ hoursText(r.waitingHours ?? 0) }}
              </span>
              <button
                type="button"
                class="sj-pdflink"
                :disabled="pdfBusy === r.id"
                @click="requestPdf(r.id, r.operator.name)"
              >
                {{ pdfBusy === r.id ? 'Making PDF…' : 'Rate request PDF' }}
              </button>
            </div>
            <SjButton
              v-if="!r.replied"
              variant="secondary"
              size="sm"
              :disabled-reason="closed ? 'Rates are closed for this wedding' : null"
              @click="chase(r.id)"
              >Chase</SjButton
            >
            <SjButton
              v-if="!r.replied"
              size="sm"
              :disabled-reason="closed ? 'Rates are closed for this wedding' : null"
              @click="addReply(r.operator.id)"
              >Add reply</SjButton
            >
          </div>
        </div>
      </section>

      <!-- Comparison per leg -->
      <section
        v-for="leg in data.comparison"
        :key="leg.legId"
        class="card mb-3"
        :aria-label="`Leg ${leg.seq} rates`"
      >
        <div class="card-body">
          <h2 class="h3 mb-1">
            Leg {{ leg.seq }}: {{ endOf(leg.legId, 'from', leg.from) }} →
            {{ endOf(leg.legId, 'to', leg.to) }}
          </h2>
          <p class="small text-secondary mb-2">
            {{ formatDayMonth(leg.date) }} · {{ leg.pax }} guests<template v-if="leg.category">
              · {{ CATEGORY_LABELS[leg.category].toLowerCase()
              }}{{ leg.category.startsWith('HELICOPTER') ? '' : ' or larger' }}</template
            >
            <template v-if="leg.chosenSeats">
              ·
              <span class="text-success fw-bold"
                >✓ chosen: {{ leg.chosenSeats }} seats,
                {{ formatINR(leg.chosenCost, { paise: 'never' }) }}</span
              ></template
            >
          </p>
          <p v-if="!leg.rows.length" class="text-secondary mb-0">No rates yet for this leg.</p>
          <div
            v-for="row in leg.rows"
            :key="row.responseId"
            class="sj-rate"
            :class="{ 'is-chosen': row.chosen, 'is-dim': !!blocker(row) }"
          >
            <div class="d-flex gap-2 align-items-start">
              <input
                v-if="!closed && !row.seatsCoverPax"
                v-model="ticked[leg.legId]"
                type="checkbox"
                class="form-check-input mt-1"
                :value="row.responseId"
                :disabled="!!blocker(row)"
                :aria-label="`Use ${row.operator.name} as one of several jets`"
              />
              <div class="flex-fill">
                <div class="d-flex justify-content-between gap-2 flex-wrap">
                  <span class="fw-bold">{{ row.operator.name }}</span>
                  <span class="fw-bold">{{ formatINR(row.cost, { paise: 'never' }) }}</span>
                </div>
                <div class="small">
                  {{ row.aircraft || 'Aircraft not given'
                  }}<template v-if="row.seats"> · {{ row.seats }} seats</template>
                  <template v-if="row.pricing"> · {{ hourlyBreakdown(row.pricing) }}</template>
                  <template v-else-if="row.perSeat">
                    · {{ formatINR(row.perSeat, { paise: 'never' }) }}/seat</template
                  >
                </div>
                <div class="d-flex gap-1 flex-wrap mt-1">
                  <span v-if="row.responseId === leg.cheapestId" class="sj-badge sj-badge--gold"
                    >★ Cheapest</span
                  >
                  <span
                    v-if="row.chosen"
                    class="sj-badge"
                    style="background: #dcf2e4; color: #145c36"
                    >✓ Chosen</span
                  >
                  <span v-if="row.isPackage" class="sj-badge sj-badge--muted"
                    >Package {{ formatINR(row.netRate, { paise: 'never' }) }}</span
                  >
                  <span v-if="row.seats && !row.seatsCoverPax" class="sj-badge sj-badge--warn"
                    >Seats {{ row.seats }} of {{ leg.pax }}</span
                  >
                  <span
                    v-if="row.expired"
                    class="sj-badge"
                    style="background: #fde2df; color: #8a1c12"
                    >Expired</span
                  >
                  <span
                    v-if="!row.quotable.ok"
                    class="sj-badge"
                    style="background: #fde2df; color: #8a1c12"
                    >⛔ {{ row.quotable.reason }}</span
                  >
                </div>
                <div v-if="rowNote(row)" class="small text-secondary mt-1">{{ rowNote(row) }}</div>
              </div>
            </div>
            <div v-if="!closed && row.seatsCoverPax" class="mt-2 d-flex gap-2">
              <SjButton
                v-if="!row.chosen"
                size="sm"
                :loading="busy === leg.legId"
                loading-label="Saving…"
                :disabled-reason="blocker(row)"
                @click="chooseOne(leg, row)"
              >
                Choose
              </SjButton>
              <SjButton
                v-else
                variant="ghost"
                size="sm"
                :loading="busy === leg.legId"
                loading-label="Saving…"
                @click="setChoice(leg, [], 'Choice cleared')"
              >
                Unchoose
              </SjButton>
            </div>
          </div>
          <div v-if="!closed && leg.rows.some((r) => !r.seatsCoverPax && !blocker(r))" class="mt-2">
            <SjButton
              variant="secondary"
              size="sm"
              :loading="busy === leg.legId"
              loading-label="Saving…"
              :disabled-reason="tickedChanged(leg) ? multiBlocker(leg) : 'Tick the jets to use'"
              @click="
                setChoice(
                  leg,
                  ticked[leg.legId] ?? [],
                  `${ticked[leg.legId]?.length} jets chosen for leg ${leg.seq}`,
                )
              "
            >
              Use ticked jets ({{ tickedSeats(leg) }} of {{ leg.pax }} seats)
            </SjButton>
          </div>
        </div>
      </section>

      <div v-if="!closed" class="sj-actionbar">
        <SjButton variant="secondary" class="flex-fill" @click="requestOpen = true"
          >Ask for rates</SjButton
        >
        <SjButton class="flex-fill" @click="addReply()">Add a reply</SjButton>
      </div>
      <p v-else class="small text-secondary">Rates are closed for this wedding.</p>
    </template>

    <ShareSheet
      :open="!!rrDoc"
      :document-id="rrDoc?.id ?? null"
      :title="`rate request to ${rrDoc?.operator ?? ''}`"
      :filename="`Rate-request-${wedding.code}.pdf`"
      @close="rrDoc = null"
    />
    <RequestRatesSheet
      :open="requestOpen"
      :wedding-id="wedding.id"
      :legs="wedding.legs"
      @close="requestOpen = false"
      @sent="refresh"
    />
    <AddReplySheet
      :open="replyOpen"
      :wedding-id="wedding.id"
      :legs="wedding.legs"
      :requests="data?.requests ?? []"
      :operator-id="replyOperator"
      @close="replyOpen = false"
      @saved="((replyOpen = false), refresh())"
    />
  </div>
</template>

<style scoped>
.sj-pdflink {
  border: 0;
  background: none;
  padding: 4px 0;
  min-height: 44px;
  font-size: 0.8125rem;
  color: var(--sj-gold-dark);
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 3px;
}
.sj-pdflink:disabled {
  opacity: 0.6;
  cursor: progress;
}
.sj-row {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 8px 0;
  border-top: 1px solid #eceef2;
}
.sj-rate {
  padding: 12px;
  border: 1px solid #e3e5ea;
  border-radius: 10px;
  margin-bottom: 8px;
  transition:
    border-color var(--sj-fast),
    background-color var(--sj-fast);
}
.sj-rate.is-chosen {
  border-color: #34a36b;
  background: #f2fbf5;
}
.sj-rate.is-dim {
  opacity: 0.75;
}
</style>
