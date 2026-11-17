<script setup lang="ts">
import { financialYear } from '@shubhjets/shared';
import { validators, type ProfileFormState } from '../../composables/profileForm';
import SjField from '../SjField.vue';

defineProps<{ errors: Record<string, string> }>();
const form = defineModel<ProfileFormState>('form', { required: true });
const fy = financialYear(new Date());
</script>

<template>
  <div>
    <SjField
      v-model="form.signatoryName"
      label="Authorised signatory"
      optional
      autocomplete="name"
      hint="The person who signs agreements"
      :server-error="errors.signatoryName"
    />
    <SjField
      v-model="form.signatoryDesignation"
      label="Designation"
      optional
      placeholder="e.g. Designated Partner"
      :server-error="errors.signatoryDesignation"
    />
    <SjField
      v-model="form.arbitrationSeatCity"
      label="Arbitration seat city"
      optional
      placeholder="e.g. New Delhi"
      hint="Used in agreements for where disputes are settled"
      :server-error="errors.arbitrationSeatCity"
    />
    <SjField
      v-model="form.invoicePrefix"
      label="Invoice number prefix"
      uppercase
      :maxlength="10"
      :validate="validators.invoicePrefix"
      :server-error="errors.invoicePrefix"
      :hint="`Invoices will be numbered ${(form.invoicePrefix || 'SJ').toUpperCase()}/${fy}/0001, restarting each 1 April`"
    />
  </div>
</template>
