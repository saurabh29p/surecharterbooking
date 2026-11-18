<script setup lang="ts">
import {
  CATEGORY_LABELS,
  formatDayMonth,
  formatINR,
  istToInstant,
  parseRupees,
} from '@shubhjets/shared';
import { computed, reactive, ref, watch } from 'vue';
import { api, ApiError } from '../../api/client';
import type { AircraftRow, OperatorDetail, OperatorListItem } from '../../composables/operators';
import type { RateRequestRow } from '../../composables/rates';
import { useToast } from '../../composables/toast';
import type { LegRow } from '../../composables/weddings';
import SjButton from '../SjButton.vue';
import SjField from '../SjField.vue';
import SjSheet from '../SjSheet.vue';

/** Record an operator's reply: aircraft, net rate, the legs it covers (a package is split across them), validity. */
const props = defineProps<{
  open: boolean;
  weddingId: string;
  legs: LegRow[];
  requests: RateRequestRow[];
  operatorId?: string | null;
}>();
const emit = defineEmits<{ close: []; saved: [] }>();
const toast = useToast();

const operators = ref<OperatorListItem[]>([]);
const fleet = ref<AircraftRow[]>([]);
const saving = ref(false);
const errors = ref<Record<string, string>>({});
const form = reactive({
  operatorId: '',
  aircraftId: '',
  aircraftText: '',
  seats: '',
  netRate: '',
  legIds: [] as string[],
  validDate: '',
  validTime: '18:00',
  inclusions: '',
  exclusions: '',
  cancellationTerms: '',
  rawText: '',
});

watch(
  () => props.open,
  async (open) => {
    if (!open) return;
    errors.value = {};
    Object.assign(form, {
      operatorId: props.operatorId ?? '',
      aircraftId: '',
      aircraftText: '',
      seats: '',
      netRate: '',
      legIds: [],
      validDate: '',
      validTime: '18:00',
      inclusions: '',
      exclusions: '',
      cancellationTerms: '',
      rawText: '',
    });
    if (!operators.value.length) {
      try {
        operators.value = await api<OperatorListItem[]>(
          '/operators?status=VERIFIED,EXPIRING_SOON,BLOCKED,FOUND',
        );
      } catch {
        toast.error("Couldn't load operators");
      }
    }
    await onOperator();
  },
);

/** Operators you asked come first. */
const ordered = computed(() => {
  const asked = new Set(props.requests.map((r) => r.operator.id));
  return [...operators.value].sort((a, b) => Number(asked.has(b.id)) - Number(asked.has(a.id)));
});

async function onOperator() {
  fleet.value = [];
  form.aircraftId = '';
  if (!form.operatorId) return;
  // Default the legs to what you asked this operator for.
  const req = [...props.requests].reverse().find((r) => r.operator.id === form.operatorId);
  form.legIds = req ? [...req.legIds] : props.legs.map((l) => l.id);
  try {
    const op = await api<OperatorDetail>(`/operators/${form.operatorId}`);
    fleet.value = op.aircraft;
    if (!form.cancellationTerms && op.cancellationTerms)
      form.cancellationTerms = op.cancellationTerms;
  } catch {
    // fleet stays empty; the aircraft can be typed
  }
}

watch(
  () => form.aircraftId,
  (id) => {
    const a = fleet.value.find((x) => x.id === id);
    if (a) form.seats = String(a.seats);
  },
);

const preview = computed(() => {
  try {
    const net = parseRupees(form.netRate);
    if (form.legIds.length < 2) return null;
    return `${formatINR(net, { paise: 'never' })} for ${form.legIds.length} legs: about ${formatINR(Math.round(net / form.legIds.length), { paise: 'never' })} each`;
  } catch {
    return null;
  }
});

