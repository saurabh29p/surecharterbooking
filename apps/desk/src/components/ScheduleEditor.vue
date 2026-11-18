<script setup lang="ts">
import { parsePercent, scheduleProblem, type CancellationSchedule } from '@shubhjets/shared';
import { computed, ref, watch } from 'vue';

/**
 * Edit cancellation charges as lines: "N days or more before departure → X% kept".
 * Emits the parsed schedule while every line is valid; shows what to fix otherwise.
 */
const props = defineProps<{ modelValue: CancellationSchedule; idPrefix: string }>();
const emit = defineEmits<{ 'update:modelValue': [CancellationSchedule]; valid: [boolean] }>();

interface Row {
  days: string;
  pct: string;
}
const toRows = (s: CancellationSchedule): Row[] =>
  [...s]
    .sort((a, b) => b.minDays - a.minDays)
    .map((t) => ({ days: String(t.minDays), pct: String(t.chargeBps / 100) }));
const rows = ref<Row[]>(toRows(props.modelValue));
watch(
  () => props.modelValue,
  (v) => {
    if (JSON.stringify(parsed.value) !== JSON.stringify(v)) rows.value = toRows(v);
  },
);

const parsed = computed<CancellationSchedule | null>(() => {
  try {
    return rows.value.map((r) => {
      const days = Number(r.days.trim());
      if (r.days.trim() === '' || !Number.isInteger(days)) throw new Error('days');
      return { minDays: days, chargeBps: parsePercent(r.pct) };
    });
  } catch {
    return null;
  }
});
const problem = computed(() =>
  parsed.value
    ? scheduleProblem(parsed.value)
    : 'Fill in the days and the percentage on every line',
);

watch([parsed, problem], ([p, err]) => {
  emit('valid', !err);
  if (p && !err) emit('update:modelValue', p);
});

function add() {
  const min = Math.min(...rows.value.map((r) => Number(r.days) || 0));
  rows.value.push({ days: String(Math.max(0, Math.floor(min / 2))), pct: '' });
}
function remove(i: number) {
  rows.value.splice(i, 1);
}
</script>

<template>
  <div>
    <div v-for="(r, i) in rows" :key="i" class="sj-tier">
      <label class="visually-hidden" :for="`${idPrefix}-d${i}`"
        >Days before departure, line {{ i + 1 }}</label
      >
      <input
        :id="`${idPrefix}-d${i}`"
        v-model="r.days"
        class="form-control sj-tier__num"
        inputmode="numeric"
        autocomplete="off"
      />
      <span class="sj-tier__txt">{{
        r.days === '0' ? 'days: up to departure' : 'days or more before'
      }}</span>
      <label class="visually-hidden" :for="`${idPrefix}-p${i}`"
        >Percentage kept, line {{ i + 1 }}</label
      >
      <div class="input-group sj-tier__pct">
        <input
          :id="`${idPrefix}-p${i}`"
          v-model="r.pct"
          class="form-control"
          inputmode="decimal"
          autocomplete="off"
        />
        <span class="input-group-text">%</span>
      </div>
      <button
        type="button"
        class="sj-tier__x"
        :disabled="rows.length <= 1"
        :aria-label="`Remove line ${i + 1}`"
        @click="remove(i)"
      >
        ×
      </button>
    </div>
    <div class="d-flex justify-content-between align-items-center mt-1 gap-2">
      <button type="button" class="sj-linkbtn" :disabled="rows.length >= 8" @click="add">
        + Add a line
      </button>
      <span v-if="problem" class="small text-danger text-end" role="alert">{{ problem }}</span>
    </div>
  </div>
</template>

<style scoped>
.sj-tier {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}
.sj-tier__num {
  width: 56px;
  flex: 0 0 56px;
  text-align: center;
  padding-left: 4px;
  padding-right: 4px;
}
.sj-tier__txt {
  flex: 1 1 auto;
  font-size: 0.75rem;
  color: var(--tblr-secondary);
  line-height: 1.2;
  min-width: 0;
}
.sj-tier__pct {
  width: 100px;
  flex: 0 0 100px;
  flex-wrap: nowrap;
}
.sj-tier__pct .form-control {
  padding-left: 6px;
  padding-right: 4px;
  text-align: right;
  min-width: 0;
}
.sj-tier__pct .input-group-text {
  padding: 0 8px;
}
.sj-tier__x {
  flex: none;
  width: 44px;
  height: 44px;
  border: 0;
  background: transparent;
  font-size: 1.25rem;
  color: var(--tblr-secondary);
  border-radius: 8px;
  transition: background-color var(--sj-fast);
}
.sj-tier__x:hover:not(:disabled) {
  background: #f1f2f5;
}
.sj-tier__x:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
.sj-linkbtn {
  border: 0;
  background: none;
  min-height: 44px;
  padding: 10px 0;
  color: var(--sj-gold-dark);
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 3px;
}
.sj-linkbtn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
