<script setup lang="ts">
import {
  ACTIVITY_LABELS,
  PARTNER_STATUSES,
  PARTNER_STATUS_LABELS,
  formatDate,
  formatINR,
  type ActivityKind,
  type PartnerStatus,
} from '@shubhjets/shared';
import { onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api, ApiError } from '../../api/client';
import SjButton from '../../components/SjButton.vue';
import SjSkeleton from '../../components/SjSkeleton.vue';
import PartnerStatusBadge from '../../components/partner/PartnerStatusBadge.vue';
import PeopleTabs from '../../components/partner/PeopleTabs.vue';
import {
  commissionText,
  waLink,
  type ActivityResult,
  type PartnerList,
  type PartnerListItem,
} from '../../composables/partners';
import { useToast } from '../../composables/toast';

const router = useRouter();
const toast = useToast();

const status = ref<PartnerStatus | ''>('');
const dueOnly = ref(false);
const q = ref('');
const data = ref<PartnerList | null>(null);
let seq = 0;

async function load() {
  const mine = ++seq;
  const params = new URLSearchParams();
  if (status.value) params.set('status', status.value);
  if (dueOnly.value) params.set('followUpDue', 'true');
  if (q.value.trim()) params.set('q', q.value.trim());
  try {
    const res = await api<PartnerList>(`/partners?${params}`);
    if (mine === seq) data.value = res;
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : "Couldn't load partners");
  }
}
onMounted(load);
watch([status, dueOnly], () => {
  data.value = null;
  void load();
});
let timer: ReturnType<typeof setTimeout> | undefined;
watch(q, () => {
  clearTimeout(timer);
  timer = setTimeout(load, 250);
});

const QUICK: ActivityKind[] = ['CALLED', 'NO_ANSWER', 'SENT_DECK'];

/** Optimistic: the card updates at once; the server confirms; Undo puts it back. */
async function quick(p: PartnerListItem, kind: ActivityKind) {
  const before = { status: p.status, lastActivity: p.lastActivity };
  p.lastActivity = { kind, at: new Date().toISOString() };
  try {
    const res = await api<ActivityResult>(`/partners/${p.id}/activities`, {
      method: 'POST',
      json: { kind },
    });
    p.status = res.status;
    toast.success(`${ACTIVITY_LABELS[kind]}: ${p.firm}`, async () => {
      await api(`/partner-activities/${res.activityId}`, {
        method: 'DELETE',
        json: { restoreStatus: res.undo.status, restoreFollowUpOn: res.undo.nextFollowUpOn ?? '' },
      });
      Object.assign(p, before);
      toast.success('Undone');
    });
  } catch (e) {
    Object.assign(p, before);
    toast.error(e instanceof ApiError ? e.message : "Couldn't save that. Please try again.");
  }
}
</script>

<template>
  <div>
    <PeopleTabs active="partners" />
    <div class="d-flex justify-content-between align-items-center gap-2 mb-2">
      <h1 class="page-title mb-0">Partners</h1>
      <SjButton size="sm" @click="router.push('/partners/new')">Add partner</SjButton>
    </div>

    <div class="d-flex gap-2 flex-wrap mb-2" role="group" aria-label="Pipeline stage">
      <button
        type="button"
        class="sj-chip"
        :class="{ 'is-active': !status && !dueOnly }"
        :aria-pressed="!status && !dueOnly"
        @click="((status = ''), (dueOnly = false))"
      >
        All
      </button>
      <button
        type="button"
        class="sj-chip"
        :class="{ 'is-active': dueOnly }"
        :aria-pressed="dueOnly"
        @click="((dueOnly = !dueOnly), (status = ''))"
      >
        Follow-ups due<template v-if="data"> ({{ data.followUpsDue }})</template>
      </button>
      <button
        v-for="s in PARTNER_STATUSES"
        :key="s"
        type="button"
        class="sj-chip"
        :class="{ 'is-active': status === s }"
        :aria-pressed="status === s"
        @click="((status = status === s ? '' : s), (dueOnly = false))"
      >
        {{ PARTNER_STATUS_LABELS[s] }}<template v-if="data"> ({{ data.counts[s] }})</template>
      </button>
    </div>
    <input
      v-model="q"
      class="form-control mb-3"
      type="search"
      placeholder="Search name, city or phone"
      aria-label="Search partners"
    />

    <SjSkeleton v-if="!data" :lines="4" height="7rem" />
    <div v-else-if="data.items.length === 0" class="card card-body text-center">
      <p class="mb-2">{{ status || dueOnly || q ? 'No partners match.' : 'No partners yet.' }}</p>
      <div v-if="!(status || dueOnly || q)" class="d-flex gap-2 justify-content-center flex-wrap">
        <SjButton @click="router.push('/partners/new')">Add a partner</SjButton>
        <SjButton variant="secondary" @click="router.push('/settings/import')"
          >Import from CSV</SjButton
        >
      </div>
    </div>
    <TransitionGroup v-else tag="div" name="sj-list" class="d-grid gap-2">
      <article v-for="p in data.items" :key="p.id" class="card">
        <RouterLink :to="`/partners/${p.id}`" class="card-body sj-card-link pb-2">
          <div class="d-flex align-items-center gap-2 flex-wrap">
            <span class="fw-bold">{{ p.firm }}</span>
            <PartnerStatusBadge :status="p.status" />
            <span v-if="p.followUpDue" class="sj-badge sj-badge--warn">⏰ Follow up</span>
          </div>
          <div class="text-secondary small mt-1">
            {{ [p.contactPerson, p.city].filter(Boolean).join(' · ') || 'No contact name yet' }}
            <template v-if="p.nextFollowUpOn"> · next {{ formatDate(p.nextFollowUpOn) }}</template>
          </div>
          <div class="small mt-1">
            <template v-if="p.stats.commissionOwed > 0">
              <span class="fw-bold">{{
                formatINR(p.stats.commissionOwed, { paise: 'never' })
              }}</span>
              commission owed ·
            </template>
            {{ p.stats.weddingsThisSeason }} wedding{{
              p.stats.weddingsThisSeason === 1 ? '' : 's'
            }}
            this season ·
            {{ commissionText(p.commissionBasis, p.commissionBps) }}
          </div>
          <div v-if="p.lastActivity" class="text-secondary small mt-1">
            Last: {{ ACTIVITY_LABELS[p.lastActivity.kind] }},
            {{ formatDate(new Date(p.lastActivity.at)) }}
          </div>
        </RouterLink>
        <div class="d-flex gap-1 flex-wrap px-3 pb-3">
          <SjButton
            v-for="k in QUICK"
            :key="k"
            variant="secondary"
            size="sm"
            @click="quick(p, k)"
            >{{ ACTIVITY_LABELS[k] }}</SjButton
          >
          <a
            v-if="p.phone"
            :href="`tel:${p.phone}`"
            class="sj-btn sj-btn--ghost sj-btn--sm"
            :aria-label="`Call ${p.firm}`"
            >📞</a
          >
          <a
            v-if="p.phone"
            :href="waLink(p.phone)"
            target="_blank"
            rel="noopener"
            class="sj-btn sj-btn--ghost sj-btn--sm"
            :aria-label="`WhatsApp ${p.firm}`"
            >💬</a
          >
        </div>
      </article>
    </TransitionGroup>
  </div>
</template>

<style scoped>
a.sj-btn {
  text-decoration: none;
}
</style>
