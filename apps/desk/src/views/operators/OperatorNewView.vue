<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { api, ApiError } from '../../api/client';
import SjButton from '../../components/SjButton.vue';
import OperatorFields from '../../components/operator/OperatorFields.vue';
import { newOperatorForm, operatorBody } from '../../composables/operatorForm';
import { useToast } from '../../composables/toast';

const router = useRouter();
const toast = useToast();
const form = newOperatorForm();
const errors = ref<Record<string, string>>({});
const saving = ref(false);

async function save() {
  errors.value = {};
  saving.value = true;
  try {
    const { id } = await api<{ id: string }>('/operators', {
      method: 'POST',
      json: operatorBody(form),
    });
    toast.success('Operator added. Next: upload and verify their documents.');
    await router.replace(`/operators/${id}`);
  } catch (e) {
    if (e instanceof ApiError && Object.keys(e.fields).length) {
      errors.value = e.fields;
      toast.error('Please fix the highlighted fields');
    } else toast.error(e instanceof ApiError ? e.message : "Couldn't add the operator");
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div>
    <RouterLink to="/operators" class="d-inline-block mb-2">‹ Operators</RouterLink>
    <h1 class="page-title mb-1">Add operator</h1>
    <p class="text-secondary">
      New operators start as not verified. You verify them after checking their NSOP permit and
      insurance.
    </p>
    <form novalidate @submit.prevent="save">
      <div class="card mb-3">
        <div class="card-body">
          <OperatorFields v-model:form="form" :errors="errors" />
        </div>
      </div>
      <div class="sj-actionbar">
        <SjButton
          type="submit"
          block
          :loading="saving"
          loading-label="Adding…"
          :disabled-reason="form.legalName.trim() ? null : 'Enter the legal name first'"
        >
          Add operator
        </SjButton>
      </div>
    </form>
  </div>
</template>
