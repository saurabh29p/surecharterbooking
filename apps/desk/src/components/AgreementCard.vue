<script setup lang="ts">
import { AGREEMENT_LABELS, type AgreementKind } from '@shubhjets/shared';
import { computed, onMounted, ref } from 'vue';
import { api, ApiError } from '../api/client';
import type { DocumentRow } from '../composables/documents';
import { useToast } from '../composables/toast';
import DocumentCard from './DocumentCard.vue';

/** The agreement with one operator or partner: make it from the template, share it, upload the signed copy. */
const props = defineProps<{
  kind: Extract<AgreementKind, 'OPERATOR_AGREEMENT' | 'REFERRAL_AGREEMENT'>;
  subjectId: string;
  subjectName: string;
}>();
const emit = defineEmits<{ changed: [] }>();
const toast = useToast();

const docs = ref<DocumentRow[] | null>(null);
const making = ref(false);
const param = computed(() => (props.kind === 'OPERATOR_AGREEMENT' ? 'operatorId' : 'partnerId'));
const doc = computed(() => docs.value?.find((d) => d.type === props.kind) ?? null);

async function load() {
  try {
    docs.value = await api<DocumentRow[]>(`/documents?${param.value}=${props.subjectId}`);
  } catch {
    docs.value = [];
  }
}
onMounted(load);

async function make() {
  making.value = true;
  try {
    const r = await api<{ version: number; missing: string[]; draft: boolean }>('/agreements', {
      method: 'POST',
      json: { kind: props.kind, [param.value]: props.subjectId },
    });
    toast.success(
      r.missing.length
        ? `Version ${r.version} made. Missing: ${r.missing.join(', ')}`
        : `Version ${r.version} made${r.draft ? ' (draft)' : ''}`,
    );
    await load();
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : "Couldn't make the agreement");
  } finally {
    making.value = false;
  }
}
async function changed() {
  await load();
  emit('changed');
}
</script>

<template>
  <DocumentCard
    :title="AGREEMENT_LABELS[kind]"
    :doc="doc"
    :empty-text="
      kind === 'OPERATOR_AGREEMENT'
        ? `Not made yet. Filled in from ${subjectName}'s details, with their cancellation charges as Annexure A.`
        : `Not made yet. Filled in from ${subjectName}'s details and commission.`
    "
    :make-label="doc ? 'Make a new version' : 'Make agreement'"
    :making="making"
    signable
    :share-text="`${AGREEMENT_LABELS[kind]} with ${subjectName}. Please review, sign and return.`"
    @make="make"
    @changed="changed"
  />
</template>
