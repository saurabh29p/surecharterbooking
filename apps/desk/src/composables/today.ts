import type {
  AircraftCategory,
  LeadSource,
  MonthTracker,
  PartnerStatus,
  TodayAction,
  WeddingStatus,
} from '@shubhjets/shared';
import { ref } from 'vue';
import { api, onSessionChange } from '../api/client';

export interface TodayData {
  today: string;
  generatedAt: string;
  actions: TodayAction[];
  snoozedCount: number;
  tracker: {
    month: MonthTracker & { netMargin: number; weddingsConfirmed: number };
    season: { label: string; margin: number; weddingsConfirmed: number; averageMargin: number };
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
 * Kept in memory for the session, so going back to Today shows the last view at once while it
 * refreshes (UX.md §4). Nothing is written to the phone's storage.
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
      cached.value = await api<TodayData>('/today');
      failed.value = false;
    } catch {
      failed.value = true;
    } finally {
      loading.value = false;
    }
  }
  return { data: cached, loading, failed, load };
}
