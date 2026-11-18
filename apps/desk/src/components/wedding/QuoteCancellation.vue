<script setup lang="ts">
import { formatBps } from '@shubhjets/shared';
import { computed } from 'vue';
import { compareSchedules, type QuoteDetail } from '../../composables/quotes';
import SjButton from '../SjButton.vue';

/**
 * Our cancellation charges next to each chosen operator's, window by window. A cell turns red
 * where we would keep less than the operator keeps from us; the fix raises ours only there.
 */
const props = defineProps<{ quote: QuoteDetail; editable: boolean; fixing?: boolean }>();
const emit = defineEmits<{ editOurs: []; editOperator: [rateResponseId: string]; applyFix: [] }>();

const c = computed(() => props.quote.cancellation);
const rows = computed(() =>
  compareSchedules(
    c.value.ours,
    c.value.operators.map((o) => o.schedule),
  ),
);
const pct = (bps: number | null) => (bps === null ? '—' : formatBps(bps));
const shortName = (name: string) => name.replace(/^Operator\s+/i, 'Op ');
</script>

<template>
  <section class="card mb-3" aria-labelledby="cancel-h">
    <div class="card-body">
      <div class="d-flex justify-content-between align-items-center mb-2 gap-2">
        <h2 id="cancel-h" class="h3 mb-0">Cancellation charges</h2>
        <SjButton v-if="editable" variant="secondary" size="sm" @click="emit('editOurs')"
          >Edit mine</SjButton
        >
      </div>

      <div v-if="c.looser" class="sj-alert sj-alert--danger mb-2" role="alert">
        <div class="fw-bold mb-1">⚠ Your terms are looser than the operator’s</div>
        <ul class="mb-2 ps-3 small">
          <li v-for="g in c.operators.flatMap((o) => o.gapText)" :key="g">{{ g }}</li>
        </ul>
        <div class="small mb-2">
          If the client cancels then, the difference comes out of your pocket.
        </div>
        <SjButton
          v-if="editable && c.fix"
          size="sm"
          :loading="fixing"
          loading-label="Fixing…"
          @click="emit('applyFix')"
        >
          Raise mine where needed
        </SjButton>
      </div>
      <p v-else-if="c.operators.some((o) => o.schedule)" class="small text-success fw-bold mb-2">
        ✓ Your charges are at least as strict as every operator’s.
      </p>

      <div class="table-responsive">
        <table class="table table-sm sj-cmp mb-2">
          <thead>
            <tr>
              <th scope="col">Cancelled</th>
              <th scope="col" class="text-end">You</th>
              <th
                v-for="o in c.operators"
                :key="o.rateResponseId"
                scope="col"
                class="text-end"
                :title="o.operator.name"
              >
                {{ shortName(o.operator.name) }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.when">
              <td>{{ r.when }}</td>
              <td class="text-end fw-bold" :class="{ 'sj-bad': r.looser }">
                <span v-if="r.looser" class="visually-hidden">Looser: </span>{{ pct(r.ours) }}
              </td>
              <td v-for="(t, i) in r.theirs" :key="i" class="text-end">{{ pct(t) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-for="o in c.operators" :key="o.rateResponseId" class="sj-op">
        <div class="d-flex justify-content-between align-items-center gap-2">
          <span class="small">
            <b>{{ o.operator.name }}</b>
            <span v-if="!o.schedule" class="text-warning-emphasis"> · charges not recorded</span>
          </span>
          <SjButton
            v-if="editable"
            variant="ghost"
            size="sm"
            @click="emit('editOperator', o.rateResponseId)"
          >
            {{ o.schedule ? 'Edit theirs' : 'Add theirs' }}
          </SjButton>
        </div>
        <details v-if="o.terms" class="small text-secondary">
          <summary>Their terms as written</summary>
          <p class="mb-1 mt-1" style="white-space: pre-wrap">{{ o.terms }}</p>
        </details>
      </div>
      <p v-if="c.note" class="small text-secondary mt-2 mb-0" style="white-space: pre-wrap">
        {{ c.note }}
      </p>
    </div>
  </section>
</template>

<style scoped>
.sj-cmp th {
  font-size: 0.75rem;
  color: var(--tblr-secondary);
  font-weight: 600;
  white-space: nowrap;
}
.sj-cmp td {
  font-size: 0.875rem;
  vertical-align: middle;
}
.sj-bad {
  color: #8a1c12;
  background: #fde2df !important;
}
.sj-op {
  border-top: 1px solid #eceef2;
  padding-top: 6px;
  margin-top: 6px;
}
.sj-alert {
  border-radius: 10px;
  padding: 10px 12px;
}
.sj-alert--danger {
  background: #fdecea;
  color: #6b1a12;
  border: 1px solid #f3c2bc;
}
</style>
