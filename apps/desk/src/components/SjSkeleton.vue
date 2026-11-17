<script setup lang="ts">
/** Placeholder blocks that keep the layout stable while data loads (UX.md §2). */
withDefaults(defineProps<{ lines?: number; height?: string }>(), { lines: 3, height: '1rem' });
</script>

<template>
  <div class="sj-skeleton" aria-hidden="true">
    <div
      v-for="n in lines"
      :key="n"
      class="sj-skeleton__line"
      :style="{ height, width: n === lines ? '60%' : '100%' }"
    />
  </div>
</template>
