<script setup lang="ts">
import {
  CONSENT_SOURCE_LABELS,
  CONSENT_SOURCES,
  LEAD_SOURCES,
  LEAD_SOURCE_LABELS,
  type LeadSource,
} from '@shubhjets/shared';
import { onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api, ApiError } from '../../api/client';
import SjButton from '../../components/SjButton.vue';
import SjField from '../../components/SjField.vue';
import LegFields from '../../components/wedding/LegFields.vue';
import type { PartnerList } from '../../composables/partners';
import { useToast } from '../../composables/toast';
import { emptyLeg, legBody, type LegDraft } from '../../composables/weddings';

const router = useRouter();
const toast = useToast();
const partners = ref<{ id: string; firm: string }[]>([]);
const clients = ref<{ id: string; name: string; partnerId: string | null }[]>([]);
const saving = ref(false);
const errors = ref<Record<string, string>>({});

const form = reactive({
  partnerId: '',
  clientMode: 'new' as 'new' | 'existing',
  clientId: '',
  newClient: { name: '', phone: '', consentSource: '' },
  venueCity: '',
  startsOn: '',
  endsOn: '',
  leadSource: 'PARTNER' as LeadSource,
  notes: '',
});
const legs = ref<LegDraft[]>([emptyLeg()]);

onMounted(async () => {
  try {
    const [p, c] = await Promise.all([
      api<PartnerList>('/partners'),
      api<{ id: string; name: string; partnerId: string | null }[]>('/clients'),
    ]);
    partners.value = p.items.map((x) => ({ id: x.id, firm: x.firm }));
    clients.value = c;
  } catch {
    toast.error("Couldn't load partners and clients");
  }
});

// Choosing a partner makes "Partner" the lead source; clearing it suggests "My network".
watch(
  () => form.partnerId,
  (v) => {
    if (v && form.leadSource !== 'HOTEL') form.leadSource = 'PARTNER';
    if (!v && form.leadSource === 'PARTNER') form.leadSource = 'NETWORK';
  },
);

function addLeg() {
  legs.value.push(emptyLeg(legs.value.at(-1)));
}

