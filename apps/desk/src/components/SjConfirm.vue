<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import SjButton from './SjButton.vue';

/**
 * Only for truly destructive or irreversible actions (UX.md §2). A bottom sheet on phones,
 * a centred dialog on desktop. Says exactly what will happen.
 */
const props = defineProps<{
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  busy?: boolean;
}>();
const emit = defineEmits<{ confirm: []; cancel: [] }>();
const cancelBtn = ref<HTMLElement | null>(null);

watch(
  () => props.open,
  async (open) => {
    if (open) {
      await nextTick();
      cancelBtn.value?.querySelector('button')?.focus();
    }
  },
);
</script>

<template>
  <Transition name="sj-sheet">
    <div
      v-if="open"
      class="sj-sheet-backdrop"
      @click.self="emit('cancel')"
      @keydown.esc="emit('cancel')"
    >
      <div class="sj-sheet" role="alertdialog" aria-modal="true" :aria-label="title">
        <h2 class="h3 mb-2">{{ title }}</h2>
        <p class="text-secondary mb-4">{{ body }}</p>
        <div class="d-flex gap-2 justify-content-end flex-wrap">
          <span ref="cancelBtn"
            ><SjButton variant="secondary" @click="emit('cancel')">Cancel</SjButton></span
          >
          <SjButton variant="danger" :loading="busy" @click="emit('confirm')">{{
            confirmLabel
          }}</SjButton>
        </div>
      </div>
    </div>
  </Transition>
</template>
