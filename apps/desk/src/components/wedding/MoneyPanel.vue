<script setup lang="ts">
import {
  formatBps,
  formatDate,
  formatDateTime,
  formatINR,
  parsePercent,
  parseRupees,
  PAYMENT_DIRECTION_LABELS,
  PAYMENT_MODE_LABELS,
  payoutBlocker,
  toIstDate,
  type ConfirmationItem,
  type MoneyPosition,
  type PaymentDirection,
  type PaymentMode,
} from '@shubhjets/shared';
import { computed, onMounted, reactive, ref } from 'vue';
import { api, ApiError } from '../../api/client';
import { useToast } from '../../composables/toast';
import type { WeddingDetail } from '../../composables/weddings';
import SjButton from '../SjButton.vue';
import SjField from '../SjField.vue';
import SjSheet from '../SjSheet.vue';
import SjSkeleton from '../SjSkeleton.vue';

interface PaymentRow {
  id: string;
  direction: PaymentDirection;
  name: string | null;
  operatorId: string | null;
  partnerId: string | null;
  amount: number;
  gstAmount: number;
  tdsBps: number | null;
  tds: number;
  outflow: number;
  status: 'RECORDED' | 'PAYABLE' | 'PAID';
  paidOn: string | null;
  mode: PaymentMode;
  reference: string | null;
  hasReceipt: boolean;
}
interface Money {
  status: string;
  confirmedAt: string | null;
  requiredPaymentBps: number;
  quote: { id: string; version: number } | null;
  position: MoneyPosition;
  checklist: ConfirmationItem[];
  canConfirm: boolean;
  operators: {
    operatorId: string;
    name: string;
    owedNet: number;
    committedNet: number;
    paidNet: number;
    remainingNet: number;
  }[];
  partner: {
    partnerId: string;
    name: string | null;
    owed: number;
    committed: number;
    remaining: number;
    flown: boolean;
  } | null;
  payments: PaymentRow[];
}

/**
 * The Money tab (BRIEF.md §5.4): what the client has paid and still owes, the checklist to
 * confirm the wedding (rule 2), and operator payouts and partner commission, which become
 * payable only when client money covers them (rule 3).
 */
const props = defineProps<{ wedding: WeddingDetail }>();
const emit = defineEmits<{ changed: [] }>();
const toast = useToast();
const m = ref<Money | null>(null);
const busy = ref<string | null>(null);
const confirmedPop = ref(false);
const money = (p: number) => formatINR(p, { paise: 'never' });
const today = toIstDate(new Date());

async function load() {
  try {
    m.value = await api<Money>(`/weddings/${props.wedding.id}/money`);
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : "Couldn't load the money");
  }
}
onMounted(load);

const pos = computed(() => m.value?.position);
const receivedPct = computed(() =>
  pos.value && pos.value.total
    ? Math.min(100, Math.round((pos.value.received / pos.value.total) * 100))
    : 0,
);
const confirmed = computed(
  () => !!m.value && ['SIGNED_AND_PAID', 'FLYING', 'DONE'].includes(m.value.status),
);
const confirmBlocker = computed(() => {
  if (!m.value) return null;
  const miss = m.value.checklist.find((c) => !c.done);
  return miss ? (miss.hint ?? miss.label) : null;
});

async function confirmWedding() {
  busy.value = 'confirm';
  try {
    await api(`/weddings/${props.wedding.id}/confirm`, { method: 'POST' });
    await load();
    confirmedPop.value = true;
    setTimeout(() => (confirmedPop.value = false), 1600);
    toast.success(`${props.wedding.code} is confirmed: signed and paid`);
    emit('changed');
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : "Couldn't confirm the wedding");
  } finally {
    busy.value = null;
  }
}

// ---------- Recording a payment ----------
const sheet = ref<PaymentDirection | null>(null);
const form = reactive({
  amount: '',
  gst: '',
  tds: '',
  paidOn: today,
  mode: 'BANK_TRANSFER' as PaymentMode,
  reference: '',
  operatorId: '',
  paid: false,
});
const errors = ref<Record<string, string>>({});

