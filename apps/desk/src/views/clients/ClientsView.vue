<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api, ApiError } from '../../api/client';
import SjButton from '../../components/SjButton.vue';
import SjSkeleton from '../../components/SjSkeleton.vue';
import PeopleTabs from '../../components/partner/PeopleTabs.vue';
import { useToast } from '../../composables/toast';

interface ClientRow {
  id: string;
  name: string;
  type: 'FAMILY' | 'CORPORATE';
  phone: string | null;
  partnerFirm: string | null;
  weddings: number;
  hasConsent: boolean;
}

const router = useRouter();
const toast = useToast();
const q = ref('');
const items = ref<ClientRow[] | null>(null);

async function load() {
  try {
    items.value = await api<ClientRow[]>(
      `/clients${q.value.trim() ? `?q=${encodeURIComponent(q.value.trim())}` : ''}`,
    );
  } catch (e) {
    items.value = [];
    toast.error(e instanceof ApiError ? e.message : "Couldn't load clients");
  }
}
onMounted(load);
let timer: ReturnType<typeof setTimeout> | undefined;
watch(q, () => {
  clearTimeout(timer);
  timer = setTimeout(load, 250);
});
</script>

<template>
  <div>
    <PeopleTabs active="clients" />
    <div class="d-flex justify-content-between align-items-center gap-2 mb-2">
      <h1 class="page-title mb-0">Clients</h1>
      <SjButton size="sm" @click="router.push('/clients/new')">Add client</SjButton>
    </div>
    <p class="text-secondary small">
      Families and companies who fly with you, usually through a partner.
    </p>
    <input
      v-model="q"
      class="form-control mb-3"
      type="search"
      placeholder="Search name, phone or email"
      aria-label="Search clients"
    />
    <SjSkeleton v-if="!items" :lines="4" height="4rem" />
    <div v-else-if="!items.length" class="card card-body text-center">
      <p class="mb-2">
        {{ q ? 'No clients match.' : 'No clients yet. They are usually added with a wedding.' }}
      </p>
      <div v-if="!q"><SjButton @click="router.push('/clients/new')">Add a client</SjButton></div>
    </div>
    <TransitionGroup v-else tag="div" name="sj-list" class="d-grid gap-2">
      <RouterLink v-for="c in items" :key="c.id" :to="`/clients/${c.id}`" class="card sj-card-link">
        <div class="card-body d-flex align-items-center gap-3">
          <div class="flex-fill">
            <div class="fw-bold">{{ c.name }}</div>
            <div class="text-secondary small">
              {{ c.type === 'CORPORATE' ? 'Company' : 'Family'
              }}<template v-if="c.partnerFirm"> · via {{ c.partnerFirm }}</template> ·
              {{ c.weddings }} wedding{{ c.weddings === 1 ? '' : 's' }}
            </div>
            <div class="small" :class="c.hasConsent ? 'text-success' : 'text-warning-emphasis'">
              {{ c.hasConsent ? '✓ Consent recorded' : '⚠ No consent recorded' }}
            </div>
          </div>
          <span aria-hidden="true" class="text-secondary fs-2">›</span>
        </div>
      </RouterLink>
    </TransitionGroup>
  </div>
</template>
