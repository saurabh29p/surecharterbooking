<script setup lang="ts">
import { computed, useId } from 'vue';
import { useToast } from '../composables/toast';

/**
 * UX.md §1: default, hover, pressed, focus, disabled (with a reason) and loading states.
 * Loading keeps the button's width, shows a spinner and a new label, and blocks double clicks.
 */
const props = withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
    type?: 'button' | 'submit';
    loading?: boolean;
    loadingLabel?: string;
    /** When set, the button is disabled and this explains why (on hover, and on tap via a toast). */
    disabledReason?: string | null;
    block?: boolean;
    size?: 'md' | 'sm';
  }>(),
  {
    variant: 'primary',
    type: 'button',
    loading: false,
    loadingLabel: undefined,
    disabledReason: null,
    block: false,
    size: 'md',
  },
);
const emit = defineEmits<{ click: [MouseEvent] }>();
const toast = useToast();
const reasonId = useId();

const disabled = computed(() => !!props.disabledReason);
const busy = computed(() => props.loading);

function onClick(e: MouseEvent) {
  if (busy.value) return e.preventDefault();
  if (disabled.value) {
    e.preventDefault();
    toast.show({ message: props.disabledReason!, tone: 'info' });
    return;
  }
  emit('click', e);
}
</script>

<template>
  <button
    :type="type"
    class="sj-btn"
    :class="[
      `sj-btn--${variant}`,
      `sj-btn--${size}`,
      { 'sj-btn--block': block, 'is-disabled': disabled, 'is-loading': busy },
    ]"
    :aria-disabled="disabled || busy ? 'true' : undefined"
    :aria-busy="busy ? 'true' : undefined"
    :aria-describedby="disabled ? reasonId : undefined"
    :title="disabledReason ?? undefined"
    @click="onClick"
  >
    <span v-if="busy" class="sj-spinner" aria-hidden="true" />
    <span class="sj-btn__label">
      <template v-if="busy && loadingLabel">{{ loadingLabel }}</template>
      <slot v-else />
    </span>
    <span v-if="disabled" :id="reasonId" class="visually-hidden">{{ disabledReason }}</span>
  </button>
</template>