function open(direction: PaymentDirection, preset?: { operatorId?: string; amount?: number }) {
  errors.value = {};
  Object.assign(form, {
    amount: preset?.amount ? formatINR(preset.amount, { symbol: false }) : '',
    gst: '',
    tds: '',
    paidOn: today,
    mode: 'BANK_TRANSFER',
    reference: '',
    operatorId: preset?.operatorId ?? m.value?.operators[0]?.operatorId ?? '',
    paid: false,
  });
  if (direction === 'CLIENT_IN' && !preset?.amount && pos.value) {
    const due = pos.value.dueToConfirm || pos.value.balance;
    if (due) form.amount = formatINR(due, { symbol: false });
  }
  sheet.value = direction;
}

/** Rule 3, shown before you even tap. */
const sheetBlocker = computed(() => {
  if (!sheet.value || sheet.value === 'CLIENT_IN' || !pos.value) return null;
  let amount: number;
  let gst: number;
  try {
    amount = parseRupees(form.amount || '0');
    gst = sheet.value === 'OPERATOR_OUT' ? parseRupees(form.gst || '0') : 0;
  } catch {
    return 'Enter amounts in rupees';
  }
  return payoutBlocker(pos.value, amount + gst, {
    partner: sheet.value === 'PARTNER_OUT',
    flown: !!m.value?.partner?.flown,
  });
});

async function save() {
  if (!sheet.value) return;
  errors.value = {};
  let amount: number;
  let gstAmount = 0;
  let tdsBps: number | null = null;
  try {
    amount = parseRupees(form.amount);
  } catch {
    errors.value = { amount: 'Enter the amount in rupees, e.g. 5,00,000' };
    return;
  }
  try {
    if (sheet.value === 'OPERATOR_OUT' && form.gst.trim()) gstAmount = parseRupees(form.gst);
  } catch {
    errors.value = { gstAmount: 'Enter the GST in rupees' };
    return;
  }
  try {
    if (sheet.value === 'PARTNER_OUT' && form.tds.trim()) tdsBps = parsePercent(form.tds);
  } catch {
    errors.value = { tdsBps: 'Enter a percentage, e.g. 5' };
    return;
  }
  const outgoing = sheet.value !== 'CLIENT_IN';
  busy.value = 'save';
  try {
    await api(`/weddings/${props.wedding.id}/payments`, {
      method: 'POST',
      json: {
        direction: sheet.value,
        amount,
        gstAmount: sheet.value === 'OPERATOR_OUT' ? gstAmount : undefined,
        tdsBps: sheet.value === 'PARTNER_OUT' ? tdsBps : undefined,
        operatorId: sheet.value === 'OPERATOR_OUT' ? form.operatorId : undefined,
        partnerId: sheet.value === 'PARTNER_OUT' ? m.value?.partner?.partnerId : undefined,
        paid: outgoing ? form.paid : undefined,
        paidOn: !outgoing || form.paid ? form.paidOn : null,
        mode: form.mode,
        reference: form.reference,
      },
    });
    toast.success(
      sheet.value === 'CLIENT_IN'
        ? `${money(amount)} received from the client`
        : `${money(amount)} ${form.paid ? 'paid' : 'payable'} to ${sheet.value === 'OPERATOR_OUT' ? (m.value?.operators.find((o) => o.operatorId === form.operatorId)?.name ?? 'the operator') : (m.value?.partner?.name ?? 'the partner')}`,
    );
    sheet.value = null;
    await load();
    emit('changed');
  } catch (e) {
    if (e instanceof ApiError && Object.keys(e.fields).length) errors.value = e.fields;
    else toast.error(e instanceof ApiError ? e.message : "Couldn't record the payment");
  } finally {
    busy.value = null;
  }
}

// ---------- Existing payments ----------
const paying = ref<PaymentRow | null>(null);
const paidForm = reactive({ paidOn: today, reference: '' });
async function markPaid() {
  if (!paying.value) return;
  busy.value = 'paid';
  try {
    await api(`/payments/${paying.value.id}/paid`, { method: 'POST', json: { ...paidForm } });
    toast.success('Marked paid');
    paying.value = null;
    await load();
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : "Couldn't mark it paid");
  } finally {
    busy.value = null;
  }
}

