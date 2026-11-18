<script setup lang="ts">
import type { CommissionDefault } from '@shubhjets/shared';
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api, ApiError } from '../../api/client';
import SjButton from '../../components/SjButton.vue';
import PartnerFields from '../../components/partner/PartnerFields.vue';
import { newPartnerForm, partnerBody } from '../../composables/partnerForm';
import { useSettings } from '../../composables/settings';
import { useToast } from '../../composables/toast';

const router = useRouter();
const toast = useToast();
const settings = useSettings();
const form = ref(newPartnerForm());
const errors = ref<Record<string, string>>({});
const saving = ref(false);

onMounted(async () => {
  try {
    await settings.load();
    const def = settings.row('commission.default')?.value as CommissionDefault | undefined;
    if (def) form.value = newPartnerForm(null, def);
  } catch {
    // keep the built-in default (20% of margin)
  }
});

async function save() {
  errors.value = {};
  let body;
  try {
    body = partnerBody(form.value);
  } catch (e) {
    errors.value = (e as { fields: Record<string, string> }).fields;
    return;
  }
  saving.value = true;
  try {
    const res = await api<{ id: string; duplicates: { firm: string; matchedOn: string[] }[] }>(
      '/partners',
      { method: 'POST', json: body },
    );
    if (res.duplicates.length) {
      toast.show({
        tone: 'info',
        message: `Added. Possible duplicate of ${res.duplicates.map((d) => `${d.firm} (same ${d.matchedOn.join(', ')})`).join('; ')}`,
      });
    } else {
      toast.success('Partner added');
    }
    await router.replace(`/partners/${res.id}`);
  } catch (e) {
    if (e instanceof ApiError && Object.keys(e.fields).length) {
      errors.value = e.fields;
      toast.error('Please fix the highlighted fields');
    } else toast.error(e instanceof ApiError ? e.message : "Couldn't add the partner");
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div>
    <RouterLink to="/partners" class="d-inline-block mb-2">‹ Partners</RouterLink>
    <h1 class="page-title mb-3">Add partner</h1>
    <form novalidate @submit.prevent="save">
      <div class="card mb-3">
        <div class="card-body"><PartnerFields v-model:form="form" :errors="errors" /></div>
      </div>
      <div class="sj-actionbar">
        <SjButton
          type="submit"
          block
          :loading="saving"
          loading-label="Adding…"
          :disabled-reason="form.firm.trim() ? null : 'Enter the firm name first'"
        >
          Add partner
        </SjButton>
      </div>
    </form>
  </div>
</template>
