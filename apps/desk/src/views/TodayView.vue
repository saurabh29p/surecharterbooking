<script setup lang="ts">
import {
  CATEGORY_LABELS,
  LEAD_SOURCE_LABELS,
  PARTNER_STATUS_LABELS,
  WEDDING_STATUS_LABELS,
  formatDate,
  formatINRShort,
  type TodayAction,
} from '@shubhjets/shared';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { api, ApiError } from '../api/client';
import SjButton from '../components/SjButton.vue';
import SjSkeleton from '../components/SjSkeleton.vue';
import ActionCard from '../components/today/ActionCard.vue';
import { useToast } from '../composables/toast';
import { useToday } from '../composables/today';

/**
 * Home (BRIEF.md §5.4): the month's margin against the target at the top, then "Do now", most
 * urgent first, each with one button. Overview sections follow below.
 */
const toast = useToast();
const { data, loading, failed, load } = useToday();
const busy = ref<string | null>(null);

const tracker = computed(() => data.value?.tracker.month ?? null);
const barWidth = computed(() => `${Math.min(100, tracker.value?.percent ?? 0)}%`);
const counts = computed(() => {
  const a = data.value?.actions ?? [];
  return { now: a.filter((x) => x.urgency === 'NOW').length, all: a.length };
});
const openWeddings = computed(
  () => data.value?.board.filter((s) => s.status !== 'DONE' && s.status !== 'LOST') ?? [],
);

function remove(a: TodayAction) {
  if (data.value) data.value.actions = data.value.actions.filter((x) => x.key !== a.key);
}

/** "Later": gone at once (optimistic), back with Undo or if the server says no. */
async function later(a: TodayAction) {
  const index = data.value?.actions.indexOf(a) ?? -1;
  remove(a);
  if (data.value) data.value.snoozedCount++;
  const putBack = () => {
    if (!data.value || data.value.actions.some((x) => x.key === a.key)) return;
    data.value.actions.splice(Math.max(0, index), 0, a);
    data.value.snoozedCount = Math.max(0, data.value.snoozedCount - 1);
  };
  try {
    await api('/today/snoozes', { method: 'POST', json: { key: a.key } });
    toast.success('Moved to tomorrow morning', async () => {
      putBack();
      await api(`/today/snoozes/${encodeURIComponent(a.key)}`, { method: 'DELETE' }).catch(() =>
        toast.error("Couldn't undo. Pull down to refresh."),
      );
    });
  } catch (e) {
    putBack();
    toast.error(e instanceof ApiError ? e.message : "Couldn't move it. Try again.");
  }
}

async function flown(a: TodayAction, legId: string) {
  busy.value = a.key;
  try {
    await api(`/legs/${legId}/flown`, { method: 'POST' });
    remove(a);
    toast.success('Marked flown', async () => {
      await api(`/legs/${legId}/flown`, { method: 'DELETE' });
      await load();
    });
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : "Couldn't mark it flown");
  } finally {
    busy.value = null;
  }
}

async function refresh() {
  await load();
  if (failed.value) toast.error("Couldn't refresh. Check your connection and try again.");
}

// Pull down at the top of the page to refresh (UX.md §4).
const pull = ref(0);
let startY: number | null = null;
const PULL = 70;
function touchStart(e: TouchEvent) {
  startY = window.scrollY <= 0 ? e.touches[0]!.clientY : null;
}
function touchMove(e: TouchEvent) {
  if (startY === null) return;
  pull.value = Math.max(0, Math.min(110, (e.touches[0]!.clientY - startY) * 0.5));
}
function touchEnd() {
  if (pull.value >= PULL && !loading.value) void refresh();
  startY = null;
  pull.value = 0;
}

