<script setup lang="ts">
import { formatDate, formatINR, type BusinessProfileView } from '@shubhjets/shared';
import { onMounted, ref } from 'vue';
import { api } from '../api/client';
import SjSkeleton from '../components/SjSkeleton.vue';

const today = formatDate(new Date());
const profile = ref<BusinessProfileView | null | undefined>(undefined);

onMounted(async () => {
  try {
    profile.value =
      (await api<BusinessProfileView[]>('/business-profiles')).find((p) => p.isDefault) ?? null;
  } catch {
    profile.value = null;
  }
});
</script>

<template>
  <section aria-labelledby="today-title">
    <h1 id="today-title" class="page-title mb-1">Today</h1>
    <p class="text-secondary mb-3">{{ today }}</p>

    <h2 class="h3">Do now</h2>
    <SjSkeleton v-if="profile === undefined" :lines="1" height="4.5rem" />
    <RouterLink
      v-else-if="profile && profile.readiness.warnings.length"
      :to="`/settings/profiles/${profile.id}`"
      class="card sj-card-link mb-3"
    >
      <div class="card-body d-flex align-items-center gap-3">
        <div class="flex-fill">
          <div class="fw-bold">Finish your business profile</div>
          <div class="text-secondary small">{{ profile.readiness.warnings.join(' · ') }}</div>
        </div>
        <span aria-hidden="true" class="fs-2 text-secondary">›</span>
      </div>
    </RouterLink>
    <div v-else class="card card-body mb-3 text-secondary">Nothing to do right now.</div>

    <div class="empty">
      <p class="empty-title">More of Today is on the way</p>
      <p class="empty-subtitle text-secondary">
        Weddings, rate chasers, quote expiries and the season tracker (target
        {{ formatINR(20_00_000_00) }} margin a month) arrive in the next steps.
      </p>
    </div>
  </section>
</template>
