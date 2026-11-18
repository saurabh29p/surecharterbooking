<script setup lang="ts">
import {
  ENQUIRY_ROLE_LABELS,
  formatDate,
  formatDateTime,
  type EnquiryRole,
} from '@shubhjets/shared';
import { onMounted, ref } from 'vue';
import { api } from '../../api/client';

interface Enquiry {
  receivedAt: string;
  lastAt: string;
  repeats: number;
  name: string | null;
  role: EnquiryRole | null;
  firm: string | null;
  phone: string | null;
  email: string | null;
  weddingCity: string | null;
  weddingDate: string | null;
  guests: number | null;
  guestsFrom: string | null;
  message: string | null;
  page: string | null;
  gclid: boolean;
}

/** What the website form sent, exactly as typed, so the first call starts from their words. */
const props = defineProps<{ weddingId: string; draftedLegs: boolean }>();
const e = ref<Enquiry | null>(null);

onMounted(async () => {
  try {
    e.value = (
      await api<{ enquiry: Enquiry | null }>(`/weddings/${props.weddingId}/enquiry`)
    ).enquiry;
  } catch {
    e.value = null; // The card is extra information; the page works without it.
  }
});
</script>

<template>
  <section v-if="e" class="card mb-3 sj-web" aria-labelledby="web-h">
    <div class="card-body">
      <div class="d-flex justify-content-between align-items-baseline gap-2 mb-2">
        <h2 id="web-h" class="h3 mb-0">From the website</h2>
        <span class="small text-secondary">{{ formatDateTime(new Date(e.receivedAt)) }}</span>
      </div>
      <dl class="sj-web__list mb-0">
        <dt>Who</dt>
        <dd>
          {{ e.name }}<template v-if="e.role"> · {{ ENQUIRY_ROLE_LABELS[e.role] }}</template
          ><template v-if="e.firm"> · {{ e.firm }}</template>
        </dd>
        <template v-if="e.weddingCity || e.weddingDate">
          <dt>Wedding</dt>
          <dd>
            {{ e.weddingCity ?? 'City not given'
            }}<template v-if="e.weddingDate"> · {{ formatDate(e.weddingDate) }}</template>
          </dd>
        </template>
        <template v-if="e.guests || e.guestsFrom">
          <dt>Guests</dt>
          <dd>
            <template v-if="e.guests">{{ e.guests }} flying</template
            ><template v-if="e.guests && e.guestsFrom"> · </template>{{ e.guestsFrom }}
          </dd>
        </template>
        <template v-if="e.message">
          <dt>Message</dt>
          <dd class="sj-web__msg">{{ e.message }}</dd>
        </template>
        <template v-if="e.page">
          <dt>Page</dt>
          <dd>
            <code>{{ e.page }}</code><span v-if="e.gclid" class="sj-badge sj-badge--gold ms-2"
              >Google Ads click</span
            >
          </dd>
        </template>
      </dl>
      <p v-if="e.repeats" class="small text-secondary mt-2 mb-0">
        Sent {{ e.repeats + 1 }} times (last {{ formatDateTime(new Date(e.lastAt)) }}); kept as one
        wedding.
      </p>
      <p v-if="draftedLegs" class="small text-secondary mt-2 mb-0">
        Legs were drafted from where guests fly from, for the day before the wedding. Confirm dates,
        times and numbers on the call.
      </p>
    </div>
  </section>
</template>

<style scoped>
.sj-web {
  border-left: 3px solid var(--sj-gold);
}
.sj-web__list {
  display: grid;
  grid-template-columns: 76px 1fr;
  gap: 4px 10px;
}
.sj-web__list dt {
  font-weight: 600;
  color: var(--tblr-secondary, #667085);
  font-size: 0.85rem;
}
.sj-web__list dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.sj-web__msg {
  white-space: pre-line;
}
</style>
