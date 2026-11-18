<script setup lang="ts">
import {
  WEDDING_STATUSES,
  WEDDING_STATUS_LABELS,
  formatDayMonth,
  formatINRShort,
  type WeddingStatus,
} from '@shubhjets/shared';
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, ApiError } from '../../api/client';
import SjButton from '../../components/SjButton.vue';
import SjSkeleton from '../../components/SjSkeleton.vue';
import WeddingStatusBadge from '../../components/wedding/WeddingStatusBadge.vue';
import { BOARD_COLUMNS, type WeddingBoard, type WeddingCard } from '../../composables/weddings';
import { useToast } from '../../composables/toast';

/** All weddings by stage: a board on wide screens, grouped cards on a phone (BRIEF.md §5.4). */
const router = useRouter();
const toast = useToast();
const board = ref<WeddingBoard | null>(null);
// Today's tiles open the board filtered to one stage (?status=QUOTED).
const fromLink = String(useRoute().query.status ?? '') as WeddingStatus;
const status = ref<WeddingStatus | ''>(WEDDING_STATUSES.includes(fromLink) ? fromLink : '');
const showClosed = ref(false);
const q = ref('');

async function load() {
  const params = new URLSearchParams();
  if (q.value.trim()) params.set('q', q.value.trim());
  try {
    board.value = await api<WeddingBoard>(`/weddings?${params}`);
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : "Couldn't load weddings");
  }
}
onMounted(load);
let timer: ReturnType<typeof setTimeout> | undefined;
watch(q, () => {
  clearTimeout(timer);
  timer = setTimeout(load, 250);
});

/** Done and lost are hidden by default so the board shows live work. */
const columns = computed(() =>
  BOARD_COLUMNS.filter((s) =>
    status.value ? s === status.value : showClosed.value || (s !== 'DONE' && s !== 'LOST'),
  ),
);
const inColumn = (s: WeddingStatus): WeddingCard[] =>
  board.value?.items.filter((w) => w.status === s) ?? [];
</script>

<template>
  <div>
    <div class="d-flex justify-content-between align-items-center gap-2 mb-2">
      <h1 class="page-title mb-0">Weddings</h1>
      <SjButton size="sm" @click="router.push('/weddings/new')">New wedding</SjButton>
    </div>
    <div class="d-flex gap-2 flex-wrap mb-2" role="group" aria-label="Stage">
      <button
        type="button"
        class="sj-chip"
        :class="{ 'is-active': !status }"
        :aria-pressed="!status"
        @click="status = ''"
      >
        All live
      </button>
      <button
        v-for="s in BOARD_COLUMNS"
        :key="s"
        type="button"
        class="sj-chip"
        :class="{ 'is-active': status === s }"
        :aria-pressed="status === s"
        @click="status = status === s ? '' : s"
      >
        {{ WEDDING_STATUS_LABELS[s] }}<template v-if="board"> ({{ board.counts[s] }})</template>
      </button>
    </div>
    <div class="d-flex gap-2 align-items-center flex-wrap mb-3">
      <input
        v-model="q"
        class="form-control flex-fill"
        style="min-width: 0"
        type="search"
        placeholder="Search W-code, client, city or partner"
        aria-label="Search weddings"
      />
      <label v-if="!status" class="form-check mb-0 small text-nowrap">
        <input v-model="showClosed" class="form-check-input" type="checkbox" /> Show done and lost
      </label>
    </div>

    <SjSkeleton v-if="!board" :lines="4" height="6rem" />
    <div v-else-if="!board.items.length" class="card card-body text-center">
      <p class="mb-2">{{ q ? 'No weddings match.' : 'No weddings yet.' }}</p>
      <div v-if="!q">
        <SjButton @click="router.push('/weddings/new')">Add the first wedding</SjButton>
      </div>
    </div>
    <div v-else class="sj-board">
      <section v-for="s in columns" :key="s" class="sj-col" :aria-label="WEDDING_STATUS_LABELS[s]">
        <h2 class="sj-col__title">
          {{ WEDDING_STATUS_LABELS[s] }}
          <span class="text-secondary">{{ inColumn(s).length }}</span>
        </h2>
        <p v-if="!inColumn(s).length" class="small text-secondary">None</p>
        <TransitionGroup tag="div" name="sj-list" class="d-grid gap-2">
          <RouterLink
            v-for="w in inColumn(s)"
            :key="w.id"
            :to="`/weddings/${w.id}`"
            class="card sj-card-link"
          >
            <div class="card-body p-3">
              <div class="d-flex justify-content-between align-items-center gap-2">
                <span class="fw-bold">{{ w.code }} · {{ w.venueCity || 'City not set' }}</span>
                <WeddingStatusBadge v-if="status || s === 'LOST'" :status="w.status" />
              </div>
              <div class="small text-secondary mt-1">
                {{ w.client?.name || 'No client yet'
                }}<template v-if="w.partner"> · via {{ w.partner.firm }}</template>
              </div>
              <div class="small mt-1">
                <template v-if="w.firstFlight">✈ {{ formatDayMonth(w.firstFlight) }} · </template
                >{{ w.legs }} leg{{ w.legs === 1 ? '' : 's' }} · up to {{ w.pax }} guests
              </div>
              <div v-if="w.value !== null" class="small mt-1">
                <span class="fw-bold">{{ formatINRShort(w.value) }}</span>
                <span v-if="w.margin !== null" class="text-secondary">
                  · margin {{ formatINRShort(w.margin) }}</span
                >
              </div>
              <div v-if="w.lostReason" class="small text-secondary mt-1">{{ w.lostReason }}</div>
            </div>
          </RouterLink>
        </TransitionGroup>
      </section>
    </div>
  </div>
</template>

<style scoped>
.sj-board {
  display: grid;
  gap: 16px;
}
@media (min-width: 992px) {
  .sj-board {
    grid-auto-flow: column;
    grid-auto-columns: minmax(240px, 1fr);
    overflow-x: auto;
    align-items: start;
    padding-bottom: 8px;
  }
}
.sj-col__title {
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: 700;
  margin-bottom: 8px;
}
</style>
