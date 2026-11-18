<script setup lang="ts">
import { WEDDING_STATUS_LABELS, type WeddingStatus } from '@shubhjets/shared';

/** Wedding stage in colour AND text AND icon (UX.md §5). */
defineProps<{ status: WeddingStatus }>();
const ICONS: Record<WeddingStatus, string> = {
  ENQUIRY: '✉',
  RATES_REQUESTED: '⇄',
  QUOTED: '₹',
  SIGNED_AND_PAID: '✓',
  FLYING: '✈',
  DONE: '★',
  LOST: '–',
};
</script>

<template>
  <span class="sj-badge" :class="`sj-wstatus--${status.toLowerCase()}`">
    <span aria-hidden="true">{{ ICONS[status] }}</span> {{ WEDDING_STATUS_LABELS[status] }}
  </span>
</template>

<style scoped>
.sj-wstatus--enquiry {
  background: #e3ecfb;
  color: #1d3f7a;
}
.sj-wstatus--rates_requested {
  background: #ece3fb;
  color: #4b2a85;
}
.sj-wstatus--quoted {
  background: #fdecc8;
  color: #6b4a00;
}
.sj-wstatus--signed_and_paid {
  background: #dcf2e4;
  color: #145c36;
}
.sj-wstatus--flying {
  background: #d7f0f5;
  color: #0b5566;
}
.sj-wstatus--done {
  background: #f3e6c4;
  color: #5c4415;
}
.sj-wstatus--lost {
  background: #eceef2;
  color: #5b6170;
}
</style>
