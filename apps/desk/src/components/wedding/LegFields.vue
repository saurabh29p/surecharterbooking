<script setup lang="ts">
import { AIRCRAFT_CATEGORIES, CATEGORY_LABELS } from '@shubhjets/shared';
import { useId } from 'vue';
import { useAirports } from '../../composables/airports';
import type { LegDraft } from '../../composables/weddings';

/** One leg's inputs: route, date, departure window (IST), passengers and aircraft size. */
const props = defineProps<{ errors?: Record<string, string>; prefix?: string }>();
const leg = defineModel<LegDraft>('leg', { required: true });
const { airports } = useAirports();
const id = useId();
const err = (k: string) => props.errors?.[`${props.prefix ?? ''}${k}`] ?? null;
</script>

<template>
  <div class="sj-leg">
    <div class="sj-leg__route">
      <div>
        <label class="form-label small" :for="`${id}-from`">From</label>
        <select
          :id="`${id}-from`"
          v-model="leg.from"
          class="form-select"
          :class="{ 'is-invalid': err('from') }"
        >
          <option v-for="a in airports" :key="a.iata" :value="a.iata">
            {{ a.city }} ({{ a.iata }})
          </option>
        </select>
      </div>
      <span class="sj-leg__arrow" aria-hidden="true">→</span>
      <div>
        <label class="form-label small" :for="`${id}-to`">To</label>
        <select
          :id="`${id}-to`"
          v-model="leg.to"
          class="form-select"
          :class="{ 'is-invalid': err('to') }"
        >
          <option value="" disabled>Choose</option>
          <option v-for="a in airports" :key="a.iata" :value="a.iata">
            {{ a.city }} ({{ a.iata }})
          </option>
        </select>
      </div>
    </div>
    <div v-if="err('from') || err('to')" class="invalid-feedback d-block">
      {{ err('to') ?? err('from') }}
    </div>
    <div class="sj-leg__grid mt-2">
      <div>
        <label class="form-label small" :for="`${id}-date`">Date</label>
        <input
          :id="`${id}-date`"
          v-model="leg.date"
          type="date"
          class="form-control"
          :class="{ 'is-invalid': err('date') }"
        />
      </div>
      <div>
        <label class="form-label small" :for="`${id}-pax`">Passengers</label>
        <input
          :id="`${id}-pax`"
          v-model="leg.pax"
          type="number"
          inputmode="numeric"
          min="1"
          class="form-control"
          :class="{ 'is-invalid': err('pax') }"
        />
      </div>
      <div>
        <label class="form-label small" :for="`${id}-wf`">Leave after</label>
        <input :id="`${id}-wf`" v-model="leg.windowFrom" type="time" class="form-control" />
      </div>
      <div>
        <label class="form-label small" :for="`${id}-wt`">Leave by</label>
        <input
          :id="`${id}-wt`"
          v-model="leg.windowTo"
          type="time"
          class="form-control"
          :class="{ 'is-invalid': err('windowTo') }"
        />
      </div>
    </div>
    <div v-for="k in ['date', 'pax', 'windowTo']" :key="k">
      <div v-if="err(k)" class="invalid-feedback d-block">{{ err(k) }}</div>
    </div>
    <div class="mt-2">
      <label class="form-label small" :for="`${id}-cat`">Aircraft size</label>
      <select :id="`${id}-cat`" v-model="leg.category" class="form-select">
        <option value="">Any (let operators suggest)</option>
        <option v-for="c in AIRCRAFT_CATEGORIES" :key="c" :value="c">
          {{ CATEGORY_LABELS[c] }} or larger
        </option>
      </select>
    </div>
  </div>
</template>

<style scoped>
.sj-leg__route {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  gap: 6px;
  align-items: end;
}
.sj-leg__arrow {
  padding-bottom: 10px;
  font-weight: 700;
  color: var(--sj-gold-dark);
}
.sj-leg__grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 8px;
}
</style>
