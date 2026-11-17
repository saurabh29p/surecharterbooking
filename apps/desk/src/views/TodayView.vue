<script setup lang="ts">
import { formatDate, formatINR, formatINRShort } from '@shubhjets/shared';

const today = formatDate(new Date());
const target = formatINR(20_00_000_00);
const sample = formatINRShort(24_00_000_00);
</script>

<template>
  <section aria-labelledby="today-title">
    <h1 id="today-title" class="page-title mb-1">Today</h1>
    <p class="text-secondary mb-4">{{ today }}</p>
    <div class="empty">
      <p class="empty-title">The desk is being built</p>
      <p class="empty-subtitle text-secondary">
        This screen will list exactly what to do next. Monthly margin target: {{ target }} (compact
        format example: {{ sample }}).
      </p>
    </div>
  </section>
</template>