// Coming back to the app after a while: refresh quietly.
function onVisible() {
  if (document.visibilityState !== 'visible' || !data.value) return;
  if (Date.now() - new Date(data.value.generatedAt).getTime() > 5 * 60_000) void load();
}
onMounted(() => {
  void load();
  document.addEventListener('visibilitychange', onVisible);
});
onBeforeUnmount(() => document.removeEventListener('visibilitychange', onVisible));

const jets = (r: NonNullable<typeof data.value>['routes'][number]) =>
  r.byCategory.map((c) => `${c.count} ${CATEGORY_LABELS[c.category].toLowerCase()}`).join(', ');
</script>

<template>
  <section
    aria-labelledby="today-title"
    @touchstart.passive="touchStart"
    @touchmove.passive="touchMove"
    @touchend="touchEnd"
  >
    <div class="sj-pull" :style="{ height: `${pull}px` }" aria-hidden="true">
      <span v-if="pull">{{ pull >= PULL ? 'Release to refresh' : 'Pull to refresh' }}</span>
    </div>

    <div class="d-flex align-items-baseline justify-content-between mb-2">
      <h1 id="today-title" class="page-title mb-0">Today</h1>
      <div class="d-flex align-items-center gap-2">
        <span class="text-secondary small">{{ data ? formatDate(data.today) : '' }}</span>
        <SjButton
          variant="ghost"
          size="sm"
          aria-label="Refresh"
          :loading="loading && !!data"
          loading-label="…"
          @click="refresh"
          >↻</SjButton
        >
      </div>
    </div>

    <!-- The month against the target: always the first thing on screen. -->
    <SjSkeleton v-if="!data" :lines="1" height="5.5rem" />
    <RouterLink
      v-else-if="tracker"
      to="/settings/rules"
      class="sj-tracker sj-card-link mb-3"
      aria-label="This month: what you keep against the target, and margin (change the target in Rules)"
    >
      <div class="d-flex justify-content-between align-items-baseline">
        <span class="sj-tracker__label">{{ tracker.label }}</span>
        <span class="sj-tracker__pct"
          >{{ tracker.percent }}% of {{ formatINRShort(tracker.target) }}</span
        >
      </div>
      <div class="sj-tracker__figs">
        <div>
          <div class="sj-tracker__name">You keep</div>
          <div class="sj-tracker__fig">{{ formatINRShort(tracker.keep) }}</div>
        </div>
        <div class="text-end">
          <div class="sj-tracker__name">Margin</div>
          <div class="sj-tracker__fig sj-tracker__fig--small">
            {{ formatINRShort(tracker.margin) }}
          </div>
        </div>
      </div>
      <div
        class="sj-tracker__bar"
        role="progressbar"
        :aria-valuenow="tracker.percent"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-label="`You keep ${tracker.percent}% of the monthly target`"
      >
        <span :style="{ width: barWidth }" />
      </div>
      <div class="sj-tracker__meta">
        {{ tracker.weddingsConfirmed }} confirmed ·
        <template v-if="tracker.toGo > 0"
          >{{ formatINRShort(tracker.toGo) }} to go · {{ tracker.daysLeft }} days left</template
        ><template v-else>target reached ✓</template>
      </div>
    </RouterLink>

    <div class="d-flex align-items-baseline justify-content-between mb-2">
      <h2 class="h3 mb-0">
        Do now<span v-if="data" class="text-secondary fw-normal small">
          · {{ counts.all ? `${counts.all} to do` : 'all clear' }}</span
        >
      </h2>
      <span v-if="data?.snoozedCount" class="small text-secondary"
        >{{ data.snoozedCount }} moved to tomorrow</span
      >
    </div>

    <template v-if="!data">
      <SjSkeleton v-for="i in 3" :key="i" :lines="1" height="7rem" class="mb-2" />
    </template>
    <div v-else-if="failed && !data.actions.length" class="card card-body mb-3">
      <p class="mb-2">Couldn't load Today.</p>
      <SjButton variant="secondary" @click="refresh">Try again</SjButton>
    </div>
    <div v-else-if="!data.actions.length" class="card card-body mb-3 text-center">
      <div class="sj-check mx-auto mb-2" aria-hidden="true">✓</div>
      <div class="fw-bold">All clear</div>
      <div class="text-secondary small">
        Nothing needs you right now. New enquiries and replies show up here.
      </div>
    </div>
    <TransitionGroup v-else name="sj-list" tag="div" class="sj-acts mb-4">
      <ActionCard
        v-for="a in data.actions"
        :key="a.key"
        :action="a"
        :busy="busy === a.key"
        @later="later(a)"
        @flown="(legId) => flown(a, legId)"
      />
    </TransitionGroup>

    <template v-if="data">
      <section class="mb-4" aria-labelledby="t-weddings">
        <div class="d-flex justify-content-between align-items-baseline mb-2">
          <h2 id="t-weddings" class="h3 mb-0">Weddings</h2>
          <RouterLink to="/weddings" class="small">Board</RouterLink>
        </div>
        <div class="sj-tiles">
          <RouterLink
            v-for="s in openWeddings"
            :key="s.status"
            :to="`/weddings?status=${s.status}`"
            class="sj-tile sj-card-link"
          >
            <span class="sj-tile__n">{{ s.count }}</span>
            <span class="sj-tile__label">{{ WEDDING_STATUS_LABELS[s.status] }}</span>
            <span v-if="s.value" class="sj-tile__sub">{{ formatINRShort(s.value) }}</span>
          </RouterLink>
        </div>
      </section>

      <section class="mb-4" aria-labelledby="t-season">
        <h2 id="t-season" class="h3 mb-2">Season {{ data.tracker.season.label }}</h2>
        <div class="card card-body sj-season">
          <div>
            <div class="sj-tile__n">{{ formatINRShort(data.tracker.season.margin) }}</div>
            <div class="sj-tile__label">Margin</div>
          </div>
          <div>
            <div class="sj-tile__n">{{ formatINRShort(data.tracker.season.keep) }}</div>
            <div class="sj-tile__label">You keep</div>
          </div>
          <div>
            <div class="sj-tile__n">{{ data.tracker.season.weddingsConfirmed }}</div>
            <div class="sj-tile__label">Confirmed</div>
          </div>
          <div>
            <div class="sj-tile__n">{{ formatINRShort(data.tracker.season.averageMargin) }}</div>
            <div class="sj-tile__label">Avg / wedding</div>
          </div>
        </div>
      </section>

      <section class="mb-4" aria-labelledby="t-partners">
        <div class="d-flex justify-content-between align-items-baseline mb-2">
          <h2 id="t-partners" class="h3 mb-0">Partners</h2>
          <RouterLink to="/partners" class="small">
            {{
              data.pipeline.followUpsDue
                ? `${data.pipeline.followUpsDue} follow-ups due`
                : 'All partners'
            }}
          </RouterLink>
        </div>
        <div class="sj-tiles">
          <RouterLink
            v-for="p in data.pipeline.counts"
            :key="p.status"
            :to="`/partners?status=${p.status}`"
            class="sj-tile sj-card-link"
          >
            <span class="sj-tile__n">{{ p.count }}</span>
            <span class="sj-tile__label">{{ PARTNER_STATUS_LABELS[p.status] }}</span>
          </RouterLink>
        </div>
      </section>

      <section v-if="data.leadSources.rows.length" class="mb-4" aria-labelledby="t-sources">
        <h2 id="t-sources" class="h3 mb-2">Lead sources this season</h2>
        <div class="card">
          <ul class="list-unstyled mb-0 sj-routes">
            <li v-for="r in data.leadSources.rows" :key="r.source">
              <div class="d-flex justify-content-between gap-2">
                <span class="fw-bold">{{ LEAD_SOURCE_LABELS[r.source] }}</span>
                <span class="fw-bold">{{ r.margin ? formatINRShort(r.margin) : '–' }}</span>
              </div>
              <div class="small text-secondary">
                {{ r.enquiries }} enquir{{ r.enquiries === 1 ? 'y' : 'ies' }} ·
                {{ r.quotes }} quoted · {{ r.bookings }} booked<template v-if="r.taps">
                  · {{ r.taps }} WhatsApp/call tap{{ r.taps === 1 ? '' : 's' }}</template
                >
              </div>
            </li>
          </ul>
        </div>
      </section>

      <section class="mb-4" aria-labelledby="t-routes">
        <div class="d-flex justify-content-between align-items-baseline mb-2">
          <h2 id="t-routes" class="h3 mb-0">Route coverage</h2>
          <RouterLink to="/operators" class="small">Operators</RouterLink>
        </div>
        <div class="card">
          <ul class="list-unstyled mb-0 sj-routes">
            <li v-for="r in data.routes" :key="`${r.from}-${r.to}`">
              <div class="fw-bold">
                {{ r.from }} ⇄ {{ r.to }}
                <span v-if="r.upcoming" class="sj-badge sj-badge--gold ms-1">Flying soon</span>
              </div>
              <div v-if="r.total" class="small text-secondary">
                {{ r.total }} verified jet{{ r.total === 1 ? '' : 's' }}: {{ jets(r) }}
              </div>
              <div v-else class="small text-danger">⚠ No verified jets based at either end</div>
            </li>
          </ul>
        </div>
      </section>
    </template>
  </section>
