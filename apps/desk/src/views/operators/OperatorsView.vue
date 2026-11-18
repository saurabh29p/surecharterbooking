<script setup lang="ts">
import { AIRCRAFT_CATEGORIES, CATEGORY_LABELS } from '@shubhjets/shared';
import { onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api, ApiError } from '../../api/client';
import SjButton from '../../components/SjButton.vue';
import SjSkeleton from '../../components/SjSkeleton.vue';
import StatusBadge from '../../components/operator/StatusBadge.vue';
import { useAirports } from '../../composables/airports';
import { expiryText, fleetSummary, type OperatorListItem } from '../../composables/operators';
import { useToast } from '../../composables/toast';

const router = useRouter();
const toast = useToast();
const { airports, label: airportLabel } = useAirports();

const STATUS_FILTERS = [
  { key: '', label: 'All' },
  { key: 'VERIFIED,EXPIRING_SOON', label: 'Ready to quote' },
  { key: 'FOUND', label: 'Not verified' },
  { key: 'BLOCKED', label: 'Blocked' },
];

const status = ref('');
const base = ref('');
const category = ref('');
const q = ref('');
const items = ref<OperatorListItem[] | null>(null);
let seq = 0;

async function load() {
  const mine = ++seq;
  const params = new URLSearchParams();
  if (status.value) params.set('status', status.value);
  if (base.value) params.set('base', base.value);
  if (category.value) params.set('category', category.value);
  if (q.value.trim()) params.set('q', q.value.trim());
  try {
    const res = await api<OperatorListItem[]>(`/operators?${params}`);
    if (mine === seq) items.value = res;
  } catch (e) {
    if (mine === seq) items.value = [];
    toast.error(e instanceof ApiError ? e.message : "Couldn't load operators");
  }
}

onMounted(load);
watch([status, base, category], () => {
  items.value = null;
  void load();
});
let timer: ReturnType<typeof setTimeout> | undefined;
watch(q, () => {
  clearTimeout(timer);
  timer = setTimeout(load, 250);
});
</script>

<template>
  <div>
    <div class="d-flex justify-content-between align-items-center gap-2 mb-2">
      <h1 class="page-title mb-0">Operators</h1>
      <div class="d-flex gap-1">
        <SjButton variant="ghost" size="sm" @click="router.push('/settings/import?kind=operators')"
          >Import</SjButton
        >
        <SjButton size="sm" @click="router.push('/operators/new')">Add operator</SjButton>
      </div>
    </div>
    <p class="text-secondary small">Only verified operators can be chosen for a leg or a quote.</p>

    <div class="d-flex gap-2 flex-wrap mb-2" role="group" aria-label="Status">
      <button
        v-for="f in STATUS_FILTERS"
        :key="f.key"
        type="button"
        class="sj-chip"
        :class="{ 'is-active': status === f.key }"
        :aria-pressed="status === f.key"
        @click="status = f.key"
      >
        {{ f.label }}
      </button>
    </div>
    <div class="d-flex gap-2 flex-wrap mb-3">
      <input
        v-model="q"
        class="form-control sj-filter"
        type="search"
        placeholder="Search"
        aria-label="Search operators"
      />
      <select v-model="base" class="form-select sj-filter" aria-label="Based at">
        <option value="">Any base</option>
        <option v-for="a in airports" :key="a.iata" :value="a.iata">
          {{ a.city }} ({{ a.iata }})
        </option>
      </select>
      <select v-model="category" class="form-select sj-filter" aria-label="Aircraft category">
        <option value="">Any aircraft</option>
        <option v-for="c in AIRCRAFT_CATEGORIES" :key="c" :value="c">
          {{ CATEGORY_LABELS[c] }}
        </option>
      </select>
    </div>

    <SjSkeleton v-if="!items" :lines="4" height="5.5rem" />
    <div v-else-if="items.length === 0" class="card card-body text-center">
      <p class="mb-2">
        {{
          status || base || category || q
            ? 'No operators match these filters.'
            : 'No operators yet.'
        }}
      </p>
      <div>
        <SjButton v-if="!(status || base || category || q)" @click="router.push('/operators/new')"
          >Add your first operator</SjButton
        >
      </div>
    </div>
    <TransitionGroup v-else tag="div" name="sj-list" class="d-grid gap-2">
      <RouterLink
        v-for="o in items"
        :key="o.id"
        :to="`/operators/${o.id}`"
        class="card sj-card-link"
      >
        <div class="card-body d-flex gap-3 align-items-start">
          <div class="flex-fill">
            <div class="d-flex align-items-center gap-2 flex-wrap">
              <span class="fw-bold">{{ o.brand || o.legalName }}</span>
              <StatusBadge :status="o.status" />
            </div>
            <div class="text-secondary small mt-1">
              {{ fleetSummary(o.fleet)
              }}<template v-if="o.bases.length">
                · based {{ o.bases.map(airportLabel).join(', ') }}</template
              >
            </div>
            <div v-if="o.status === 'BLOCKED' || o.status === 'FOUND'" class="small mt-1">
              {{ o.statusReason }}
            </div>
            <div
              v-else-if="o.nearestExpiry && o.nearestExpiry.daysLeft <= 60"
              class="small mt-1"
              :class="{ 'text-warning-emphasis': o.nearestExpiry.daysLeft <= 30 }"
            >
              {{ expiryText(o.nearestExpiry) }}
            </div>
            <div v-else class="small mt-1 text-success">✓ Documents valid</div>
            <div class="text-secondary small mt-1">
              {{ o.weddingsDone }} wedding{{ o.weddingsDone === 1 ? '' : 's' }} flown
              <template v-if="o.avgReplyHours !== null">
                · replies in ~{{ o.avgReplyHours }} h</template
              >
              <template v-if="o.dgcaRank"> · DGCA rank {{ o.dgcaRank }}</template>
            </div>
          </div>
          <span aria-hidden="true" class="text-secondary fs-2">›</span>
        </div>
      </RouterLink>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.sj-filter {
  flex: 1 1 150px;
  min-width: 0;
}
</style>
