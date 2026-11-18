<script setup lang="ts">
import {
  CONSENT_SOURCE_LABELS,
  CONSENT_SOURCES,
  checkGstin,
  formatDate,
  type ConsentSource,
} from '@shubhjets/shared';
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, ApiError } from '../../api/client';
import ConsentPanel from '../../components/ConsentPanel.vue';
import SjButton from '../../components/SjButton.vue';
import SjField from '../../components/SjField.vue';
import SjSkeleton from '../../components/SjSkeleton.vue';
import type { ConsentRecord, PartnerList } from '../../composables/partners';
import { useToast } from '../../composables/toast';

interface ClientDetail {
  id: string;
  name: string;
  type: 'FAMILY' | 'CORPORATE';
  phone: string | null;
  email: string | null;
  gstin: string | null;
  notes: string | null;
  partner: { id: string; firm: string } | null;
  weddings: {
    id: string;
    code: string;
    status: string;
    venueCity: string | null;
    startsOn: string | null;
  }[];
  consents: ConsentRecord[];
}

/** One page for a new client (/clients/new) and an existing one. */
const route = useRoute();
const router = useRouter();
const toast = useToast();
const isNew = computed(() => route.params.id === 'new');

const client = ref<ClientDetail | null>(null);
const partners = ref<{ id: string; firm: string }[]>([]);
const loading = ref(true);
const saving = ref(false);
const errors = ref<Record<string, string>>({});
const form = reactive({
  name: '',
  type: 'FAMILY' as 'FAMILY' | 'CORPORATE',
  phone: '',
  email: '',
  gstin: '',
  partnerId: '',
  notes: '',
  consentSource: '' as ConsentSource | '',
});

function fill(c: ClientDetail) {
  Object.assign(form, {
    name: c.name,
    type: c.type,
    phone: c.phone ?? '',
    email: c.email ?? '',
    gstin: c.gstin ?? '',
    partnerId: c.partner?.id ?? '',
    notes: c.notes ?? '',
  });
}

async function load() {
  try {
    const [list, detail] = await Promise.all([
      api<PartnerList>('/partners'),
      isNew.value
        ? Promise.resolve(null)
        : api<ClientDetail>(`/clients/${String(route.params.id)}`),
    ]);
    partners.value = list.items.map((p) => ({ id: p.id, firm: p.firm }));
    if (detail) {
      client.value = detail;
      fill(detail);
    } else if (typeof route.query.partnerId === 'string') {
      form.partnerId = route.query.partnerId;
    }
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : "Couldn't load this client");
  } finally {
    loading.value = false;
  }
}
onMounted(load);

const gstinCheck = (v: string) => {
  const r = checkGstin(v);
  return r.ok ? null : r.problem;
};

async function save() {
  errors.value = {};
  saving.value = true;
  const body: Record<string, unknown> = {
    name: form.name.trim(),
    type: form.type,
    phone: form.phone,
    email: form.email,
    gstin: form.gstin,
    partnerId: form.partnerId || null,
    notes: form.notes,
  };
  try {
    if (isNew.value) {
      if (form.consentSource) body.consent = { source: form.consentSource };
      const { id } = await api<{ id: string }>('/clients', { method: 'POST', json: body });
      toast.success('Client added');
      await router.replace(`/clients/${id}`);
      client.value = await api<ClientDetail>(`/clients/${id}`);
      fill(client.value);
    } else {
      client.value = await api<ClientDetail>(`/clients/${client.value!.id}`, {
        method: 'PATCH',
        json: body,
      });
      fill(client.value);
      toast.success('Saved');
    }
  } catch (e) {
    if (e instanceof ApiError && Object.keys(e.fields).length) {
      errors.value = e.fields;
      toast.error('Please fix the highlighted fields');
    } else toast.error(e instanceof ApiError ? e.message : "Couldn't save the client");
  } finally {
    saving.value = false;
  }
}

async function reload() {
  if (client.value) client.value = await api<ClientDetail>(`/clients/${client.value.id}`);
}
</script>

