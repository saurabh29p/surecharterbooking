<script setup lang="ts">
import { formatBps, formatINR, parsePercent, parseRupees, priceLine } from '@shubhjets/shared';
import { computed, ref } from 'vue';
import type { QuoteJetLine } from '../../composables/quotes';

/**
 * One jet on one leg: the operator's cost (internal), our markup as % or ₹, and the client price.
 * The price updates as you type (shared maths); the parent saves after a short pause.
 */
const props = defineProps<{ line: QuoteJetLine; editable: boolean }>();
const emit = defineEmits<{ change: [{ markupType: 'PERCENT' | 'FIXED'; markupValue: number }] }>();

const type = ref<'PERCENT' | 'FIXED'>(props.line.markupType);
const text = ref('');
const fromLine = () => {
  type.value = props.line.markupType;
  text.value =
    props.line.markupType === 'PERCENT'
      ? String(props.line.markupValue / 100)
      : formatINR(props.line.markupValue, { symbol: false, paise: 'never' });
};
fromLine();

const parsed = computed<number | null>(() => {
  try {
    return type.value === 'PERCENT'
      ? parsePercent(text.value || '0')
      : parseRupees(text.value || '0');
  } catch {
    return null;
  }
});
const preview = computed(() =>
  parsed.value === null
    ? null
    : priceLine(
        type.value === 'PERCENT'
          ? { cost: props.line.cost, markupType: 'PERCENT', markupBps: parsed.value }
          : { cost: props.line.cost, markupType: 'FIXED', markupAmount: parsed.value },
      ),
);

function changed() {
  if (parsed.value !== null) emit('change', { markupType: type.value, markupValue: parsed.value });
}
function setType(t: 'PERCENT' | 'FIXED') {
  if (t === type.value) return;
  // Keep the same rupee margin when switching, so nothing jumps.
  const margin = preview.value?.margin ?? 0;
  type.value = t;
  text.value =
    t === 'FIXED'
      ? formatINR(margin, { symbol: false, paise: 'never' })
      : String(Math.round((margin / Math.max(props.line.cost, 1)) * 10_000) / 100);
  changed();
}
const money = (p: number) => formatINR(p, { paise: 'never' });
</script>

<template>
  <div class="sj-jet">
    <div class="d-flex justify-content-between gap-2">
      <div class="min-w-0">
        <div class="fw-bold">{{ line.operator.name }}</div>
        <div class="small text-secondary">
          {{ line.aircraft }}<template v-if="line.seats"> · {{ line.seats }} seats</template>
        </div>
      </div>
      <div class="text-end">
        <div class="fw-bold sj-price">{{ money(preview?.sell ?? line.sell) }}</div>
        <div class="small text-secondary">client price</div>
      </div>
    </div>
    <div v-if="!line.quotable.ok || line.rateExpired" class="small text-danger fw-bold mt-1">
      ⛔
      {{
        !line.quotable.ok
          ? `Can't be quoted: ${line.quotable.reason}`
          : 'Rate expired: ask them to confirm it'
      }}
    </div>

    <div class="sj-jet__calc mt-2">
      <div class="c-net">
        <div class="sj-k">Net (internal)</div>
        <div>{{ money(line.cost) }}</div>
      </div>
      <div class="c-mk">
        <div :id="`mk-${line.id}`" class="sj-k">Markup</div>
        <div v-if="editable" class="d-flex gap-1">
          <div class="sj-seg" role="group" :aria-labelledby="`mk-${line.id}`">
            <button
              type="button"
              :class="{ on: type === 'PERCENT' }"
              :aria-pressed="type === 'PERCENT'"
              @click="setType('PERCENT')"
            >
              %
            </button>
            <button
              type="button"
              :class="{ on: type === 'FIXED' }"
              :aria-pressed="type === 'FIXED'"
              @click="setType('FIXED')"
            >
              ₹
            </button>
          </div>
          <input
            v-model="text"
            class="form-control form-control-sm sj-jet__input"
            :class="{ 'is-invalid': parsed === null }"
            inputmode="decimal"
            :aria-label="`Markup for ${line.operator.name} (${type === 'PERCENT' ? 'percent' : 'rupees'})`"
            @input="changed"
          />
        </div>
        <div v-else>
          {{
            line.markupType === 'PERCENT' ? formatBps(line.markupValue) : money(line.markupValue)
          }}
        </div>
      </div>
      <div class="c-margin text-end">
        <div class="sj-k">Margin</div>
        <div
          :class="
            (preview?.margin ?? line.margin) <= 0 ? 'text-danger fw-bold' : 'text-success fw-bold'
          "
        >
          {{ money(preview?.margin ?? line.margin) }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sj-jet {
  border-top: 1px dashed #e3e5ea;
  padding-top: 10px;
  margin-top: 10px;
}
.sj-jet:first-of-type {
  border-top: 0;
  padding-top: 0;
  margin-top: 6px;
}
.sj-price {
  font-size: 1.05rem;
}
.sj-jet__calc {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-areas:
    'net margin'
    'mk mk';
  gap: 6px 8px;
  align-items: end;
  background: #f6f7f9;
  border-radius: 10px;
  padding: 8px 10px;
  font-size: 0.875rem;
}
.sj-k {
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--tblr-secondary);
  font-weight: 600;
}
.c-net {
  grid-area: net;
}
.c-margin {
  grid-area: margin;
}
.c-mk {
  grid-area: mk;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border-top: 1px solid #e6e8ec;
  padding-top: 6px;
}
@media (min-width: 520px) {
  .sj-jet__calc {
    grid-template-columns: 1fr auto 1fr;
    grid-template-areas: 'net mk margin';
  }
  .c-mk {
    display: block;
    border-top: 0;
    padding-top: 0;
  }
}
.sj-jet__input {
  width: 96px;
  min-height: 36px;
  font-size: 16px;
}
.sj-seg {
  display: inline-flex;
  border: 1px solid #d6d9e0;
  border-radius: 8px;
  overflow: hidden;
}
.sj-seg button {
  border: 0;
  background: #fff;
  min-width: 34px;
  min-height: 36px;
  font-weight: 700;
  color: var(--tblr-secondary);
  transition:
    background-color var(--sj-fast),
    color var(--sj-fast);
}
.sj-seg button.on {
  background: var(--sj-ink, #1a1a22);
  color: #fff;
}
.sj-seg button:active {
  transform: scale(0.97);
}
.min-w-0 {
  min-width: 0;
}
</style>
