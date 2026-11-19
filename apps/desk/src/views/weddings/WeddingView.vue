<script setup lang="ts">
import {
  CATEGORY_LABELS,
  LEAD_SOURCES,
  LEAD_SOURCE_LABELS,
  LEG_STATUS_LABELS,
  formatDate,
  toIstDate,
  type LeadSource,
} from '@shubhjets/shared';
import { computed, defineAsyncComponent, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { cachedApi } from '../../api/cache';
import { api, ApiError } from '../../api/client';
import SjButton from '../../components/SjButton.vue';
import SjConfirm from '../../components/SjConfirm.vue';
import SjField from '../../components/SjField.vue';
import SjSheet from '../../components/SjSheet.vue';
import SjSkeleton from '../../components/SjSkeleton.vue';
import LegFields from '../../components/wedding/LegFields.vue';
import WeddingStatusBadge from '../../components/wedding/WeddingStatusBadge.vue';
import { useAirports } from '../../composables/airports';
import type { PartnerList } from '../../composables/partners';
import { useToast } from '../../composables/toast';
import {
  emptyLeg,
  legBody,
  legToDraft,
  type LegDraft,
  type LegRow,
  type WeddingDetail,
} from '../../composables/weddings';

const RatesPanel = defineAsyncComponent(() => import('../../components/wedding/RatesPanel.vue'));
const QuotePanel = defineAsyncComponent(() => import('../../components/wedding/QuotePanel.vue'));
const DocsPanel = defineAsyncComponent(() => import('../../components/wedding/DocsPanel.vue'));
const MoneyPanel = defineAsyncComponent(() => import('../../components/wedding/MoneyPanel.vue'));
const GuestsPanel = defineAsyncComponent(() => import('../../components/wedding/GuestsPanel.vue'));
const WebsiteEnquiryCard = defineAsyncComponent(
  () => import('../../components/wedding/WebsiteEnquiryCard.vue'),
);

const route = useRoute();
const router = useRouter();
const toast = useToast();
const { label: airportLabel } = useAirports();
const id = String(route.params.id);
const w = ref<WeddingDetail | null>(null);
const busy = ref<string | null>(null);
const TABS = ['overview', 'rates', 'quote', 'money', 'guests', 'docs'] as const;
const TAB_LABELS = {
  overview: 'Overview',
  rates: 'Rates',
  quote: 'Quote',
  money: 'Money',
  guests: 'Guests',
  docs: 'Docs',
};
const tab = computed(() =>
  (TABS as readonly string[]).includes(String(route.query.tab))
    ? String(route.query.tab)
    : 'overview',
);
const setTab = (t: string) =>
  router.replace({ query: { ...route.query, tab: t === 'overview' ? undefined : t } });

async function load() {
  try {
    // First open shows the last saved copy at once; reloads after an edit always fetch fresh.
    if (w.value) w.value = await api<WeddingDetail>(`/weddings/${id}`);
    else await cachedApi<WeddingDetail>(`/weddings/${id}`, (v) => (w.value = v));
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : "Couldn't load this wedding");
  }
}
onMounted(load);

const locked = computed(
  () => !!w.value && ['SIGNED_AND_PAID', 'FLYING', 'DONE'].includes(w.value.status),
);
const lockReason = computed(() =>
  locked.value ? 'This wedding is confirmed; legs can no longer change here' : null,
);

// ---------- Legs ----------
const legSheet = ref(false);
const legEditing = ref<LegRow | null>(null);
const legDraft = ref<LegDraft>(emptyLeg());
const legErrors = ref<Record<string, string>>({});
const deleteLeg = ref<LegRow | null>(null);

function openLeg(l?: LegRow) {
  legEditing.value = l ?? null;
  legDraft.value = l
    ? legToDraft(l)
    : emptyLeg(w.value?.legs.length ? legToDraft(w.value.legs.at(-1)!) : undefined);
  legErrors.value = {};
  legSheet.value = true;
}

