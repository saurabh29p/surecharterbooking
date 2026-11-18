<script setup lang="ts">
import { PARTNER_STATUS_LABELS, type PartnerStatus } from '@shubhjets/shared';

/** Pipeline stage in colour AND text AND icon (UX.md §5). */
defineProps<{ status: PartnerStatus }>();
const ICONS: Record<PartnerStatus, string> = {
  IMPORTED: '○',
  CONTACTED: '◔',
  CALL_DONE: '◑',
  ACTIVE: '★',
  INACTIVE: '–',
};
</script>

<template>
  <span class="sj-badge" :class="`sj-pstatus--${status.toLowerCase()}`">
    <span aria-hidden="true">{{ ICONS[status] }}</span> {{ PARTNER_STATUS_LABELS[status] }}
  </span>
</template>

<style scoped>
.sj-pstatus--imported {
  background: #eceef2;
  color: #3d4250;
}
.sj-pstatus--contacted {
  background: #e3ecfb;
  color: #1d3f7a;
}
.sj-pstatus--call_done {
  background: #ece3fb;
  color: #4b2a85;
}
.sj-pstatus--active {
  background: #f3e6c4;
  color: #5c4415;
}
.sj-pstatus--inactive {
  background: #eceef2;
  color: #5b6170;
}
</style>