</template>

<style scoped>
.sj-pull {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  overflow: hidden;
  font-size: 0.8rem;
  color: #5b606e;
  transition: height 150ms var(--sj-ease-out);
}
.sj-tracker {
  display: block;
  background: var(--sj-midnight);
  color: var(--sj-ivory);
  border-radius: 14px;
  padding: 12px 14px;
}
.sj-tracker__label {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #c9c3b4;
}
.sj-tracker__pct {
  font-weight: 800;
  color: var(--sj-gold);
}
.sj-tracker__figs {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-top: 2px;
}
.sj-tracker__name {
  font-size: 0.75rem;
  color: #c9c3b4;
}
.sj-tracker__fig {
  font-family: 'Bodoni Moda', Georgia, serif;
  font-size: 1.6rem;
  font-weight: 600;
  line-height: 1.15;
}
.sj-tracker__fig--small {
  font-size: 1.15rem;
  color: #e7e1d3;
}
.sj-tracker__bar {
  height: 6px;
  border-radius: 99px;
  background: rgba(255, 255, 255, 0.15);
  margin: 8px 0 6px;
  overflow: hidden;
}
.sj-tracker__bar span {
  display: block;
  height: 100%;
  min-width: 4px;
  background: var(--sj-gold);
  border-radius: 99px;
  transition: width 400ms var(--sj-ease-out);
}
.sj-tracker__meta {
  font-size: 0.8rem;
  color: #c9c3b4;
}
.sj-acts {
  display: grid;
  gap: 10px;
}
.sj-tiles {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 8px;
}
.sj-tile {
  display: flex;
  flex-direction: column;
  background: #fff;
  border: 1px solid #e3e5ea;
  border-radius: 12px;
  padding: 10px;
  min-height: 72px;
}
.sj-tile__n {
  font-size: 1.25rem;
  font-weight: 800;
  line-height: 1.2;
}
.sj-tile__label {
  font-size: 0.78rem;
  color: #5b606e;
  line-height: 1.25;
}
.sj-tile__sub {
  font-size: 0.78rem;
  font-weight: 600;
  margin-top: 2px;
}
.sj-season {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}
.sj-routes li {
  padding: 10px 14px;
  border-bottom: 1px solid #eceef2;
}
.sj-routes li:last-child {
  border-bottom: 0;
}
@media (prefers-reduced-motion: reduce) {
  .sj-tracker__bar span,
  .sj-pull {
    transition: none;
  }
}
</style>
