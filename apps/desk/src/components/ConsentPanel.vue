<script setup lang="ts">
import {
  CONSENT_SOURCE_LABELS,
  CONSENT_SOURCES,
  formatDateTime,
  type ConsentSource,
} from '@shubhjets/shared';
import { computed, ref } from 'vue';
import { api, ApiError } from '../api/client';
import type { ConsentRecord } from '../composables/partners';
import { useToast } from '../composables/toast';
import SjButton from './SjButton.vue';
import SjConfirm from './SjConfirm.vue';
import SjSheet from './SjSheet.vue';

/** Consent records for a partner or client (DPDP Act 2023): record how they agreed, or that they withdrew. */
const props = defineProps<{
  subjectType: 'PARTNER' | 'CLIENT';
  subjectId: string;
  consents: ConsentRecord[];
}>();
const emit = defineEmits<{ changed: [] }>();
const toast = useToast();

const sheet = ref(false);
const source = ref<ConsentSource>('VERBAL_CALL');
const saving = ref(false);
const withdrawing = ref<ConsentRecord | null>(null);
const busyWithdraw = ref(false);

const active = computed(() => props.consents.find((c) => !c.withdrawnAt) ?? null);
/** Never crash on an unexpected value: show it as-is. */
const sourceLabel = (s: string) => CONSENT_SOURCE_LABELS[s as ConsentSource] ?? s;

async function record() {
  saving.value = true;
  try {
    await api('/consents', {
      method: 'POST',
      json: { subjectType: props.subjectType, subjectId: props.subjectId, source: source.value },
    });
    sheet.value = false;
    toast.success('Consent recorded');
    emit('changed');
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : "Couldn't record consent");
  } finally {
    saving.value = false;
  }
}

async function withdraw() {
  if (!withdrawing.value) return;
  busyWithdraw.value = true;
  try {
    await api(`/consents/${withdrawing.value.id}/withdraw`, { method: 'POST' });
    toast.success('Marked as withdrawn');
    emit('changed');
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : "Couldn't update consent");
  } finally {
    busyWithdraw.value = false;
    withdrawing.value = null;
  }
}
</script>

<template>
  <section class="card mb-3" aria-labelledby="consent-h">
    <div class="card-body">
      <div class="d-flex justify-content-between align-items-center mb-2">
        <h2 id="consent-h" class="h3 mb-0">Consent</h2>
        <SjButton variant="secondary" size="sm" @click="sheet = true">Record consent</SjButton>
      </div>
      <p v-if="active" class="text-success mb-2">
        ✓ Agreed {{ sourceLabel(active.source).toLowerCase() }},
        {{ formatDateTime(new Date(active.givenAt)) }}
      </p>
      <p v-else class="text-warning-emphasis mb-2">⚠ No current consent recorded</p>
      <ul v-if="consents.length" class="list-unstyled small mb-0">
        <li v-for="c in consents" :key="c.id" class="d-flex gap-2 align-items-center py-1">
          <span
            class="flex-fill"
            :class="{ 'text-secondary text-decoration-line-through': c.withdrawnAt }"
          >
            {{ sourceLabel(c.source) }} · {{ formatDateTime(new Date(c.givenAt)) }} · notice
            {{ c.noticeVersion }}
            <span v-if="c.withdrawnAt" class="d-block text-decoration-none"
              >Withdrawn {{ formatDateTime(new Date(c.withdrawnAt)) }}</span
            >
          </span>
          <SjButton v-if="!c.withdrawnAt" variant="ghost" size="sm" @click="withdrawing = c"
            >Mark withdrawn</SjButton
          >
        </li>
      </ul>
    </div>

    <SjSheet :open="sheet" title="Record consent" @close="sheet = false">
      <form novalidate @submit.prevent="record">
        <fieldset class="mb-3">
          <legend class="form-label">How did they agree?</legend>
          <label v-for="s in CONSENT_SOURCES" :key="s" class="form-check py-1">
            <input
              v-model="source"
              class="form-check-input"
              type="radio"
              name="consent-source"
              :value="s"
            />
            <span class="form-check-label">{{ CONSENT_SOURCE_LABELS[s] }}</span>
          </label>
        </fieldset>
        <p class="text-secondary small">
          Saved with today's date and your current privacy notice version.
        </p>
        <SjButton type="submit" block :loading="saving" loading-label="Saving…"
          >Record consent</SjButton
        >
      </form>
    </SjSheet>
    <SjConfirm
      :open="!!withdrawing"
      title="Mark consent as withdrawn?"
      body="The record is kept as proof, marked with today's date. Stop contacting them until they agree again."
      confirm-label="Mark withdrawn"
      :busy="busyWithdraw"
      @confirm="withdraw"
      @cancel="withdrawing = null"
    />
  </section>
</template>
