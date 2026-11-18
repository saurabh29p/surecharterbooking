<script setup lang="ts">
import { AGREEMENT_LABELS, formatDate, type AgreementKind } from '@shubhjets/shared';
import { onMounted, ref } from 'vue';
import { api, ApiError } from '../../api/client';
import SjSkeleton from '../../components/SjSkeleton.vue';
import { useToast } from '../../composables/toast';

interface TemplateRow {
  kind: AgreementKind;
  name: string;
  version: number;
  lawyerApproved: boolean;
  approvedOn: string | null;
}

const toast = useToast();
const rows = ref<TemplateRow[] | null>(null);
onMounted(async () => {
  try {
    rows.value = await api<TemplateRow[]>('/templates');
  } catch (e) {
    rows.value = [];
    toast.error(e instanceof ApiError ? e.message : "Couldn't load the templates");
  }
});
const slug = (k: string) => k.toLowerCase().replace(/_/g, '-');
</script>

<template>
  <div>
    <RouterLink to="/settings" class="small">‹ Settings</RouterLink>
    <h1 class="page-title mt-1 mb-1">Agreement templates</h1>
    <p class="text-secondary small mb-3">
      Drafts in Indian contract format. Have your lawyer review each one; until you mark it
      approved, every agreement made from it says “DRAFT – NOT FOR SIGNATURE”.
    </p>
    <SjSkeleton v-if="!rows" :lines="3" height="4rem" />
    <div v-else class="d-grid gap-2">
      <RouterLink
        v-for="r in rows"
        :key="r.kind"
        :to="`/settings/templates/${slug(r.kind)}`"
        class="card sj-card-link"
      >
        <div class="card-body d-flex align-items-center gap-3">
          <div class="flex-fill">
            <div class="fw-bold">{{ AGREEMENT_LABELS[r.kind] }}</div>
            <div class="small">
              Version {{ r.version }} ·
              <span v-if="r.lawyerApproved" class="text-success"
                >✓ Lawyer-approved on {{ formatDate(r.approvedOn!) }}</span
              >
              <span v-else class="text-warning-emphasis">⚠ Draft: not lawyer-approved</span>
            </div>
          </div>
          <span aria-hidden="true" class="fs-2 text-secondary">›</span>
        </div>
      </RouterLink>
    </div>
  </div>
</template>
