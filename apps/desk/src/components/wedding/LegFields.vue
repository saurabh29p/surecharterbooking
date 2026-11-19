<script setup lang="ts">
import {
  AIRCRAFT_CATEGORIES,
  CATEGORY_LABELS,
  HELI_SERVICE_LABELS,
  HELI_SERVICES,
  isHelicopter,
} from '@shubhjets/shared';
import { computed, useId } from 'vue';
import { useAirports } from '../../composables/airports';
import type { LegDraft } from '../../composables/weddings';

/**
 * One leg's inputs: route, date, departure window (IST), passengers and aircraft size.
 * Helicopter legs add the service and an optional venue or helipad at either end; the airport
 * then stays as the nearest reference for the operator.
 */
const props = defineProps<{ errors?: Record<string, string>; prefix?: string }>();
const leg = defineModel<LegDraft>('leg', { required: true });
const { airports } = useAirports();
const id = useId();
const err = (k: string) => props.errors?.[`${props.prefix ?? ''}${k}`] ?? null;
const heli = computed(() => !!leg.value.category && isHelicopter(leg.value.category));
const JETS = AIRCRAFT_CATEGORIES.filter((c) => !isHelicopter(c));
const HELIS = AIRCRAFT_CATEGORIES.filter((c) => isHelicopter(c));
const ends = [
  { key: 'fromSite', label: 'Starts at a venue or helipad' },
  { key: 'toSite', label: 'Lands at a venue or helipad' },
] as const;
</script>

<template>
  <div class="sj-leg">
    <div class="sj-leg__route">
      <div>
        <label class="form-label small" :for="`${id}-from`">{{
          heli ? 'From (nearest airport)' : 'From'
        }}</label>
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
        <label class="form-label small" :for="`${id}-to`">{{
          heli ? 'To (nearest airport)' : 'To'
        }}</label>
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
        <option value="">Any jet (let operators suggest)</option>
        <optgroup label="Jets">
          <option v-for="c in JETS" :key="c" :value="c">{{ CATEGORY_LABELS[c] }} or larger</option>
        </optgroup>
        <optgroup label="Helicopters">
          <option v-for="c in HELIS" :key="c" :value="c">{{ CATEGORY_LABELS[c] }}</option>
        </optgroup>
      </select>
    </div>
    <template v-if="heli">
      <div class="mt-2">
        <label class="form-label small" :for="`${id}-svc`">What the helicopter is for</label>
        <select
          :id="`${id}-svc`"
          v-model="leg.serviceType"
          class="form-select"
          :class="{ 'is-invalid': err('serviceType') }"
        >
          <option value="">Choose</option>
          <option v-for="s in HELI_SERVICES" :key="s" :value="s">
            {{ HELI_SERVICE_LABELS[s] }}
          </option>
        </select>
        <div v-if="err('serviceType')" class="invalid-feedback d-block">
          {{ err('serviceType') }}
        </div>
      </div>
      <div v-for="e in ends" :key="e.key" class="sj-leg__site mt-2">
        <label class="form-check mb-0">
          <input v-model="leg[e.key].on" type="checkbox" class="form-check-input" />
          <span class="form-check-label">{{ e.label }}</span>
        </label>
        <div v-if="leg[e.key].on" class="sj-leg__grid mt-2">
          <div class="sj-leg__wide">
            <label class="form-label small" :for="`${id}-${e.key}-name`"
              >Venue or helipad name</label
            >
            <input
              :id="`${id}-${e.key}-name`"
              v-model="leg[e.key].name"
              class="form-control"
              placeholder="e.g. Palace lawn helipad"
              :class="{ 'is-invalid': err(`${e.key}.name`) }"
            />
            <div v-if="err(`${e.key}.name`)" class="invalid-feedback d-block">
              {{ err(`${e.key}.name`) }}
            </div>
          </div>
          <div>
            <label class="form-label small" :for="`${id}-${e.key}-city`">City</label>
            <input :id="`${id}-${e.key}-city`" v-model="leg[e.key].city" class="form-control" />
          </div>
          <div>
            <label class="form-label small" :for="`${id}-${e.key}-map`">Map link</label>
            <input
              :id="`${id}-${e.key}-map`"
              v-model="leg[e.key].mapUrl"
              type="url"
              inputmode="url"
              class="form-control"
              placeholder="https://maps…"
              :class="{ 'is-invalid': err(`${e.key}.mapUrl`) }"
            />
          </div>
          <div v-if="err(`${e.key}.mapUrl`)" class="invalid-feedback d-block sj-leg__wide">
            {{ err(`${e.key}.mapUrl`) }}
          </div>
        </div>
      </div>
      <p class="small text-secondary mt-2 mb-0">
        The client sees one price for this service. Permissions are ticked on the wedding page.
      </p>
    </template>
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
.sj-leg__wide {
  grid-column: 1 / -1;
}
.sj-leg__site {
  border-top: 1px solid var(--tblr-border-color);
  padding-top: 8px;
}
</style>