async function saveLeg() {
  legErrors.value = {};
  busy.value = 'leg';
  try {
    if (legEditing.value)
      await api(`/legs/${legEditing.value.id}`, { method: 'PATCH', json: legBody(legDraft.value) });
    else await api(`/weddings/${id}/legs`, { method: 'POST', json: legBody(legDraft.value) });
    legSheet.value = false;
    await load();
    toast.success(legEditing.value ? 'Leg updated' : 'Leg added');
  } catch (e) {
    if (e instanceof ApiError && Object.keys(e.fields).length) legErrors.value = e.fields;
    else toast.error(e instanceof ApiError ? e.message : "Couldn't save the leg");
  } finally {
    busy.value = null;
  }
}

async function doDeleteLeg() {
  if (!deleteLeg.value) return;
  busy.value = 'delete-leg';
  try {
    await api(`/legs/${deleteLeg.value.id}`, { method: 'DELETE' });
    await load();
    toast.success('Leg removed');
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : "Couldn't remove the leg");
  } finally {
    busy.value = null;
    deleteLeg.value = null;
  }
}

// ---------- Flights ----------
const today = toIstDate(new Date());
async function markFlown(l: LegRow) {
  busy.value = `flown-${l.id}`;
  try {
    await api(`/legs/${l.id}/flown`, { method: 'POST' });
    await load();
    toast.success(`Leg ${l.seq} marked flown`, async () => {
      try {
        await api(`/legs/${l.id}/flown`, { method: 'DELETE' });
        await load();
        toast.success('Undone');
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : "Couldn't undo");
      }
    });
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : "Couldn't mark it flown");
  } finally {
    busy.value = null;
  }
}

// ---------- Details ----------
const editing = ref(false);
const partners = ref<{ id: string; firm: string }[]>([]);
const form = reactive({
  partnerId: '',
  venueCity: '',
  startsOn: '',
  endsOn: '',
  leadSource: 'PARTNER' as LeadSource,
  notes: '',
  requiredPct: '100',
});
const errors = ref<Record<string, string>>({});

async function startEdit() {
  if (!w.value) return;
  Object.assign(form, {
    partnerId: w.value.partner?.id ?? '',
    venueCity: w.value.venueCity ?? '',
    startsOn: w.value.startsOn ?? '',
    endsOn: w.value.endsOn ?? '',
    leadSource: w.value.leadSource,
    notes: w.value.notes ?? '',
    requiredPct: String(w.value.requiredPaymentBps / 100),
  });
  errors.value = {};
  editing.value = true;
  if (!partners.value.length) {
    partners.value = (await api<PartnerList>('/partners')).items.map((p) => ({
      id: p.id,
      firm: p.firm,
    }));
  }
}

async function saveDetails() {
  errors.value = {};
  const pct = Number(form.requiredPct);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
    errors.value = { requiredPaymentBps: 'Enter a percentage between 0 and 100' };
    return;
  }
  busy.value = 'details';
  try {
    w.value = await api<WeddingDetail>(`/weddings/${id}`, {
      method: 'PATCH',
      json: {
        partnerId: form.partnerId || null,
        venueCity: form.venueCity,
        startsOn: form.startsOn,
        endsOn: form.endsOn,
        leadSource: form.leadSource,
        notes: form.notes,
        requiredPaymentBps: Math.round(pct * 100),
      },
    });
    editing.value = false;
    toast.success('Saved');
  } catch (e) {
    if (e instanceof ApiError && Object.keys(e.fields).length) errors.value = e.fields;
    else toast.error(e instanceof ApiError ? e.message : "Couldn't save");
  } finally {
    busy.value = null;
  }
}

// ---------- Lost / reopen ----------
const lostSheet = ref(false);
const lostReason = ref('');
async function markLost() {
  busy.value = 'lost';
  try {
    w.value = await api<WeddingDetail>(`/weddings/${id}/lost`, {
      method: 'POST',
      json: { reason: lostReason.value },
    });
    lostSheet.value = false;
    toast.success(`${w.value.code} marked as lost`, async () => {
      w.value = await api<WeddingDetail>(`/weddings/${id}/reopen`, { method: 'POST' });
      toast.success('Reopened');
    });
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : "Couldn't mark as lost");
  } finally {
    busy.value = null;
  }
}
async function reopen() {
  busy.value = 'reopen';
  try {
    w.value = await api<WeddingDetail>(`/weddings/${id}/reopen`, { method: 'POST' });
    toast.success('Reopened');
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : "Couldn't reopen");
  } finally {
    busy.value = null;
  }
}
</script>