<template>
  <div>
    <RouterLink to="/clients" class="d-inline-block mb-2">‹ Clients</RouterLink>
    <SjSkeleton v-if="loading" :lines="6" height="3rem" />
    <template v-else>
      <h1 class="page-title mb-3">{{ isNew ? 'Add client' : client?.name }}</h1>
      <form novalidate @submit.prevent="save">
        <div class="card mb-3">
          <div class="card-body">
            <fieldset class="mb-3">
              <legend class="form-label">Type</legend>
              <label class="form-check form-check-inline"
                ><input v-model="form.type" class="form-check-input" type="radio" value="FAMILY" />
                Family</label
              >
              <label class="form-check form-check-inline"
                ><input
                  v-model="form.type"
                  class="form-check-input"
                  type="radio"
                  value="CORPORATE"
                />
                Company</label
              >
            </fieldset>
            <SjField
              v-model="form.name"
              label="Name"
              placeholder="e.g. Client C9 Family"
              :server-error="errors.name"
            />
            <SjField
              v-model="form.phone"
              label="Phone (WhatsApp)"
              optional
              type="tel"
              inputmode="tel"
              :server-error="errors.phone"
            />
            <SjField
              v-model="form.email"
              label="Email"
              optional
              type="email"
              inputmode="email"
              :server-error="errors.email"
            />
            <SjField
              v-model="form.gstin"
              label="GSTIN (for a GST invoice in their name)"
              optional
              uppercase
              :maxlength="15"
              :validate="gstinCheck"
              :server-error="errors.gstin"
            />
            <div class="mb-3">
              <label class="form-label" for="client-partner">Came through partner</label>
              <select
                id="client-partner"
                v-model="form.partnerId"
                class="form-select"
                :class="{ 'is-invalid': errors.partnerId }"
              >
                <option value="">No partner (direct)</option>
                <option v-for="p in partners" :key="p.id" :value="p.id">{{ p.firm }}</option>
              </select>
              <div v-if="errors.partnerId" class="invalid-feedback d-block">
                {{ errors.partnerId }}
              </div>
            </div>
            <SjField
              v-model="form.notes"
              label="Notes"
              optional
              multiline
              :maxlength="4000"
              :server-error="errors.notes"
            />
            <div v-if="isNew" class="mb-3">
              <label class="form-label" for="client-consent">Consent to keep their details</label>
              <select
                id="client-consent"
                v-model="form.consentSource"
                class="form-select"
                :class="{ 'is-invalid': errors['consent.source'] }"
              >
                <option value="">Not recorded yet</option>
                <option
                  v-for="s in CONSENT_SOURCES.filter((x) => x !== 'RESEARCH_IMPORT')"
                  :key="s"
                  :value="s"
                >
                  {{ CONSENT_SOURCE_LABELS[s] }}
                </option>
              </select>
              <div class="form-hint">
                Recorded with today's date and your privacy notice version.
              </div>
            </div>
          </div>
        </div>
        <div class="sj-actionbar">
          <SjButton
            type="submit"
            block
            :loading="saving"
            loading-label="Saving…"
            :disabled-reason="form.name.trim().length >= 2 ? null : 'Enter the name first'"
          >
            {{ isNew ? 'Add client' : 'Save changes' }}
          </SjButton>
        </div>
      </form>

      <template v-if="client">
        <section v-if="client.partner || client.weddings.length" class="card mb-3">
          <div class="card-body">
            <h2 class="h3">Weddings</h2>
            <p v-if="client.partner" class="mb-2">
              Via
              <RouterLink :to="`/partners/${client.partner.id}`">{{
                client.partner.firm
              }}</RouterLink>
            </p>
            <ul class="list-unstyled mb-0">
              <li v-for="w in client.weddings" :key="w.id" class="py-1">
                <span class="fw-bold">{{ w.code }}</span> · {{ w.venueCity }} ·
                {{ w.startsOn ? formatDate(w.startsOn) : '' }}
              </li>
            </ul>
          </div>
        </section>
        <ConsentPanel
          subject-type="CLIENT"
          :subject-id="client.id"
          :consents="client.consents"
          @changed="reload"
        />
      </template>
    </template>
  </div>
</template>
