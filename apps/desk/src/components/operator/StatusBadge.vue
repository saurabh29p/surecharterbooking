<script setup lang="ts">
import { OPERATOR_STATUS_LABELS, type OperatorStatus } from '@shubhjets/shared';

/** Status in colour AND text AND icon, never colour alone (UX.md §5). */
defineProps<{ status: OperatorStatus }>();
const ICONS: Record<OperatorStatus, string> = {
  VERIFIED: '✓',
  EXPIRING_SOON: '⏳',
  FOUND: '○',
  BLOCKED: '⛔',
};
</script>

<template>
  <span class="sj-badge" :class="`sj-status--${status.toLowerCase()}`">
    <span aria-hidden="true">{{ ICONS[status] }}</span> {{ OPERATOR_STATUS_LABELS[status] }}
  </span>
</template>

<style scoped>
.sj-status--verified {
  background: #dcf2e4;
  color: #145c36;
}
.sj-status--expiring_soon {
  background: #fdecc8;
  color: #6b4a00;
}
.sj-status--found {
  background: #eceef2;
  color: #3d4250;
}
.sj-status--blocked {
  background: #fde2df;
  color: #8a1c12;
}
</style>
