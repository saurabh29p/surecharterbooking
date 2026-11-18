<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import { useSettings } from '../composables/settings';

/**
 * App-wide warnings (e.g. GST not yet confirmed by the CA) until they are fixed.
 * One compact line on every screen; tap to read them all.
 *
 * The last warnings are remembered on this device, so the banner is there from the first paint
 * instead of pushing the page down when settings arrive (UX.md §2: no layout jumps).
 */
const KEY = 'sj-banner-warnings';
const { state, load } = useSettings();
function remembered(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
const early = remembered();
const warnings = computed(() => (state.loaded ? state.warnings : early));
watch(
  () => [state.loaded, state.warnings] as const,
  ([loaded, w]) => {
    if (!loaded) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(w));
    } catch {
      // Private mode or storage blocked: the banner just appears a moment later.
    }
  },
);
onMounted(() => load().catch(() => undefined));
</script>

<template>
  <div v-if="warnings.length" class="sj-banner" role="status">
    <div class="container-xl d-flex gap-2 align-items-center py-1">
      <details class="flex-fill">
        <summary>
          <span aria-hidden="true">⚠</span>
          {{
            warnings.length === 1
              ? warnings[0]!.split('.')[0]
              : `${warnings.length} settings need attention before quotes go out`
          }}
        </summary>
        <ul class="mb-1 ps-3">
          <li v-for="w in warnings" :key="w">{{ w }}</li>
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
