<script setup lang="ts">
import { onMounted } from 'vue';
import { useSettings } from '../composables/settings';

/**
 * App-wide warnings (e.g. GST not yet confirmed by the CA) until they are fixed.
 * One compact line on every screen; tap to read them all.
 */
const { state, load } = useSettings();
onMounted(() => load().catch(() => undefined));
</script>

<template>
  <div v-if="state.warnings.length" class="sj-banner" role="status">
    <div class="container-xl d-flex gap-2 align-items-center py-1">
      <details class="flex-fill">
        <summary>
          <span aria-hidden="true">⚠</span>
          {{
            state.warnings.length === 1
              ? state.warnings[0]!.split('.')[0]
              : `${state.warnings.length} settings need attention before quotes go out`
          }}
        </summary>
        <ul class="mb-1 ps-3">
          <li v-for="w in state.warnings" :key="w">{{ w }}</li>
        </ul>
      </details>
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
summary {
  min-height: 36px;
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  list-style: none;
}
summary::-webkit-details-marker {
  display: none;
}
summary::after {
  content: '▾';
  margin-left: 2px;
}
details[open] summary::after {
  content: '▴';
}
.sj-banner__link {
  color: #5c3d00;
  font-weight: 700;
  white-space: nowrap;
  min-height: 36px;
  display: inline-flex;
  align-items: center;
}
</style>
