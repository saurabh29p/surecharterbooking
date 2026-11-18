<script setup lang="ts">
import { checkCin, checkGstin } from '@shubhjets/shared';
import { computed } from 'vue';
import { useAirports } from '../../composables/airports';
import SjField from '../SjField.vue';

export interface OperatorForm {
  legalName: string;
  brand: string;
  nsopNo: string;
  nsopIssuedOn: string;
  cin: string;
  gstin: string;
  bases: string[];
  website: string;
  safetyDisclosureUrl: string;
  sourceLink: string;
  dgcaRank: string;
  dgcaRankCheckedOn: string;
  dgcaRankSource: string;
  cancellationTerms: string;
  notes: string;
}

defineProps<{ errors: Record<string, string> }>();
const form = defineModel<OperatorForm>('form', { required: true });
const { airports } = useAirports();

const available = computed(() => airports.value.filter((a) => !form.value.bases.includes(a.iata)));
function addBase(e: Event) {
  const v = (e.target as HTMLSelectElement).value;
  if (v) form.value.bases = [...form.value.bases, v];
  (e.target as HTMLSelectElement).value = '';
}
const gstinCheck = (v: string) => {
  const r = checkGstin(v);
  return r.ok ? null : r.problem;
};
</script>

<template>
  <div>
    <SjField
      v-model="form.legalName"
      label="Legal name"
      autocomplete="off"
      :server-error="errors.legalName"
      placeholder="As on the NSOP permit"
    />
    <SjField
      v-model="form.brand"
      label="Brand / trading name"
      optional
      :server-error="errors.brand"
    />
    <SjField
      v-model="form.nsopNo"
      label="NSOP permit number"
      uppercase
      :server-error="errors.nsopNo"
      hint="Needed before the operator can be verified"
    />
    <div class="mb-3">
      <label class="form-label" for="nsop-issued"
        >NSOP issued on <span class="text-secondary fw-normal">(optional)</span></label
      >
      <input
        id="nsop-issued"
        v-model="form.nsopIssuedOn"
        type="date"
        class="form-control"
        style="max-width: 220px"
      />
    </div>

    <div class="mb-3">
      <span class="form-label d-block"
        >Home bases
        <span class="text-secondary fw-normal">(where its aircraft are based)</span></span
      >
      <div class="d-flex gap-2 flex-wrap align-items-center">
        <span v-for="b in form.bases" :key="b" class="sj-badge sj-badge--muted sj-base">
          {{ b }}
          <button
            type="button"
            :aria-label="`Remove ${b}`"
            @click="form.bases = form.bases.filter((x) => x !== b)"
          >
            ×
          </button>
        </span>
        <select
          class="form-select"
          style="max-width: 220px"
          aria-label="Add a base airport"
          @change="addBase"
        >
          <option value="">+ Add base</option>
          <option v-for="a in available" :key="a.iata" :value="a.iata">
            {{ a.city }} ({{ a.iata }})
          </option>
        </select>
      </div>
      <div v-if="errors.bases" class="invalid-feedback d-block">{{ errors.bases }}</div>
    </div>

    <SjField
      v-model="form.cin"
      label="CIN"
      optional
      uppercase
      :maxlength="21"
      :validate="checkCin"
      :server-error="errors.cin"
    />
    <SjField
      v-model="form.gstin"
      label="GSTIN"
      optional
      uppercase
      :maxlength="15"
      :validate="gstinCheck"
      :server-error="errors.gstin"
    />
    <SjField
      v-model="form.website"
      label="Website"
      optional
      inputmode="text"
      :server-error="errors.website"
    />
    <SjField
      v-model="form.safetyDisclosureUrl"
      label="Safety disclosure page"
      optional
      :server-error="errors.safetyDisclosureUrl"
      hint="DGCA requires operators to publish aircraft age, maintenance history and pilot experience"
    />
    <SjField
      v-model="form.sourceLink"
      label="Where you found them"
      optional
      :server-error="errors.sourceLink"
    />
    <div class="d-flex gap-2 flex-wrap">
      <div style="flex: 1 1 120px">
        <SjField
          v-model="form.dgcaRank"
          label="DGCA safety rank"
          optional
          inputmode="numeric"
          :server-error="errors.dgcaRank"
        />
      </div>
      <div class="mb-3" style="flex: 1 1 160px">
        <label class="form-label" for="rank-checked">Rank checked on</label>
        <input
          id="rank-checked"
          v-model="form.dgcaRankCheckedOn"
          type="date"
          class="form-control"
        />
      </div>
    </div>
    <SjField
      v-model="form.dgcaRankSource"
      label="Rank source"
      optional
      :server-error="errors.dgcaRankSource"
    />
    <SjField
      v-model="form.cancellationTerms"
      label="Their cancellation terms"
      optional
      multiline
      :maxlength="2000"
      :server-error="errors.cancellationTerms"
      hint="Shown next to yours on the quote screen, so yours are never looser"
    />
    <SjField
      v-model="form.notes"
      label="Notes"
      optional
      multiline
      :maxlength="4000"
      :server-error="errors.notes"
    />
  </div>
</template>

<style scoped>
.sj-base button {
  border: 0;
  background: none;
  min-width: 28px;
  min-height: 28px;
  font-weight: 700;
  cursor: pointer;
}
</style>