async function save() {
  errors.value = {};
  let netRate: number;
  try {
    netRate = parseRupees(form.netRate);
  } catch {
    errors.value = { netRate: 'Enter the net rate in rupees, e.g. 9,50,000' };
    return;
  }
  saving.value = true;
  try {
    await api(`/weddings/${props.weddingId}/rate-responses`, {
      method: 'POST',
      json: {
        operatorId: form.operatorId,
        aircraftId: form.aircraftId || null,
        aircraftText: form.aircraftId ? null : form.aircraftText,
        seats: form.seats ? Number(form.seats) : null,
        netRate,
        legIds: form.legIds,
        validUntil: form.validDate
          ? istToInstant(form.validDate, form.validTime || '23:59').toISOString()
          : null,
        inclusions: form.inclusions,
        exclusions: form.exclusions,
        cancellationTerms: form.cancellationTerms,
        rawText: form.rawText,
      },
    });
    toast.success('Rate added to the comparison');
    emit('saved');
  } catch (e) {
    if (e instanceof ApiError && Object.keys(e.fields).length) errors.value = e.fields;
    else toast.error(e instanceof ApiError ? e.message : "Couldn't save the rate");
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <SjSheet :open="open" title="Add an operator's reply" @close="emit('close')">
    <form novalidate @submit.prevent="save">
      <div class="mb-3">
        <label class="form-label" for="r-op">Operator</label>
        <select
          id="r-op"
          v-model="form.operatorId"
          class="form-select"
          :class="{ 'is-invalid': errors.operatorId }"
          @change="onOperator"
        >
          <option value="" disabled>Choose…</option>
          <option v-for="o in ordered" :key="o.id" :value="o.id">
            {{ o.brand || o.legalName
            }}{{ requests.some((r) => r.operator.id === o.id) ? ' (asked)' : '' }}
          </option>
        </select>
        <div v-if="errors.operatorId" class="invalid-feedback d-block">{{ errors.operatorId }}</div>
      </div>

      <div class="mb-3">
        <label class="form-label" for="r-ac">Aircraft</label>
        <select
          id="r-ac"
          v-model="form.aircraftId"
          class="form-select"
          :class="{ 'is-invalid': errors.aircraftId }"
        >
          <option value="">Not in their fleet list (type it)</option>
          <option v-for="a in fleet" :key="a.id" :value="a.id">
            {{ a.type }} {{ a.registration ?? '' }} ·
            {{ CATEGORY_LABELS[a.category].toLowerCase() }} · {{ a.seats }} seats
          </option>
        </select>
        <div v-if="errors.aircraftId" class="invalid-feedback d-block">{{ errors.aircraftId }}</div>
      </div>
      <SjField
        v-if="!form.aircraftId"
        v-model="form.aircraftText"
        label="Aircraft as they described it"
        placeholder="e.g. Citation XLS VT-ZZ9"
        :server-error="errors.aircraftText"
      />
      <div class="d-flex gap-2">
        <div style="flex: 0 0 110px">
          <SjField
            v-model="form.seats"
            label="Seats"
            inputmode="numeric"
            :server-error="errors.seats"
          />
        </div>
        <div class="flex-fill">
          <SjField
            v-model="form.netRate"
            label="Net rate (₹, before GST)"
            inputmode="decimal"
            placeholder="e.g. 9,50,000"
            :server-error="errors.netRate"
          />
        </div>
      </div>

      <fieldset class="mb-3">
        <legend class="form-label">Legs this rate covers</legend>
        <label v-for="l in legs" :key="l.id" class="form-check">
          <input v-model="form.legIds" class="form-check-input" type="checkbox" :value="l.id" />
          <span class="form-check-label"
            >Leg {{ l.seq }}: {{ l.fromIata }} → {{ l.toIata }},
            {{ formatDayMonth(l.flightDate) }}</span
          >
        </label>
        <div v-if="errors.legIds || errors.costShares" class="invalid-feedback d-block">
          {{ errors.legIds ?? errors.costShares }}
        </div>
        <div v-else-if="preview" class="form-hint">Package: {{ preview }}</div>
      </fieldset>

      <div class="mb-3">
        <span class="form-label d-block">Rate valid until (India time)</span>
        <div class="d-flex gap-2">
          <input
            v-model="form.validDate"
            type="date"
            class="form-control"
            aria-label="Valid until date"
          />
          <input
            v-model="form.validTime"
            type="time"
            class="form-control"
            style="max-width: 130px"
            aria-label="Valid until time"
          />
        </div>
      </div>
      <SjField
        v-model="form.inclusions"
        label="Included"
        optional
        multiline
        :maxlength="2000"
        placeholder="e.g. fuel, crew, airport charges, catering"
      />
      <SjField
        v-model="form.exclusions"
        label="Not included"
        optional
        multiline
        :maxlength="2000"
        placeholder="e.g. GST, crew overnight stay"
      />
      <SjField
        v-model="form.cancellationTerms"
        label="Their cancellation terms"
        optional
        multiline
        :maxlength="2000"
      />
      <SjField
        v-model="form.rawText"
        label="Their message (paste for reference)"
        optional
        multiline
        :maxlength="10000"
      />
      <SjButton
        type="submit"
        block
        :loading="saving"
        loading-label="Saving…"
        :disabled-reason="form.operatorId ? null : 'Choose the operator first'"
        >Add to comparison</SjButton
      >
      <p class="small text-secondary mt-2 mb-0">
        Net rates stay internal: they never appear on anything shared with partners or clients.
      </p>
    </form>
  </SjSheet>
</template>
