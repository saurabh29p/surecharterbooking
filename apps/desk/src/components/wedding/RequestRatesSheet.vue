<script setup lang="ts">
import { formatDayMonth } from '@shubhjets/shared';
import { computed, ref, watch } from 'vue';
import { api, ApiError } from '../../api/client';
import type { RequestResult, Suggestion } from '../../composables/rates';
import { useToast } from '../../composables/toast';
import type { LegRow } from '../../composables/weddings';
import SjButton from '../SjButton.vue';
import SjSheet from '../SjSheet.vue';

/**
 * Ask operators for rates: choose legs, pick from verified operators ranked by code (with reasons),
 * then send each drafted message yourself (WhatsApp / email / copy). Nothing is sent automatically.
 */
const props = defineProps<{ open: boolean; weddingId: string; legs: LegRow[] }>();
const emit = defineEmits<{ close: []; sent: [] }>();
const toast = useToast();

const legIds = ref<string[]>([]);
const suggestions = ref<Suggestion[] | null>(null);
const picked = ref<string[]>([]);
const sending = ref(false);
const results = ref<RequestResult[] | null>(null);

watch(
  () => props.open,
  async (open) => {
    if (!open) return;
    results.value = null;
    legIds.value = props.legs
      .filter((l) => !['CONFIRMED', 'FLOWN', 'CANCELLED'].includes(l.status))
      .map((l) => l.id);
    await loadSuggestions();
  },
);

/** Ranked for the first chosen leg (legs of one wedding usually share the route both ways). */
async function loadSuggestions() {
  suggestions.value = null;
  const first = legIds.value[0];
  if (!first) {
    suggestions.value = [];
    return;
  }
  try {
    suggestions.value = await api<Suggestion[]>(`/legs/${first}/suggestions`);
    picked.value = suggestions.value
      .filter((s) => !s.alreadyAsked)
      .slice(0, 3)
      .map((s) => s.id);
  } catch (e) {
    suggestions.value = [];
    toast.error(e instanceof ApiError ? e.message : "Couldn't load suggestions");
  }
}

const blockerText = computed(() =>
  !legIds.value.length
    ? 'Choose at least one leg'
    : !picked.value.length
      ? 'Choose at least one operator'
      : null,
);

async function send() {
  sending.value = true;
  try {
    results.value = await api<RequestResult[]>(`/weddings/${props.weddingId}/rate-requests`, {
      method: 'POST',
      json: { operatorIds: picked.value, legIds: legIds.value, channel: 'WHATSAPP' },
    });
    emit('sent');
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : "Couldn't record the requests");
  } finally {
    sending.value = false;
  }
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success('Message copied');
  } catch {
    toast.error("Couldn't copy. Select the text and copy it by hand.");
  }
}
</script>

<template>
  <SjSheet
    :open="open"
    :title="results ? 'Send your requests' : 'Ask operators for rates'"
    @close="emit('close')"
  >
    <template v-if="!results">
      <fieldset class="mb-3">
        <legend class="form-label">Legs</legend>
        <label v-for="l in legs" :key="l.id" class="form-check">
          <input
            v-model="legIds"
            class="form-check-input"
            type="checkbox"
            :value="l.id"
            @change="loadSuggestions"
          />
          <span class="form-check-label"
            >Leg {{ l.seq }}: {{ l.fromIata }} → {{ l.toIata }}, {{ formatDayMonth(l.flightDate) }},
            {{ l.pax }} guests</span
          >
        </label>
      </fieldset>

      <fieldset class="mb-3">
        <legend class="form-label">Verified operators, best fit first</legend>
        <p v-if="!suggestions" class="text-secondary small">Finding operators…</p>
        <p v-else-if="!suggestions.length" class="text-secondary small">
          No verified operator can seat this group. Verify more operators or check their fleets
          under Operators.
        </p>
        <label
          v-for="s in suggestions"
          :key="s.id"
          class="sj-pick"
          :class="{ 'is-selected': picked.includes(s.id) }"
        >
          <input v-model="picked" type="checkbox" :value="s.id" />
          <span>
            <span class="fw-bold">{{ s.name }}</span>
            <span v-if="s.alreadyAsked" class="sj-badge sj-badge--muted ms-1">Already asked</span>
            <span class="d-block small text-secondary">{{ s.reasons.join(' · ') }}</span>
          </span>
        </label>
      </fieldset>
      <SjButton
        block
        :loading="sending"
        loading-label="Preparing…"
        :disabled-reason="blockerText"
        @click="send"
      >
        Prepare {{ picked.length }} request{{ picked.length === 1 ? '' : 's' }}
      </SjButton>
      <p class="small text-secondary mt-2 mb-0">
        Nothing is sent automatically: the next screen opens WhatsApp or email with the message
        ready.
      </p>
    </template>

    <template v-else>
      <p class="small text-secondary">Requests are recorded. Send each one yourself:</p>
      <div v-for="r in results" :key="r.requestId" class="sj-result">
        <div class="fw-bold mb-1">{{ r.operator.name }}</div>
        <details class="small mb-2">
          <summary>Show message</summary>
          <pre class="sj-msg">{{ r.message }}</pre>
        </details>
        <div class="d-flex gap-2 flex-wrap">
          <a
            v-if="r.whatsappUrl"
            :href="r.whatsappUrl"
            target="_blank"
            rel="noopener"
            class="sj-btn sj-btn--primary sj-btn--sm"
            >WhatsApp</a
          >
          <a v-if="r.mailtoUrl" :href="r.mailtoUrl" class="sj-btn sj-btn--secondary sj-btn--sm"
            >Email</a
          >
          <SjButton variant="secondary" size="sm" @click="copy(r.message)">Copy message</SjButton>
        </div>
        <p v-if="!r.whatsappUrl && !r.mailtoUrl" class="small text-warning-emphasis mt-1 mb-0">
          No phone or email saved for this operator: copy the message.
        </p>
      </div>
      <SjButton block variant="secondary" class="mt-2" @click="emit('close')">Done</SjButton>
    </template>
  </SjSheet>
</template>

<style scoped>
.sj-pick {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 10px;
  border: 1px solid #d6d9e0;
  border-radius: 10px;
  margin-bottom: 8px;
  cursor: pointer;
  min-height: 44px;
  transition:
    border-color var(--sj-fast),
    background-color var(--sj-fast);
}
.sj-pick:hover {
  border-color: var(--sj-gold);
}
.sj-pick.is-selected {
  border-color: var(--sj-gold);
  background: #fbf6ea;
}
.sj-pick input {
  margin-top: 4px;
}
.sj-result {
  padding: 12px 0;
  border-top: 1px solid #eceef2;
}
.sj-msg {
  white-space: pre-wrap;
  font-family: inherit;
  background: #f6f7f9;
  padding: 8px;
  border-radius: 8px;
  margin: 6px 0 0;
}
a.sj-btn {
  text-decoration: none;
}
</style>