async function remove(p: PaymentRow) {
  busy.value = `rm-${p.id}`;
  try {
    await api(`/payments/${p.id}`, { method: 'DELETE' });
    await load();
    toast.success('Payment removed', async () => {
      try {
        await api(`/payments/${p.id}/restore`, { method: 'POST' });
        await load();
        toast.success('Payment restored');
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : "Couldn't restore it");
      }
    });
    emit('changed');
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : "Couldn't remove it");
  } finally {
    busy.value = null;
  }
}

const receiptFor = ref<string | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
function pickReceipt(p: PaymentRow) {
  receiptFor.value = p.id;
  fileInput.value?.click();
}
async function onReceipt(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0];
  (e.target as HTMLInputElement).value = '';
  if (!f || !receiptFor.value) return;
  busy.value = `rc-${receiptFor.value}`;
  try {
    const body = new FormData();
    body.append('file', f);
    await api(`/payments/${receiptFor.value}/receipt`, { method: 'POST', body });
    toast.success('Receipt saved');
    await load();
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : "Couldn't upload the receipt");
  } finally {
    busy.value = null;
  }
}
async function openReceipt(p: PaymentRow) {
  const tab = window.open('', '_blank');
  try {
    const link = await api<{ url: string }>(`/payments/${p.id}/receipt/link`, { method: 'POST' });
    if (tab) tab.location.href = link.url;
  } catch (e) {
    tab?.close();
    toast.error(e instanceof ApiError ? e.message : "Couldn't open the receipt");
  }
}

const statusChip = (p: PaymentRow) =>
  p.direction === 'CLIENT_IN'
    ? { label: 'Received', cls: 'sj-pill--ok' }
    : p.status === 'PAID'
      ? { label: 'Paid', cls: 'sj-pill--ok' }
      : { label: 'Payable', cls: 'sj-pill--gold' };
const opBlocker = (remaining: number) => (pos.value ? payoutBlocker(pos.value, remaining) : null);
</script>

