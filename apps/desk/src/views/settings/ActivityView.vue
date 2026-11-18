<script setup lang="ts">
import { formatDateTime } from '@shubhjets/shared';
import { onMounted, ref, watch } from 'vue';
import { api, ApiError } from '../../api/client';
import SjButton from '../../components/SjButton.vue';
import SjSkeleton from '../../components/SjSkeleton.vue';
import { describe, type AuditItem } from '../../composables/activity';
import { useToast } from '../../composables/toast';

const toast = useToast();
const FILTERS = [
  { key: '', label: 'Everything' },
  { key: 'setting', label: 'Settings' },
  { key: 'business_profile', label: 'Business profiles' },
  { key: 'user', label: 'Logins and security' },
];

const filter = ref('');
const items = ref<AuditItem[] | null>(null);
const nextBefore = ref<string | null>(null);
const loadingMore = ref(false);

async function fetchPage(before?: string) {
  const params = new URLSearchParams({ limit: '30' });
  if (filter.value) params.set('entity', filter.value);
  if (before) params.set('before', before);
  return api<{ items: AuditItem[]; nextBefore: string | null }>(`/audit?${params}`);
}

async function reload() {
  items.value = null;
  try {
    const page = await fetchPage();
    items.value = page.items;
    nextBefore.value = page.nextBefore;
  } catch (e) {
    items.value = [];
    toast.error(e instanceof ApiError ? e.message : "Couldn't load the activity log");
  }
}

async function more() {
  if (!nextBefore.value) return;
  loadingMore.value = true;
  try {
    const page = await fetchPage(nextBefore.value);
    items.value = [...(items.value ?? []), ...page.items];
    nextBefore.value = page.nextBefore;
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : "Couldn't load more");
  } finally {
    loadingMore.value = false;
  }
}

onMounted(reload);
watch(filter, reload);
</script>

<template>
  <div>
    <RouterLink to="/settings" class="d-inline-block mb-2">‹ Settings</RouterLink>
    <h1 class="page-title mb-1">Activity log</h1>
    <p class="text-secondary">
      Every change, who made it and when. Nothing here can be edited or deleted.
    </p>

    <div class="d-flex gap-2 flex-wrap mb-3" role="group" aria-label="Show">
      <button
        v-for="f in FILTERS"
        :key="f.key"
        type="button"
        class="sj-chip"
        :class="{ 'is-active': filter === f.key }"
        :aria-pressed="filter === f.key"
        @click="filter = f.key"
      >
        {{ f.label }}
      </button>
    </div>

    <SjSkeleton v-if="!items" :lines="5" height="3.5rem" />
    <div v-else-if="items.length === 0" class="card card-body text-center text-secondary">
      Nothing here yet.
    </div>
    <div v-else class="card">
      <TransitionGroup tag="ul" name="sj-list" class="list-group list-group-flush">
        <li v-for="item in items" :key="item.id" class="list-group-item">
          <div class="d-flex justify-content-between gap-2 flex-wrap">
            <span class="fw-bold">{{ describe(item).title }}</span>
            <span class="text-secondary small">{{ formatDateTime(new Date(item.at)) }}</span>
          </div>
          <ul v-if="describe(item).changes.length" class="small mb-1 ps-3">
            <li v-for="c in describe(item).changes" :key="c">{{ c }}</li>
          </ul>
          <div class="text-secondary small">
            <span
              class="sj-badge"
              :class="item.actorType === 'USER' ? 'sj-badge--muted' : 'sj-badge--gold'"
              >{{ item.actorLabel }}</span
            >
          </div>
        </li>
      </TransitionGroup>
    </div>
    <div v-if="nextBefore" class="text-center mt-3">
      <SjButton variant="secondary" :loading="loadingMore" loading-label="Loading…" @click="more"
        >Load older entries</SjButton
      >
    </div>
  </div>
</template>
