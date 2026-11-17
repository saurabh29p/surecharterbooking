<script setup lang="ts">
import { computed, ref, useId } from 'vue';

/**
 * A labelled input with inline validation (UX.md §2): the error appears once the field is left,
 * or when the parent passes a server error. The user's input is never cleared.
 */
const props = withDefaults(
  defineProps<{
    label: string;
    modelValue: string;
    type?: string;
    inputmode?: 'text' | 'numeric' | 'tel' | 'email' | 'decimal';
    autocomplete?: string;
    placeholder?: string;
    hint?: string;
    /** Client-side check: returns a message or null. */
    validate?: (value: string) => string | null;
    /** Error from the server for this field. */
    serverError?: string | null;
    multiline?: boolean;
    uppercase?: boolean;
    optional?: boolean;
    maxlength?: number;
  }>(),
  {
    type: 'text',
    inputmode: undefined,
    autocomplete: undefined,
    placeholder: undefined,
    hint: undefined,
    validate: undefined,
    serverError: null,
    multiline: false,
    uppercase: false,
    optional: false,
    maxlength: undefined,
  },
);
const emit = defineEmits<{ 'update:modelValue': [string] }>();
const id = useId();
const touched = ref(false);

const clientError = computed(() =>
  touched.value && props.validate && props.modelValue ? props.validate(props.modelValue) : null,
);
const error = computed(() => clientError.value ?? props.serverError ?? null);

function onInput(e: Event) {
  const v = (e.target as HTMLInputElement).value;
  emit('update:modelValue', props.uppercase ? v.toUpperCase() : v);
}

defineExpose({
  /** Mark as touched (e.g. on submit) and return the client-side error, if any. */
  check(): string | null {
    touched.value = true;
    return props.validate && props.modelValue ? props.validate(props.modelValue) : null;
  },
});
</script>

<template>
  <div class="sj-field mb-3">
    <label :for="id" class="form-label">
      {{ label }}
      <span v-if="optional" class="text-secondary fw-normal">(optional)</span>
    </label>
    <textarea
      v-if="multiline"
      :id="id"
      class="form-control"
      :class="{ 'is-invalid': error }"
      rows="3"
      :value="modelValue"
      :placeholder="placeholder"
      :maxlength="maxlength"
      :aria-invalid="error ? 'true' : undefined"
      :aria-describedby="`${id}-msg`"
      @input="onInput"
      @blur="touched = true"
    />
    <input
      v-else
      :id="id"
      class="form-control"
      :class="{ 'is-invalid': error }"
      :type="type"
      :inputmode="inputmode"
      :autocomplete="autocomplete"
      :placeholder="placeholder"
      :maxlength="maxlength"
      :value="modelValue"
      :autocapitalize="uppercase ? 'characters' : undefined"
      :aria-invalid="error ? 'true' : undefined"
      :aria-describedby="`${id}-msg`"
      @input="onInput"
      @blur="touched = true"
    />
    <div :id="`${id}-msg`" aria-live="polite">
      <div v-if="error" class="invalid-feedback d-block">{{ error }}</div>
      <div v-else-if="hint" class="form-hint">{{ hint }}</div>
    </div>
  </div>
</template>
