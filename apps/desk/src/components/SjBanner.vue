<script setup lang="ts">
import { onMounted } from 'vue';
import { useSettings } from '../composables/settings';

/** App-wide warnings (e.g. GST not yet confirmed by the CA) until they are fixed. */
const { state, load } = useSettings();
onMounted(() => load().catch(() => undefined));
</script>

<template>
  <div v-if="state.warnings.length" class="sj-banner" role="status">
    <div class="container-xl d-flex gap-2 align-items-start py-2">
      <span aria-hidden="true">⚠</span>
      <div class="flex-fill">
        <div v-for="w in state.warnings" :key="w">{{ w }}</div>
      </div>
      <RouterLink to="/settings/rules" class="sj-banner__link">Review</RouterLink>
    </div>
  </div>
</template>

<style scoped>
.sj-banner {
  background: #fff6dc;
  color: #5c3d00;
  border-bottom: 1px solid #f0d48a;
  font-size: 0.875rem;
}
.sj-banner__link {
  color: #5c3d00;
  font-weight: 700;
  white-space: nowrap;
  min-height: 32px;
  display: inline-flex;
  align-items: center;
}
</style>