async function save() {
  errors.value = {};
  saving.value = true;
  try {
    const body = {
      partnerId: form.partnerId || null,
      clientId: form.clientMode === 'existing' ? form.clientId || null : null,
      newClient:
        form.clientMode === 'new' && form.newClient.name.trim()
          ? {
              name: form.newClient.name,
              phone: form.newClient.phone,
              consentSource: form.newClient.consentSource || undefined,
            }
          : undefined,
      venueCity: form.venueCity,
      startsOn: form.startsOn,
      endsOn: form.endsOn,
      leadSource: form.leadSource,
      notes: form.notes,
      legs: legs.value.map(legBody),
    };
    const res = await api<{ id: string; code: string }>('/weddings', {
      method: 'POST',
      json: body,
    });
    toast.success(`${res.code} created. Next: ask operators for rates.`);
    await router.replace(`/weddings/${res.id}`);
  } catch (e) {
    if (e instanceof ApiError && Object.keys(e.fields).length) {
      errors.value = e.fields;
      toast.error('Please fix the highlighted fields');
    } else toast.error(e instanceof ApiError ? e.message : "Couldn't create the wedding");
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div>
    <RouterLink to="/weddings" class="d-inline-block mb-2">‹ Weddings</RouterLink>
    <h1 class="page-title mb-3">New wedding</h1>
    <form novalidate @submit.prevent="save">
      <section class="card mb-3">
        <div class="card-body">
          <h2 class="h3">Who</h2>
          <div class="mb-3">
            <label class="form-label" for="w-partner">Partner</label>
            <select
              id="w-partner"
              v-model="form.partnerId"
              class="form-select"
              :class="{ 'is-invalid': errors.partnerId }"
            >
              <option value="">No partner (direct)</option>
              <option v-for="p in partners" :key="p.id" :value="p.id">{{ p.firm }}</option>
            </select>
          </div>
          <div class="d-flex gap-3 mb-2" role="radiogroup" aria-label="Client">
            <label class="form-check"
              ><input v-model="form.clientMode" class="form-check-input" type="radio" value="new" />
              New client</label
            >
            <label class="form-check"
              ><input
                v-model="form.clientMode"
                class="form-check-input"
                type="radio"
                value="existing"
              />
              Existing client</label
            >
          </div>
          <template v-if="form.clientMode === 'new'">
            <SjField
              v-model="form.newClient.name"
              label="Client name"
              optional
              placeholder="e.g. Client C9 Family"
              :server-error="errors['newClient.name']"
            />
            <SjField
              v-model="form.newClient.phone"
              label="Client phone"
              optional
              type="tel"
              inputmode="tel"
              :server-error="errors['newClient.phone']"
            />
            <div class="mb-3">
              <label class="form-label" for="w-consent">Consent to keep their details</label>
              <select id="w-consent" v-model="form.newClient.consentSource" class="form-select">
                <option value="">Not recorded yet</option>
                <option
                  v-for="s in CONSENT_SOURCES.filter((x) => x !== 'RESEARCH_IMPORT')"
                  :key="s"
                  :value="s"
                >
                  {{ CONSENT_SOURCE_LABELS[s] }}
                </option>
              </select>
            </div>
          </template>
          <div v-else class="mb-3">
            <label class="form-label" for="w-client">Client</label>
            <select
              id="w-client"
              v-model="form.clientId"
              class="form-select"
              :class="{ 'is-invalid': errors.clientId }"
            >
              <option value="">Choose…</option>
              <option v-for="c in clients" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
            <div v-if="errors.clientId" class="invalid-feedback d-block">{{ errors.clientId }}</div>
          </div>
          <div class="mb-0">
            <label class="form-label" for="w-lead">Lead source</label>
            <select id="w-lead" v-model="form.leadSource" class="form-select">
              <option v-for="s in LEAD_SOURCES" :key="s" :value="s">
                {{ LEAD_SOURCE_LABELS[s] }}
              </option>
            </select>
          </div>
        </div>
      </section>

      <section class="card mb-3">
        <div class="card-body">
          <h2 class="h3">Wedding</h2>
          <SjField
            v-model="form.venueCity"
            label="Venue city"
            optional
            placeholder="e.g. Udaipur"
            :server-error="errors.venueCity"
          />
          <div class="d-flex gap-2">
            <div class="flex-fill mb-3">
              <label class="form-label" for="w-start">First day</label>
              <input id="w-start" v-model="form.startsOn" type="date" class="form-control" />
            </div>
            <div class="flex-fill mb-3">
              <label class="form-label" for="w-end">Last day</label>
              <input
                id="w-end"
                v-model="form.endsOn"
                type="date"
                class="form-control"
                :class="{ 'is-invalid': errors.endsOn }"
              />
            </div>
          </div>
          <div v-if="errors.endsOn" class="invalid-feedback d-block mb-2">{{ errors.endsOn }}</div>
          <SjField
            v-model="form.notes"
            label="Notes"
            optional
            multiline
            :maxlength="4000"
            placeholder="Paste the enquiry message here for reference"
          />
        </div>
      </section>

      <section class="card mb-3">
        <div class="card-body">
          <h2 class="h3">Flights</h2>
          <TransitionGroup tag="div" name="sj-list">
            <div v-for="(leg, i) in legs" :key="i" class="sj-legbox">
              <div class="d-flex justify-content-between align-items-center mb-2">
                <span class="fw-bold">Leg {{ i + 1 }}</span>
                <SjButton
                  v-if="legs.length > 1"
                  variant="ghost"
                  size="sm"
                  :aria-label="`Remove leg ${i + 1}`"
                  @click="legs.splice(i, 1)"
                  >Remove</SjButton
                >
              </div>
              <LegFields v-model:leg="legs[i]!" :errors="errors" :prefix="`legs.${i}.`" />
            </div>
          </TransitionGroup>
          <SjButton variant="secondary" @click="addLeg">+ Add leg (return pre-filled)</SjButton>
        </div>
      </section>

      <div class="sj-actionbar">
        <SjButton type="submit" block :loading="saving" loading-label="Creating…"
          >Create wedding</SjButton
        >
      </div>
    </form>
  </div>
</template>

<style scoped>
.sj-legbox {
  padding: 12px 0 16px;
  border-bottom: 1px solid #eceef2;
  margin-bottom: 12px;
}
</style>
