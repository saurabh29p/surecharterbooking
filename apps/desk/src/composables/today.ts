import type {
  AircraftCategory,
  LeadSource,
  MonthTracker,
  PartnerStatus,
  TodayAction,
  WeddingStatus,
} from '@shubhjets/shared';
import { ref } from 'vue';
import { cachedApi, prefetchApi } from '../api/cache';
import { onSessionChange } from '../api/client';

export interface TodayData {
  today: string;
  generatedAt: string;
  actions: TodayAction[];
  snoozedCount: number;
  tracker: {
    month: MonthTracker & { weddingsConfirmed: number };
    season: {
      label: string;
      margin: number;
      keep: number;
      weddingsConfirmed: number;
      averageMargin: number;
    };
  };
  board: { status: WeddingStatus; count: number; value: number; margin: number }[];
  pipeline: { counts: { status: PartnerStatus; count: number }[]; followUpsDue: number };
  leadSources: {
    season: string;
    rows: {
      source: LeadSource;
      enquiries: number;
      quotes: number;
      bookings: number;
      margin: number;
      taps: number;
    }[];
  };
  routes: {
    from: string;
    to: string;
    upcoming: boolean;
    total: number;
    byCategory: { category: AircraftCategory; count: number }[];
  }[];
}

/**
 * Today opens with what it showed last time (memory, then this phone's cache) while it refreshes
 * (UX.md §4). The cache is wiped when the session ends; see api/cache.ts.
 */
const cached = ref<TodayData | null>(null);
onSessionChange((s) => {
  if (!s) cached.value = null;
});

export function useToday() {
  const loading = ref(false);
  const failed = ref(false);
  async function load() {
    loading.value = true;
    try {
      const { fromCacheOnly } = await cachedApi<TodayData>('/today', (v) => (cached.value = v));
      failed.value = fromCacheOnly;
      if (!fromCacheOnly) schedulePrefetch();
    } catch {
      failed.value = true;
    } finally {
      loading.value = false;
    }
  }
  return { data: cached, loading, failed, load };
}

let prefetched = false;
/**
 * Once Today is on screen, quietly load the code and data of the next likely screens, so switching
 * tabs shows content at once. Runs once per session, just after Today has painted.
 */
function schedulePrefetch() {
  if (prefetched) return;
  prefetched = true;
  const run = () => {
    void import('../views/weddings/WeddingsView.vue');
    void import('../views/partners/PartnersView.vue');
    void import('../views/operators/OperatorsView.vue');
    void import('../views/settings/SettingsView.vue');
    for (const path of ['/weddings?', '/partners?', '/operators?']) void prefetchApi(path);
  };
  // Right after Today has painted: tabs are often the very next tap.
  setTimeout(run, 50);
}
onSessionChange((s) => {
  if (!s) prefetched = false;
});
