<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api, ApiError, download } from '../api/client';
import { useToast } from '../composables/toast';
import SjButton from './SjButton.vue';
import SjSheet from './SjSheet.vue';

interface Plan {
  name: string;
  erased: boolean;
  blockers: string[];
  erases: string[];
  keeps: string[];
}

/**
 * DPDP Act 2023 requests (BRIEF.md §5.8): send a person a copy of their data, or erase it.
 * Erasing can't be undone, so it shows exactly what goes and what the law makes us keep.
 */
const props = defineProps<{ kind: 'client' | 'partner'; id: string }>();
const router = useRouter();
const toast = useToast();
const plan = ref<Plan | null>(null);
const sheet = ref(false);
const busy = ref<'export' | 'erase' | null>(null);

async function loadPlan() {
  try {
    plan.value = await api<Plan>(`/privacy/${props.kind}/${props.id}`);
  } catch {
    plan.value = null;
  }
}
onMounted(loadPlan);

async function exportData() {
  busy.value = 'export';
  try {
    await download(
      `/privacy/${props.kind}/${props.id}/export`,
      `shubhjets-${props.kind}-data.json`,
    );
    toast.success('Data file downloaded. Send it to them on WhatsApp or email.');
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : "Couldn't make the data file");
  } finally {
    busy.value = null;
  }
}

async function erase() {
  busy.value = 'erase';
  try {
    await api(`/privacy/${props.kind}/${props.id}/erase`, {
      method: 'POST',
      json: { confirm: 'ERASE' },
    });
    sheet.value = false;
    toast.success('Personal data erased');
    await router.push(props.kind === 'client' ? '/clients' : '/partners');
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : "Couldn't erase. Nothing was changed.");
    await loadPlan();
  } finally {
    busy.value = null;
  }
}
</script>

<template>
  <section class="card mb-3" aria-labelledby="privacy-h">
    <div class="card-body">
      <h2 id="privacy-h" class="h3 mb-1">Their data (DPDP)</h2>
      <p class="small text-secondary mb-3">
        When someone asks, send them a copy of what you hold, or erase it. Both are logged.
      </p>
      <div class="d-flex flex-wrap gap-2">
        <SjButton
          variant="secondary"
          :loading="busy === 'export'"
          loading-label="Preparing…"
          @click="exportData"
          >Download their data</SjButton
        >
        <SjButton
          variant="danger"
          :disabled-reason="!plan ? 'Checking…' : (plan.blockers[0] ?? null)"
          @click="sheet = true"
          >Erase personal data</SjButton
        >
      </div>
    </div>
  </section>

  <SjSheet
    :open="sheet"
    :title="`Erase ${plan?.name ?? ''}’s personal data?`"
    @close="sheet = false"
  >
    <template v-if="plan">
      <p class="mb-2">This can't be undone. It removes:</p>
      <ul class="sj-plan mb-3">
        <li v-for="e in plan.erases" :key="e">{{ e }}</li>
      </ul>
      <p class="mb-2">It keeps, because the law requires it:</p>
      <ul class="sj-plan sj-plan--keep mb-3">
        <li v-for="k in plan.keeps" :key="k">{{ k }}</li>
      </ul>
      <p class="small text-secondary">Download their data first if they asked for a copy too.</p>
      <div class="d-flex gap-2 justify-content-end">
        <SjButton variant="ghost" @click="sheet = false">Cancel</SjButton>
        <SjButton
          variant="danger"
          :loading="busy === 'erase'"
          loading-label="Erasing…"
          @click="erase"
          >Erase for good</SjButton
        >
      </div>
    </template>
  </SjSheet>
</template>

<style scoped>
.sj-plan {
  padding-left: 1.1rem;
  font-size: 0.9rem;
}
.sj-plan li {
  margin-bottom: 4px;
}
.sj-plan--keep {
  color: #3d4250;
}
</style>