<template>
  <div>
    <RouterLink to="/weddings" class="d-inline-block mb-2">‹ Weddings</RouterLink>
    <SjSkeleton v-if="!w" :lines="8" height="3rem" />
    <template v-else>
      <div class="d-flex align-items-center gap-2 flex-wrap mb-1">
        <h1 class="page-title mb-0">
          {{ w.code }}<template v-if="w.venueCity"> · {{ w.venueCity }}</template>
        </h1>
        <WeddingStatusBadge :status="w.status" />
      </div>
      <div class="text-secondary small mb-3">
        <template v-if="w.client">
          <RouterLink :to="`/clients/${w.client.id}`">{{ w.client.name }}</RouterLink>
        </template>
        <template v-else>No client yet</template>
        <template v-if="w.partner">
          · via
          <RouterLink :to="`/partners/${w.partner.id}`">{{ w.partner.firm }}</RouterLink></template
        >
        <template v-if="w.startsOn">
          · {{ formatDate(w.startsOn)
          }}<template v-if="w.endsOn && w.endsOn !== w.startsOn">
            – {{ formatDate(w.endsOn) }}</template
          ></template
        >
      </div>
      <div v-if="w.status === 'LOST'" class="alert alert-secondary py-2">
        Lost: {{ w.lostReason }}
      </div>

      <nav class="sj-tabs mb-3" aria-label="Wedding sections">
        <button
          v-for="t in TABS"
          :key="t"
          type="button"
          :class="{ 'is-active': tab === t }"
          :aria-current="tab === t ? 'page' : undefined"
          @click="setTab(t)"
        >
          {{ TAB_LABELS[t] }}
        </button>
      </nav>

      <!-- Overview -->
      <template v-if="tab === 'overview'">
        <WebsiteEnquiryCard
          v-if="['WEBSITE', 'GOOGLE_ADS', 'INSTAGRAM'].includes(w.leadSource)"
          :wedding-id="w.id"
          :drafted-legs="w.legs.some((l) => l.notes?.startsWith('From the website form'))"
        />
        <section class="card mb-3" aria-labelledby="legs-h">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <h2 id="legs-h" class="h3 mb-0">Flights</h2>
              <SjButton
                variant="secondary"
                size="sm"
                :disabled-reason="lockReason"
                @click="openLeg()"
                >Add leg</SjButton
              >
            </div>
            <p v-if="!w.legs.length" class="text-secondary mb-0">
              No legs yet. Add the flights the guests need.
            </p>
            <div v-for="l in w.legs" :key="l.id" class="sj-row">
              <button type="button" class="sj-row__main" :disabled="locked" @click="openLeg(l)">
                <span class="fw-bold d-block"
                  >Leg {{ l.seq }}: {{ airportLabel(l.fromIata) }} →
                  {{ airportLabel(l.toIata) }}</span
                >
                <span class="small text-secondary">
                  {{ formatDate(l.flightDate)
                  }}<template v-if="l.windowFrom">
                    · {{ l.windowFrom
                    }}<template v-if="l.windowTo">–{{ l.windowTo }}</template></template
                  >
                  · {{ l.pax }} passengers<template v-if="l.category">
                    · {{ CATEGORY_LABELS[l.category].toLowerCase() }}</template
                  >
                </span>
              </button>
              <SjButton
                v-if="l.status === 'CONFIRMED' && l.flightDate <= today"
                size="sm"
                :loading="busy === `flown-${l.id}`"
                loading-label="Saving…"
                @click="markFlown(l)"
                >Mark flown</SjButton
              >
              <span
                v-else
                class="sj-badge"
                :class="l.status === 'FLOWN' ? 'sj-badge--gold' : 'sj-badge--muted'"
                >{{ l.status === 'FLOWN' ? '✓ ' : '' }}{{ LEG_STATUS_LABELS[l.status] }}</span
              >
              <SjButton
                v-if="!locked"
                variant="ghost"
                size="sm"
                :aria-label="`Remove leg ${l.seq}`"
                @click="deleteLeg = l"
                >✕</SjButton
              >
            </div>
          </div>
        </section>

        <section class="card mb-3" aria-labelledby="det-h">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <h2 id="det-h" class="h3 mb-0">Details</h2>
              <SjButton v-if="!editing" variant="secondary" size="sm" @click="startEdit"
                >Edit</SjButton
              >
            </div>
            <form v-if="editing" novalidate @submit.prevent="saveDetails">
              <div class="mb-3">
                <label class="form-label" for="d-partner">Partner</label>
                <select id="d-partner" v-model="form.partnerId" class="form-select">
                  <option value="">No partner (direct)</option>
                  <option v-for="p in partners" :key="p.id" :value="p.id">{{ p.firm }}</option>
                </select>
              </div>
              <SjField v-model="form.venueCity" label="Venue city" optional />
              <div class="d-flex gap-2">
                <div class="flex-fill mb-3">
                  <label class="form-label" for="d-start">First day</label>
                  <input id="d-start" v-model="form.startsOn" type="date" class="form-control" />
                </div>
                <div class="flex-fill mb-3">
                  <label class="form-label" for="d-end">Last day</label>
                  <input
                    id="d-end"
                    v-model="form.endsOn"
                    type="date"
                    class="form-control"
                    :class="{ 'is-invalid': errors.endsOn }"
                  />
                </div>
              </div>
              <div v-if="errors.endsOn" class="invalid-feedback d-block mb-2">
                {{ errors.endsOn }}
              </div>
              <div class="mb-3">
                <label class="form-label" for="d-lead">Lead source</label>
                <select id="d-lead" v-model="form.leadSource" class="form-select">
                  <option v-for="s in LEAD_SOURCES" :key="s" :value="s">
                    {{ LEAD_SOURCE_LABELS[s] }}
                  </option>
                </select>
              </div>
              <div class="mb-3">
                <label class="form-label" for="d-req">Payment needed before confirming</label>
                <div class="input-group" style="max-width: 160px">
                  <input
                    id="d-req"
                    v-model="form.requiredPct"
                    class="form-control"
                    inputmode="decimal"
                    :class="{ 'is-invalid': errors.requiredPaymentBps }"
                  />
                  <span class="input-group-text">%</span>
                </div>
                <div v-if="errors.requiredPaymentBps" class="invalid-feedback d-block">
                  {{ errors.requiredPaymentBps }}
                </div>
              </div>
              <SjField v-model="form.notes" label="Notes" optional multiline :maxlength="4000" />
              <div class="d-flex gap-2">
                <SjButton type="submit" :loading="busy === 'details'" loading-label="Saving…"
                  >Save details</SjButton
                >
                <SjButton variant="ghost" @click="editing = false">Cancel</SjButton>
              </div>
            </form>
            <dl v-else class="sj-dl mb-0">
              <dt>Lead source</dt>
              <dd>
                {{ LEAD_SOURCE_LABELS[w.leadSource] }}
                <template v-if="w.utm.source">
                  ({{
                    [w.utm.source, w.utm.medium, w.utm.campaign].filter(Boolean).join(' / ')
                  }})</template
                >
              </dd>
              <dt>Business profile</dt>
              <dd>{{ w.businessProfile?.label ?? 'Not set' }}</dd>
              <dt>Payment before confirming</dt>
              <dd>{{ w.requiredPaymentBps / 100 }}%</dd>
              <template v-if="w.notes">
                <dt>Notes</dt>
                <dd class="sj-pre">{{ w.notes }}</dd>
              </template>
            </dl>
          </div>
        </section>

        <div class="d-flex gap-2 flex-wrap mb-3">
          <SjButton v-if="w.manualMoves.includes('LOST')" variant="ghost" @click="lostSheet = true"
            >Mark as lost</SjButton
          >
          <SjButton
            v-if="w.manualMoves.includes('ENQUIRY')"
            variant="secondary"
            :loading="busy === 'reopen'"
            loading-label="Reopening…"
            @click="reopen"
            >Reopen</SjButton
          >
        </div>

        <div class="sj-actionbar">
          <SjButton
            block
            :disabled-reason="w.legs.length ? null : 'Add a leg first'"
            @click="setTab('rates')"
          >
            {{ ['ENQUIRY'].includes(w.status) ? 'Ask operators for rates' : 'Go to rates' }}
          </SjButton>
        </div>
      </template>

      <RatesPanel v-else-if="tab === 'rates'" :wedding="w" @changed="load" />

      <QuotePanel
        v-else-if="tab === 'quote'"
        :wedding="w"
        @changed="load"
        @go-rates="setTab('rates')"
      />
      <MoneyPanel v-else-if="tab === 'money'" :wedding="w" @changed="load" />
      <GuestsPanel v-else-if="tab === 'guests'" :wedding="w" />
      <DocsPanel v-else :wedding="w" @changed="load" />
    </template>

    <SjSheet
      :open="legSheet"
      :title="legEditing ? `Edit leg ${legEditing.seq}` : 'Add leg'"
      @close="legSheet = false"
    >
      <form novalidate @submit.prevent="saveLeg">
        <LegFields v-model:leg="legDraft" :errors="legErrors" />
        <SjButton
          type="submit"
          block
          class="mt-3"
          :loading="busy === 'leg'"
          loading-label="Saving…"
          >{{ legEditing ? 'Save leg' : 'Add leg' }}</SjButton
        >
      </form>
    </SjSheet>
    <SjSheet :open="lostSheet" title="Mark as lost?" @close="lostSheet = false">
      <form novalidate @submit.prevent="markLost">
        <SjField v-model="lostReason" label="Why" placeholder="e.g. Went with another broker" />
        <SjButton
          type="submit"
          variant="danger"
          block
          :loading="busy === 'lost'"
          loading-label="Saving…"
          :disabled-reason="lostReason.trim().length < 3 ? 'Say briefly why' : null"
        >
          Mark as lost
        </SjButton>
      </form>
    </SjSheet>
    <SjConfirm
      :open="!!deleteLeg"
      :title="`Remove leg ${deleteLeg?.seq}?`"
      body="Rate requests and replies for this leg are removed with it (replies that also cover other legs are kept)."
      confirm-label="Remove leg"
      :busy="busy === 'delete-leg'"
      @confirm="doDeleteLeg"
      @cancel="deleteLeg = null"
    />
  </div>
