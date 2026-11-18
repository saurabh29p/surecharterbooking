<script setup lang="ts">
import { formatDate, formatINR, DOCUMENT_TYPE_LABELS } from '@shubhjets/shared';
import { computed, onMounted, ref } from 'vue';
import { api, ApiError } from '../../api/client';
import { openPdf, type DocumentRow, type InvoiceRow } from '../../composables/documents';
import type { QuoteSummary } from '../../composables/quotes';
import { useToast } from '../../composables/toast';
import type { WeddingDetail } from '../../composables/weddings';
import DocumentCard from '../DocumentCard.vue';
import SjButton from '../SjButton.vue';
import SjField from '../SjField.vue';
import SjSheet from '../SjSheet.vue';
import SjSkeleton from '../SjSkeleton.vue';

/**
 * The Docs tab: client terms (from the accepted or live quote), the GST invoice, and every PDF
 * made for this wedding (quotes, rate requests) with its share history.
 */
const props = defineProps<{ wedding: WeddingDetail }>();
const emit = defineEmits<{ changed: [] }>();
const toast = useToast();

const docs = ref<DocumentRow[] | null>(null);
const invoices = ref<{ blockers: string[]; invoices: InvoiceRow[] } | null>(null);
const quotes = ref<QuoteSummary[]>([]);
const busy = ref<string | null>(null);

async function load() {
  try {
    const [d, i, q] = await Promise.all([
      api<DocumentRow[]>(`/documents?weddingId=${props.wedding.id}`),
      api<{ blockers: string[]; invoices: InvoiceRow[] }>(`/weddings/${props.wedding.id}/invoices`),
      api<QuoteSummary[]>(`/weddings/${props.wedding.id}/quotes`),
    ]);
    docs.value = d;
    invoices.value = i;
    quotes.value = q;
  } catch (e) {
    docs.value ??= [];
    toast.error(e instanceof ApiError ? e.message : "Couldn't load the documents");
  }
}
onMounted(load);

const terms = computed(() => docs.value?.find((d) => d.type === 'CLIENT_TERMS') ?? null);
const termsBlocker = computed(() => {
  const now = Date.now();
  const ok = quotes.value.some(
    (q) =>
      q.status === 'ACCEPTED' ||
      (['ISSUED', 'SHARED'].includes(q.status) &&
        (!q.validUntil || new Date(q.validUntil).getTime() > now)),
  );
  return ok
    ? null
    : 'Issue the quote first: the terms list its flights, price and cancellation charges';
});
const invoiceDocs = computed(() => docs.value?.filter((d) => d.type === 'INVOICE') ?? []);
const otherDocs = computed(
  () => docs.value?.filter((d) => d.type === 'QUOTE' || d.type === 'RATE_REQUEST') ?? [],
);

async function makeTerms() {
  busy.value = 'terms';
  try {
    const r = await api<{ version: number; missing: string[]; draft: boolean }>('/agreements', {
      method: 'POST',
      json: { kind: 'CLIENT_TERMS', weddingId: props.wedding.id },
    });
    toast.success(
      r.missing.length
        ? `Client terms v${r.version} made. Missing: ${r.missing.join(', ')}`
        : `Client terms v${r.version} made${r.draft ? ' (draft)' : ''}`,
    );
    await load();
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : "Couldn't make the client terms");
  } finally {
    busy.value = null;
  }
}

async function issueInvoice() {
  busy.value = 'invoice';
  try {
    const r = await api<{ number: string }>(`/weddings/${props.wedding.id}/invoices`, {
      method: 'POST',
      json: {},
    });
    toast.success(`Invoice ${r.number} issued`);
    await load();
    emit('changed');
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : "Couldn't issue the invoice");
  } finally {
    busy.value = null;
  }
}

const cancelling = ref<InvoiceRow | null>(null);
const cancelReason = ref('');
const cancelError = ref<string | null>(null);
async function cancelInvoice() {
  if (!cancelling.value) return;
  busy.value = 'cancel';
  cancelError.value = null;
  try {
    await api(`/invoices/${cancelling.value.id}/cancel`, {
      method: 'POST',
      json: { reason: cancelReason.value },
    });
    toast.success(`Invoice ${cancelling.value.number} cancelled; its number stays used`);
    cancelling.value = null;
    cancelReason.value = '';
    await load();
  } catch (e) {
    if (e instanceof ApiError && e.fields.reason) cancelError.value = e.fields.reason;
    else toast.error(e instanceof ApiError ? e.message : "Couldn't cancel the invoice");
  } finally {
    busy.value = null;
  }
}
const invoiceOf = (d: DocumentRow) =>
  invoices.value?.invoices.find((i) => i.id === d.invoice?.id) ?? null;

async function open(d: DocumentRow) {
  try {
    await openPdf(`/documents/${d.id}/pdf`);
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : "Couldn't open the PDF");
  }
}
</script>

