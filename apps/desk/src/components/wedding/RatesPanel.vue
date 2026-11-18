<script setup lang="ts">
import type { WeddingDetail } from '../../composables/weddings';

/** Placeholder until the rates screens land in the next commit. */
defineProps<{ wedding: WeddingDetail }>();
defineEmits<{ changed: [] }>();
</script>

<template>
  <section class="card card-body text-center text-secondary">
    <p class="mb-0">Asking operators for rates and comparing replies arrives in the next commit.</p>
  </section>
</template>
