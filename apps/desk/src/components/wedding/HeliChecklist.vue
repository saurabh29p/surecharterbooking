<script setup lang="ts">
import { heliChecklist, type HeliCheckKey } from '@shubhjets/shared';
import { computed, ref, watch } from 'vue';
import { api, ApiError } from '../../api/client';
import { useToast } from '../../composables/toast';
import type { LegRow } from '../../composables/weddings';

/**
 * A helicopter leg's permissions: landing site, local permission, flower-shower approval (only for a
 * flower shower) and the weather backup. Ticks show at once and roll back if saving fails. The
 * wedding can't be confirmed, and Today keeps reminding, until every item is ticked.
 */
const props = defineProps<{ leg: LegRow }>();
const emit = defineEmits<{ changed: [] }>();
const toast = useToast();
const checks = ref({ ...props.leg.heliChecks });
watch(
  () => props.leg.heliChecks,
  (c) => (checks.value = { ...c }),
);
const items = computed(() => heliChecklist(props.leg.serviceType, checks.value));
const left = computed(() => items.value.filter((i) => !i.done).length);

async function toggle(key: HeliCheckKey, done: boolean) {
  const before = checks.value[key];
  checks.value = { ...checks.value, [key]: { ...before, done } };
  try {
    await api(`/legs/${props.leg.id}/heli-checks`, { method: 'PUT', json: { key, done } });
    emit('changed');
  } catch (e) {
    checks.value = { ...checks.value, [key]: before ?? { done: false } };
    toast.error(e instanceof ApiError ? e.message : "Couldn't save that tick");
  }
}
</script>

<template>
  <div class="sj-heli" :class="{ 'sj-heli--done': !left }">
    <div class="small fw-bold mb-1">
      {{ left ? `Permissions: ${left} still open` : '✓ Permissions complete' }}
    </div>
    <label v-for="i in items" :key="i.key" class="form-check mb-1">
      <input
        type="checkbox"
        class="form-check-input"
        :checked="i.done"
        @change="toggle(i.key, ($event.target as HTMLInputElement).checked)"
      />
      <span class="form-check-label small">{{ i.label }}</span>
    </label>
  </div>
</template>

<style scoped>
.sj-heli {
  margin: 4px 0 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(212, 178, 106, 0.14);
}
.sj-heli--done {
  background: var(--tblr-bg-surface-secondary);
}
.form-check {
  min-height: 32px;
  display: flex;
  align-items: center;
  gap: 6px;
}
</style>
