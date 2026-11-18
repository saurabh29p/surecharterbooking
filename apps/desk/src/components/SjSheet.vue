<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';

/** Bottom sheet on phones, centred dialog on desktop, for quick inputs (UX.md §4). */
const props = defineProps<{ open: boolean; title: string }>();
const emit = defineEmits<{ close: [] }>();
const panel = ref<HTMLElement | null>(null);

watch(
  () => props.open,
  async (open) => {
    if (!open) return;
    await nextTick();
    panel.value?.querySelector<HTMLElement>('input, select, textarea, button')?.focus();
  },
);
</script>

<template>
  <Transition name="sj-sheet">
    <div
      v-if="open"
      class="sj-sheet-backdrop"
      @click.self="emit('close')"
      @keydown.esc="emit('close')"
    >
      <div
        ref="panel"
        class="sj-sheet sj-sheet--form"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
      >
        <div class="d-flex align-items-center justify-content-between mb-3">
          <h2 class="h3 mb-0">{{ title }}</h2>
          <button type="button" class="btn-close" aria-label="Close" @click="emit('close')" />
        </div>
        <slot />
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.sj-sheet--form {
  max-height: 90dvh;
  overflow-y: auto;
}
.btn-close {
  min-width: 44px;
  min-height: 44px;
}
</style>
