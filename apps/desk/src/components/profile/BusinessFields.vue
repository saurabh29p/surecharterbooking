<script setup lang="ts">
import { GST_STATES } from '@shubhjets/shared';
import { useId } from 'vue';
import { validators, type ProfileFormState } from '../../composables/profileForm';
import SjField from '../SjField.vue';

defineProps<{ errors: Record<string, string>; showLabel?: boolean }>();
const form = defineModel<ProfileFormState>('form', { required: true });
const stateId = useId();
</script>

<template>
  <div>
    <SjField
      v-if="showLabel"
      v-model="form.label"
      label="Profile name"
      hint="A short name to tell profiles apart, e.g. Delhi"
      :server-error="errors.label"
    />
    <SjField
      v-model="form.brandName"
      label="Brand name"
      optional
      hint="Shown on quotes and PDFs"
      :server-error="errors.brandName"
    />
    <SjField
      v-model="form.legalName"
      label="Legal entity name"
      optional
      autocomplete="organization"
      placeholder="e.g. Example Exim LLP"
      :server-error="errors.legalName"
    />
    <div class="mb-3">
      <label :for="stateId" class="form-label">State (for GST)</label>
      <select
        :id="stateId"
        v-model="form.stateCode"
        class="form-select"
        :class="{ 'is-invalid': errors.stateCode }"
      >
        <option v-for="s in GST_STATES" :key="s.code" :value="s.code">
          {{ s.name }} ({{ s.code }})
        </option>
      </select>
      <div v-if="errors.stateCode" class="invalid-feedback d-block">{{ errors.stateCode }}</div>
    </div>
    <SjField
      v-model="form.gstin"
      label="GSTIN"
      optional
      uppercase
      :maxlength="15"
      placeholder="15 characters"
      :validate="validators.gstin(form.stateCode)"
      :server-error="errors.gstin"
      hint="Needed before you can issue invoices"
    />
    <SjField
      v-model="form.llpin"
      label="LLPIN"
      optional
      uppercase
      :maxlength="8"
      placeholder="AAB-1234"
      :validate="validators.llpin"
      :server-error="errors.llpin"
    />
    <SjField
      v-model="form.registeredAddress"
      label="Registered address"
      optional
      multiline
      :maxlength="500"
      autocomplete="street-address"
      :server-error="errors.registeredAddress"
      hint="Needed before you can issue invoices"
    />
  </div>
</template>
