<script setup lang="ts">
import {
  COMMISSION_BASIS_LABELS,
  PARTNER_TYPE_LABELS,
  type CommissionBasis,
  type PartnerType,
} from '@shubhjets/shared';
import SjField from '../SjField.vue';

export interface PartnerForm {
  type: PartnerType;
  firm: string;
  city: string;
  contactPerson: string;
  phone: string;
  email: string;
  website: string;
  instagram: string;
  sourceLink: string;
  fitNote: string;
  notes: string;
  commissionBasis: CommissionBasis;
  commissionPct: string;
  nextFollowUpOn: string;
}

defineProps<{ errors: Record<string, string> }>();
const form = defineModel<PartnerForm>('form', { required: true });
</script>

<template>
  <div>
    <fieldset class="mb-3">
      <legend class="form-label">Type</legend>
      <div class="d-flex gap-2 flex-wrap">
        <label
          v-for="(label, t) in PARTNER_TYPE_LABELS"
          :key="t"
          class="sj-choice-inline"
          :class="{ 'is-selected': form.type === t }"
        >
          <input v-model="form.type" type="radio" name="partner-type" :value="t" />
          {{ label }}
        </label>
      </div>
    </fieldset>
    <SjField v-model="form.firm" label="Firm or hotel name" :server-error="errors.firm" />
    <SjField v-model="form.city" label="City" optional :server-error="errors.city" />
    <SjField
      v-model="form.contactPerson"
      label="Contact person"
      optional
      autocomplete="off"
      :server-error="errors.contactPerson"
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
    <SjField v-model="form.website" label="Website" optional :server-error="errors.website" />
    <SjField
      v-model="form.instagram"
      label="Instagram"
      optional
      placeholder="@handle"
      :server-error="errors.instagram"
    />
    <SjField
      v-model="form.sourceLink"
      label="Where you found them"
      optional
      :server-error="errors.sourceLink"
    />
    <SjField
      v-model="form.fitNote"
      label="Why they fit"
      optional
      :maxlength="500"
      :server-error="errors.fitNote"
    />

    <div class="mb-3">
      <span class="form-label d-block">Commission</span>
      <div class="d-flex gap-2 flex-wrap">
        <select
          v-model="form.commissionBasis"
          class="form-select"
          style="max-width: 240px"
          aria-label="Commission basis"
        >
          <option v-for="(label, b) in COMMISSION_BASIS_LABELS" :key="b" :value="b">
            {{ label }}
          </option>
        </select>
        <div class="input-group" style="max-width: 130px">
          <input
            v-model="form.commissionPct"
            class="form-control"
            inputmode="decimal"
            aria-label="Commission percentage"
            :class="{ 'is-invalid': errors.commissionBps }"
          />
          <span class="input-group-text">%</span>
        </div>
      </div>
      <div v-if="errors.commissionBps" class="invalid-feedback d-block">
        {{ errors.commissionBps }}
      </div>
      <div v-else class="form-hint">Earned only after the client has paid and flown.</div>
    </div>

    <div class="mb-3">
      <label class="form-label" for="next-fu"
        >Next follow-up <span class="text-secondary fw-normal">(optional)</span></label
      >
      <input
        id="next-fu"
        v-model="form.nextFollowUpOn"
        type="date"
        class="form-control"
        style="max-width: 220px"
      />
    </div>
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
.sj-choice-inline {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 8px 14px;
  border: 1px solid #d6d9e0;
  border-radius: 10px;
  cursor: pointer;
  transition:
    border-color var(--sj-fast),
    background-color var(--sj-fast);
}
.sj-choice-inline:hover {
  border-color: var(--sj-gold);
}
.sj-choice-inline.is-selected {
  border-color: var(--sj-gold);
  background: #fbf6ea;
}
</style>