<template>
  <div>
    <SjSkeleton v-if="!m" :lines="5" height="4rem" />
    <template v-else>
      <!-- Client money -->
      <section class="card mb-3" :class="{ 'sj-pop': confirmedPop }" aria-labelledby="client-h">
        <div class="card-body">
          <h2 id="client-h" class="h3 mb-1">Client payments</h2>
          <p v-if="!m.quote" class="text-secondary small mb-0">
            Once the client accepts a quote, record their payments here.
          </p>
          <template v-else>
            <div class="d-flex justify-content-between align-items-end gap-2">
              <div>
                <div class="small text-secondary">Received</div>
                <div class="sj-big">{{ money(m.position.received) }}</div>
              </div>
              <div class="text-end small">
                of {{ money(m.position.total) }}
                <div class="text-secondary">Balance {{ money(m.position.balance) }}</div>
              </div>
            </div>
            <div
              class="sj-bar mt-2"
              role="progressbar"
              :aria-valuenow="receivedPct"
              aria-valuemin="0"
              aria-valuemax="100"
              :aria-label="`${receivedPct}% received`"
            >
              <span :style="{ width: `${receivedPct}%` }" />
            </div>
            <div v-if="!confirmed && m.position.dueToConfirm" class="small mt-1">
              {{ money(m.position.dueToConfirm) }} more needed to confirm ({{
                formatBps(m.requiredPaymentBps)
              }}
              of the total)
            </div>
          </template>
        </div>
      </section>

      <!-- Rule 2 -->
      <section v-if="m.checklist.length" class="card mb-3" aria-labelledby="confirm-h">
        <div class="card-body">
          <h2 id="confirm-h" class="h3">{{ confirmed ? 'Confirmed' : 'Confirm the wedding' }}</h2>
          <p v-if="confirmed && m.confirmedAt" class="text-success fw-bold mb-0">
            ✓ Signed and paid on {{ formatDateTime(new Date(m.confirmedAt)) }}
          </p>
          <template v-else>
            <ul class="sj-cl">
              <li v-for="c in m.checklist" :key="c.key" :class="{ done: c.done }">
                <span class="sj-cl__mark" aria-hidden="true">{{ c.done ? '✓' : '' }}</span>
                <span>
                  {{ c.label
                  }}<span class="visually-hidden">{{ c.done ? ': done' : ': not yet' }}</span>
                  <span v-if="c.hint" class="d-block small text-secondary">{{ c.hint }}</span>
                </span>
              </li>
            </ul>
            <SjButton
              block
              :loading="busy === 'confirm'"
              loading-label="Confirming…"
              :disabled-reason="confirmBlocker"
              @click="confirmWedding"
            >
              Confirm wedding
            </SjButton>
          </template>
        </div>
      </section>

      <!-- Rule 3 -->
      <section v-if="m.operators.length || m.partner" class="card mb-3" aria-labelledby="out-h">
        <div class="card-body">
          <h2 id="out-h" class="h3 mb-1">Payouts</h2>
          <p class="small text-secondary">
            Payable only from client money received:
            {{ money(Math.max(0, m.position.uncommitted)) }} not yet committed.
          </p>
          <div v-for="o in m.operators" :key="o.operatorId" class="sj-owed">
            <div class="flex-fill min-w-0">
              <div class="fw-bold">{{ o.name }}</div>
              <div class="small text-secondary">
                Owed {{ money(o.owedNet) }} net · paid {{ money(o.paidNet)
                }}<template v-if="o.committedNet > o.paidNet">
                  · payable {{ money(o.committedNet - o.paidNet) }}</template
                >
              </div>
            </div>
            <SjButton
              v-if="o.remainingNet > 0"
              size="sm"
              variant="secondary"
              :disabled-reason="opBlocker(o.remainingNet)"
              @click="open('OPERATOR_OUT', { operatorId: o.operatorId, amount: o.remainingNet })"
            >
              Pay
            </SjButton>
            <span v-else class="small text-success fw-bold">✓</span>
          </div>
          <div v-if="m.partner" class="sj-owed">
            <div class="flex-fill min-w-0">
              <div class="fw-bold">
                {{ m.partner.name }} <span class="small text-secondary fw-normal">commission</span>
              </div>
              <div class="small text-secondary">
                Owed {{ money(m.partner.owed)
                }}<template v-if="m.partner.committed">
                  · {{ money(m.partner.committed) }} payable or paid</template
                >
                <template v-if="!m.partner.flown"> · earned once the wedding has flown</template>
              </div>
            </div>
            <SjButton
              v-if="m.partner.remaining > 0"
              size="sm"
              variant="secondary"
              :disabled-reason="
                pos
                  ? payoutBlocker(pos, m.partner.remaining, {
                      partner: true,
                      flown: m.partner.flown,
                    })
                  : null
              "
              @click="open('PARTNER_OUT', { amount: m.partner.remaining })"
            >
              Pay
            </SjButton>
            <span v-else class="small text-success fw-bold">✓</span>
          </div>
        </div>
      </section>

      <!-- All payments -->
      <section class="card mb-3" aria-labelledby="pay-h">
        <div class="card-body">
          <h2 id="pay-h" class="h3">All payments</h2>
          <p v-if="!m.payments.length" class="small text-secondary mb-0">Nothing recorded yet.</p>
          <div v-for="p in m.payments" :key="p.id" class="sj-pay">
            <div class="d-flex justify-content-between gap-2">
              <div class="min-w-0">
                <div class="fw-bold">
                  {{ p.direction === 'CLIENT_IN' ? 'From the client' : `To ${p.name}` }}
                </div>
                <div class="small text-secondary">
                  {{ PAYMENT_DIRECTION_LABELS[p.direction]
                  }}<template v-if="p.paidOn"> · {{ formatDate(p.paidOn) }}</template> ·
                  {{ PAYMENT_MODE_LABELS[p.mode]
                  }}<template v-if="p.reference"> · {{ p.reference }}</template>
                </div>
              </div>
              <div class="text-end">
                <div
                  class="fw-bold text-nowrap"
                  :class="p.direction === 'CLIENT_IN' ? 'text-success' : ''"
                >
                  {{ p.direction === 'CLIENT_IN' ? '+' : '−'
                  }}{{ money(p.direction === 'CLIENT_IN' ? p.amount : p.outflow) }}
                </div>
                <span class="sj-pill" :class="statusChip(p).cls">{{ statusChip(p).label }}</span>
              </div>
            </div>
            <div v-if="p.gstAmount || p.tds" class="small text-secondary">
              <template v-if="p.gstAmount"
                >{{ money(p.amount) }} net + {{ money(p.gstAmount) }} GST</template
              >
              <template v-if="p.tds"
                >TDS {{ formatBps(p.tdsBps ?? 0) }}: {{ money(p.tds) }} deducted,
                {{ money(p.amount - p.tds) }} to send</template
              >
            </div>
            <div class="d-flex flex-wrap gap-1 mt-1">
              <SjButton
                v-if="p.status === 'PAYABLE'"
                size="sm"
                @click="((paying = p), (paidForm.paidOn = today), (paidForm.reference = ''))"
                >Mark paid</SjButton
              >
              <SjButton v-if="p.hasReceipt" variant="ghost" size="sm" @click="openReceipt(p)"
                >Receipt</SjButton
              >
              <SjButton
                v-else
                variant="ghost"
                size="sm"
                :loading="busy === `rc-${p.id}`"
                loading-label="Uploading…"
                @click="pickReceipt(p)"
                >Add receipt</SjButton
              >
              <SjButton
                variant="ghost"
                size="sm"
                :loading="busy === `rm-${p.id}`"
                loading-label="Removing…"
                @click="remove(p)"
                >Remove</SjButton
              >
            </div>
          </div>
          <input
            ref="fileInput"
            type="file"
            class="d-none"
            accept="application/pdf,image/png,image/jpeg,image/webp"
            @change="onReceipt"
          />
        </div>
      </section>

      <div v-if="m.quote" class="sj-actionbar">
        <SjButton class="flex-fill" @click="open('CLIENT_IN')">Record client payment</SjButton>
      </div>
    </template>

    <SjSheet
      :open="!!sheet"
      :title="
        sheet === 'CLIENT_IN'
          ? 'Client payment received'
          : sheet === 'OPERATOR_OUT'
            ? 'Pay an operator'
            : 'Pay partner commission'
      "
      @close="sheet = null"
    >
      <form novalidate @submit.prevent="save">
        <div v-if="sheet === 'OPERATOR_OUT'" class="mb-3">
          <label class="form-label" for="p-op">Operator</label>
          <select id="p-op" v-model="form.operatorId" class="form-select">
            <option v-for="o in m?.operators" :key="o.operatorId" :value="o.operatorId">
              {{ o.name }} (owed {{ money(o.remainingNet) }})
            </option>
          </select>
        </div>
        <div class="d-flex gap-2">
          <div class="flex-fill">
            <SjField
              v-model="form.amount"
              :label="sheet === 'OPERATOR_OUT' ? 'Net amount (₹)' : 'Amount (₹)'"
              inputmode="decimal"
              :server-error="errors.amount"
            />
          </div>
          <div v-if="sheet === 'OPERATOR_OUT'" style="flex: 0 0 40%">
            <SjField
              v-model="form.gst"
              label="Their GST (₹)"
              optional
              inputmode="decimal"
              :server-error="errors.gstAmount"
            />
          </div>
          <div v-if="sheet === 'PARTNER_OUT'" style="flex: 0 0 34%">
            <SjField
              v-model="form.tds"
              label="TDS %"
              optional
              inputmode="decimal"
              :server-error="errors.tdsBps"
            />
          </div>
        </div>
        <label v-if="sheet !== 'CLIENT_IN'" class="form-check mb-3">
          <input v-model="form.paid" type="checkbox" class="form-check-input" />
          <span class="form-check-label">Already paid (otherwise it is marked payable)</span>
        </label>
        <div v-if="sheet === 'CLIENT_IN' || form.paid" class="d-flex gap-2 mb-3">
          <div class="flex-fill">
            <label class="form-label" for="p-on">{{
              sheet === 'CLIENT_IN' ? 'Received on' : 'Paid on'
            }}</label>
            <input
              id="p-on"
              v-model="form.paidOn"
              type="date"
              class="form-control"
              :max="today"
              :class="{ 'is-invalid': errors.paidOn }"
            />
            <div v-if="errors.paidOn" class="invalid-feedback d-block">{{ errors.paidOn }}</div>
          </div>
          <div class="flex-fill">
            <label class="form-label" for="p-mode">How</label>
            <select id="p-mode" v-model="form.mode" class="form-select">
              <option v-for="(label, k) in PAYMENT_MODE_LABELS" :key="k" :value="k">
                {{ label }}
              </option>
            </select>
          </div>
        </div>
        <SjField
          v-model="form.reference"
          label="Reference (UTR, cheque no.)"
          optional
          :maxlength="120"
        />
        <div v-if="sheetBlocker" class="sj-why mb-2" role="alert">{{ sheetBlocker }}</div>
        <SjButton
          type="submit"
          block
          :loading="busy === 'save'"
          loading-label="Saving…"
          :disabled-reason="sheetBlocker"
        >
          {{
            sheet === 'CLIENT_IN' ? 'Record payment' : form.paid ? 'Record as paid' : 'Mark payable'
          }}
        </SjButton>
      </form>
    </SjSheet>

    <SjSheet :open="!!paying" :title="`Mark paid: ${paying?.name ?? ''}`" @close="paying = null">
      <label class="form-label" for="pd-on">Paid on</label>
      <input
        id="pd-on"
        v-model="paidForm.paidOn"
        type="date"
        class="form-control mb-3"
        :max="today"
      />
      <SjField v-model="paidForm.reference" label="Reference (UTR)" optional :maxlength="120" />
      <SjButton block :loading="busy === 'paid'" loading-label="Saving…" @click="markPaid"
        >Mark paid</SjButton
      >
    </SjSheet>
  </div>
