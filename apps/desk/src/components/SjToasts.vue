<script setup lang="ts">
import { useToast } from '../composables/toast';

const { toasts, dismiss } = useToast();

async function undo(id: number, fn: () => void | Promise<void>) {
  dismiss(id);
  await fn();
}
</script>

<template>
  <div class="sj-toasts" role="status" aria-live="polite">
    <TransitionGroup name="sj-toast">
      <div v-for="t in toasts" :key="t.id" class="sj-toast" :class="`sj-toast--${t.tone}`">
        <span class="sj-toast__icon" aria-hidden="true">{{
          t.tone === 'success' ? '✓' : t.tone === 'error' ? '!' : 'i'
        }}</span>
        <span class="sj-toast__msg">{{ t.message }}</span>
        <button v-if="t.undo" type="button" class="sj-toast__undo" @click="undo(t.id, t.undo)">
          Undo
        </button>
        <button type="button" class="sj-toast__close" aria-label="Dismiss" @click="dismiss(t.id)">
          ×
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>
