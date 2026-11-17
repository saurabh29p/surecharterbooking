<script setup lang="ts">
import { stateName, type BusinessProfileView } from '@shubhjets/shared';
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../../api/client';
import SjButton from '../../components/SjButton.vue';
import SjSkeleton from '../../components/SjSkeleton.vue';
import { useToast } from '../../composables/toast';

const router = useRouter();
const toast = useToast();
const profiles = ref<BusinessProfileView[] | null>(null);

onMounted(async () => {
  try {
    profiles.value = await api<BusinessProfileView[]>('/business-profiles');
  } catch {
    profiles.value = [];
    toast.error("Couldn't load business profiles");
  }
});
</script>

<template>
  <div>
    <RouterLink to="/settings" class="d-inline-block mb-2">‹ Settings</RouterLink>
    <div class="d-flex justify-content-between align-items-center mb-1 gap-2">
      <h1 class="page-title mb-0">Business profiles</h1>
      <SjButton variant="secondary" size="sm" @click="router.push('/settings/profiles/new')"
        >Add profile</SjButton
      >
    </div>
    <p class="text-secondary">
      Who quotes, invoices and agreements go out from. New weddings use the default.
    </p>
    <SjSkeleton v-if="!profiles" :lines="2" height="5rem" />
    <div v-else-if="profiles.length === 0" class="card card-body text-center">
      <p class="mb-2">No business profile yet.</p>
      <SjButton @click="router.push('/settings/profiles/new')">Create your first profile</SjButton>
    </div>
    <div v-else class="d-grid gap-2">
      <RouterLink
        v-for="p in profiles"
        :key="p.id"
        :to="`/settings/profiles/${p.id}`"
        class="card sj-card-link"
      >
        <div class="card-body d-flex gap-3 align-items-start">
          <div class="flex-fill">
            <div class="d-flex align-items-center gap-2 flex-wrap">
              <span class="fw-bold">{{ p.label }}</span>
              <span v-if="p.isDefault" class="sj-badge sj-badge--gold">★ Default</span>
              <span class="sj-badge sj-badge--muted">{{ stateName(p.stateCode) }}</span>
            </div>
            <div class="text-secondary small mt-1">
              {{ p.legalName || p.brandName || 'No name yet' }} ·
              {{ p.gstin ? `GSTIN ${p.gstin}` : 'No GSTIN yet' }}
            </div>
            <ul
              v-if="p.readiness.warnings.length"
              class="sj-warning-list small mt-2 text-warning-emphasis"
            >
              <li v-for="w in p.readiness.warnings" :key="w">{{ w }}</li>
            </ul>
            <div v-else class="small mt-2 text-success">
              ✓ Ready for quotes, invoices and agreements
            </div>
          </div>
          <span aria-hidden="true" class="text-secondary fs-2">›</span>
        </div>
      </RouterLink>
    </div>
  </div>
</template>