</template>

<style scoped>
.sj-tabs {
  display: flex;
  gap: 2px;
  border-bottom: 1px solid #e3e5ea;
  overflow-x: auto;
  scrollbar-width: none;
}
.sj-tabs::-webkit-scrollbar {
  display: none;
}
.sj-tabs button {
  flex: 1 0 auto;
  padding: 0 8px;
  font-size: 0.875rem;
  min-height: 44px;
  background: none;
  border: 0;
  border-bottom: 3px solid transparent;
  font-weight: 700;
  color: #5b6170;
  cursor: pointer;
  transition:
    color var(--sj-fast),
    border-color var(--sj-fast);
}
.sj-tabs button:hover {
  color: var(--sj-midnight);
}
.sj-tabs button.is-active {
  color: var(--sj-midnight);
  border-bottom-color: var(--sj-gold);
}
.sj-row {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 10px 0;
  border-top: 1px solid #eceef2;
}
.sj-row:first-of-type {
  border-top: 0;
}
.sj-row__main {
  flex: 1;
  text-align: left;
  background: none;
  border: 0;
  padding: 4px 0;
  min-height: 44px;
  cursor: pointer;
  border-radius: 8px;
}
.sj-row__main:hover:not(:disabled) {
  background: #f6f7f9;
}
.sj-row__main:disabled {
  cursor: default;
}
.sj-dl {
  display: grid;
  grid-template-columns: minmax(110px, 38%) 1fr;
  gap: 6px 12px;
}
.sj-dl dt {
  font-weight: 600;
  color: #5b6170;
}
.sj-dl dd {
  margin: 0;
}
.sj-pre {
  white-space: pre-line;
}
</style>
