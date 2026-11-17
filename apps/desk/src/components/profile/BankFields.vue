<script setup lang="ts">
import { validators, type ProfileFormState } from '../../composables/profileForm';
import SjField from '../SjField.vue';

const props = defineProps<{ errors: Record<string, string> }>();
const form = defineModel<ProfileFormState>('form', { required: true });
const e = (k: string) => props.errors[`bankDetails.${k}`] ?? null;
</script>

<template>
  <div>
    <p class="text-secondary small mb-3">
      Printed on your quotes and invoices so clients can pay you. Stored encrypted; shown masked
      everywhere else.
    </p>
    <SjField
      v-model="form.bank.accountName"
      label="Account name"
      autocomplete="off"
      :server-error="e('accountName')"
    />
    <SjField
      v-model="form.bank.accountNumber"
      label="Account number"
      inputmode="numeric"
      autocomplete="off"
      :validate="validators.accountNumber"
      :server-error="e('accountNumber')"
    />
    <SjField
      v-model="form.bank.ifsc"
      label="IFSC"
      uppercase
      :maxlength="11"
      autocomplete="off"
      placeholder="HDFC0001234"
      :validate="validators.ifsc"
      :server-error="e('ifsc')"
    />
    <SjField v-model="form.bank.bankName" label="Bank name" :server-error="e('bankName')" />
    <SjField v-model="form.bank.branch" label="Branch" optional :server-error="e('branch')" />
  </div>
</template>