<template>
  <div>
    <SjSkeleton v-if="docs === null" :lines="4" height="4rem" />
    <template v-else>
      <DocumentCard
        title="Client terms and booking confirmation"
        :doc="terms"
        empty-text="The charter terms the client signs: flights, operators, price, payment and cancellation charges, filled in from the quote."
        :make-label="terms ? 'Make a new version' : 'Make client terms'"
        :make-blocker="termsBlocker"
        :making="busy === 'terms'"
        signable
        :share-text="`Charter terms and booking confirmation for ${wedding.code}. Please sign and return.`"
        @make="makeTerms"
        @changed="load"
      />

      <section class="card mb-3" aria-labelledby="inv-h">
        <div class="card-body">
          <h3 id="inv-h" class="h4">GST invoice</h3>
          <div v-if="invoices?.blockers.length" class="sj-block mb-2">
            <div class="fw-bold small mb-1">Before you can issue it</div>
            <ul class="mb-0 ps-3 small">
              <li v-for="b in invoices.blockers" :key="b">{{ b }}</li>
            </ul>
          </div>
          <p v-else-if="!invoiceDocs.length" class="small text-secondary">
            Ready: a full-value tax invoice for the accepted quote, numbered automatically.
          </p>
          <SjButton
            size="sm"
            :loading="busy === 'invoice'"
            loading-label="Issuing…"
            :disabled-reason="invoices?.blockers[0] ?? null"
            @click="issueInvoice"
          >
            Issue invoice
          </SjButton>
        </div>
      </section>
      <template v-for="d in invoiceDocs" :key="d.id">
        <DocumentCard
          :title="`Invoice ${d.invoice?.number}${d.invoice?.cancelled ? ' (cancelled)' : ''}`"
          :doc="d"
          empty-text=""
          :share-text="`Tax invoice ${d.invoice?.number} for ${wedding.code}.`"
          @changed="load"
        />
        <p v-if="invoiceOf(d) && !d.invoice?.cancelled" class="text-end mt-n2 mb-3">
          <span class="small text-secondary me-2"
            >{{ formatDate(invoiceOf(d)!.issuedOn) }} · {{ formatINR(invoiceOf(d)!.total) }}</span
          >
          <SjButton
            variant="ghost"
            size="sm"
            @click="((cancelling = invoiceOf(d)), (cancelError = null))"
            >Cancel invoice</SjButton
          >
        </p>
        <p v-else-if="invoiceOf(d)?.cancelReason" class="small text-secondary text-end mt-n2 mb-3">
          Cancelled: {{ invoiceOf(d)!.cancelReason }}
        </p>
      </template>

      <section class="card mb-3" aria-labelledby="other-h">
        <div class="card-body">
          <h3 id="other-h" class="h4">Other PDFs</h3>
          <p v-if="!otherDocs.length" class="small text-secondary mb-0">
            Quotes and rate requests you make appear here.
          </p>
          <button
            v-for="d in otherDocs"
            :key="d.id"
            type="button"
            class="sj-docrow"
            @click="open(d)"
          >
            <span>
              {{ DOCUMENT_TYPE_LABELS[d.type]
              }}<template v-if="d.quoteVersion"> Q{{ d.quoteVersion }}</template>
              <span class="d-block small text-secondary">
                {{ d.shares.length ? `Sent ${d.shares.length}×` : 'Not sent' }} · v{{
                  d.versions[0]?.version
                }}
              </span>
            </span>
            <span class="sj-docrow__go" aria-hidden="true">PDF ›</span>
          </button>
        </div>
      </section>
    </template>

    <SjSheet
      :open="!!cancelling"
      :title="`Cancel invoice ${cancelling?.number ?? ''}`"
      @close="cancelling = null"
    >
      <p class="small text-secondary">
        The invoice is marked cancelled and its number is never reused. You can then issue a new
        one.
      </p>
      <SjField
        v-model="cancelReason"
        label="Why"
        :maxlength="300"
        :server-error="cancelError ?? undefined"
      />
      <SjButton
        block
        variant="danger"
        :loading="busy === 'cancel'"
        loading-label="Cancelling…"
        :disabled-reason="cancelReason.trim().length < 3 ? 'Say briefly why' : null"
        @click="cancelInvoice"
      >
        Cancel invoice
      </SjButton>
    </SjSheet>
  </div>
</template>

<style scoped>
.sj-block {
  background: #fff6e0;
  color: #5c4310;
  border-radius: 8px;
  padding: 8px 12px;
}
.sj-docrow {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 48px;
  padding: 8px 10px;
  border: 1px solid #e3e5ea;
  border-radius: 10px;
  background: #fff;
  margin-top: 6px;
  text-align: left;
  transition:
    border-color var(--sj-fast),
    transform var(--sj-fast);
}
.sj-docrow:hover {
  border-color: var(--sj-gold);
  transform: translateY(-1px);
}
.sj-docrow:active {
  transform: scale(0.98);
}
.sj-docrow__go {
  color: var(--sj-gold-dark);
  font-weight: 700;
  white-space: nowrap;
}
</style>