</template>

<style scoped>
.sj-big {
  font-family: 'Bodoni Moda', Georgia, serif;
  font-weight: 600;
  font-size: 1.75rem;
  line-height: 1.1;
}
.sj-bar {
  height: 8px;
  border-radius: 999px;
  background: #eceef2;
  overflow: hidden;
}
.sj-bar span {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, #b88f3e, var(--sj-gold));
  transition: width 0.4s ease-out;
}
.sj-cl {
  list-style: none;
  padding: 0;
  margin: 0 0 12px;
}
.sj-cl li {
  display: flex;
  gap: 10px;
  padding: 6px 0;
  align-items: flex-start;
}
.sj-cl__mark {
  flex: 0 0 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid #c9ccd4;
  display: grid;
  place-items: center;
  font-size: 0.75rem;
  font-weight: 800;
  color: #fff;
}
.sj-cl li.done .sj-cl__mark {
  background: #1f8a4c;
  border-color: #1f8a4c;
}
.sj-owed {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  border-top: 1px solid #eceef2;
}
.sj-pay {
  padding: 10px 0;
  border-top: 1px solid #eceef2;
}
.sj-pill {
  display: inline-block;
  font-size: 0.6875rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 999px;
}
.sj-pill--ok {
  background: #dcf2e4;
  color: #145c36;
}
.sj-pill--gold {
  background: #fbf0d6;
  color: #6b4d12;
}
.sj-why {
  background: #fff6e0;
  color: #5c4310;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 0.8125rem;
}
.min-w-0 {
  min-width: 0;
}
.sj-pop {
  animation: sj-pop 0.5s ease-out;
}
@keyframes sj-pop {
  0% {
    transform: scale(0.98);
    box-shadow: 0 0 0 0 rgba(31, 138, 76, 0.5);
  }
  60% {
    transform: scale(1.01);
    box-shadow: 0 0 0 8px rgba(31, 138, 76, 0);
  }
  100% {
    transform: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .sj-pop {
    animation: none;
  }
  .sj-bar span {
    transition: none;
  }
}
</style>
