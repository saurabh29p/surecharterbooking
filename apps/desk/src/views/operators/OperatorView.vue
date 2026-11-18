<script setup lang="ts">
import {
  AIRCRAFT_CATEGORIES,
  CATEGORY_LABELS,
  DOC_KIND_LABELS,
  daysBetween,
  formatDate,
  formatDateTime,
  toIstDate,
  type BankDetails,
  type OperatorDocKind,
} from '@shubhjets/shared';
import { computed, onMounted, reactive, ref } from 'vue';
import AgreementCard from '../../components/AgreementCard.vue';
import { useRoute } from 'vue-router';
import { api, ApiError } from '../../api/client';
import SjButton from '../../components/SjButton.vue';
import SjConfirm from '../../components/SjConfirm.vue';
import SjField from '../../components/SjField.vue';
import SjSheet from '../../components/SjSheet.vue';
import SjSkeleton from '../../components/SjSkeleton.vue';
import OperatorFields from '../../components/operator/OperatorFields.vue';
import StatusBadge from '../../components/operator/StatusBadge.vue';
import BankFields from '../../components/profile/BankFields.vue';
import { useAirports } from '../../composables/airports';
import { newOperatorForm, operatorBody } from '../../composables/operatorForm';
import {
  expiryText,
  type AircraftRow,
  type ContactRow,
  type OperatorDetail,
  type OperatorDocument,
} from '../../composables/operators';
import { bankIsEmpty, fillBank, newProfileForm } from '../../composables/profileForm';
import { useToast } from '../../composables/toast';

const route = useRoute();
const toast = useToast();
const { airports, label: airportLabel } = useAirports();
const id = String(route.params.id);

const op = ref<OperatorDetail | null>(null);
const busy = ref<string | null>(null);
const today = toIstDate(new Date());

async function load() {
  try {
    op.value = await api<OperatorDetail>(`/operators/${id}`);
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : "Couldn't load this operator");
  }
}
onMounted(load);

/** Run an action with a busy flag; reload and toast on success. */
async function act(key: string, fn: () => Promise<unknown>, success: string) {
  busy.value = key;
  try {
    const res = await fn();
    if (res && typeof res === 'object' && 'checklist' in res) op.value = res as OperatorDetail;
    else await load();
    toast.success(success);
    return true;
  } catch (e) {
    const err = e as ApiError & { missing?: string[] };
    toast.error(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    return false;
  } finally {
    busy.value = null;
  }
}

const name = computed(() => op.value?.brand || op.value?.legalName || '');
const verifyBlocker = computed(() => {
  if (!op.value) return null;
  if (op.value.blockKind === 'MANUAL') return 'Unblock this operator first';
  if (!op.value.readyToVerify) return 'Finish the required checklist items first';
  return null;
});
const isVerified = computed(() => op.value?.verifiedAt !== null);

// ---------- Documents ----------
const docSheet = ref(false);
const doc = reactive({ kind: 'NSOP' as OperatorDocKind, expiresOn: '', file: null as File | null });
const docErrors = ref<Record<string, string>>({});
const deleteDoc = ref<OperatorDocument | null>(null);

function openUpload(kind: OperatorDocKind = 'NSOP') {
  Object.assign(doc, { kind, expiresOn: '', file: null });
  docErrors.value = {};
  docSheet.value = true;
}

async function upload() {
  docErrors.value = {};
  if (!doc.file) {
    docErrors.value = { file: 'Choose the document file (PDF or photo)' };
    return;
  }
  const form = new FormData();
  form.append('kind', doc.kind);
  if (doc.expiresOn) form.append('expiresOn', doc.expiresOn);
  form.append('file', doc.file);
  busy.value = 'upload';
  try {
    op.value = await api<OperatorDetail>(`/operators/${id}/documents`, {
      method: 'POST',
      body: form,
    });
    docSheet.value = false;
    toast.success(`${DOC_KIND_LABELS[doc.kind]} uploaded. Open it, check it, then tap Verify.`);
  } catch (e) {
    if (e instanceof ApiError && Object.keys(e.fields).length) docErrors.value = e.fields;
    else toast.error(e instanceof ApiError ? e.message : "Couldn't upload the document");
  } finally {
    busy.value = null;
  }
}

async function openFile(fileId: string | null) {
  if (!fileId) return;
  // Open the tab first (synchronously) so phone browsers don't block it as a pop-up.
  const tab = window.open('', '_blank');
  try {
    const link = await api<{ url: string }>(`/files/${fileId}/link`, { method: 'POST' });
    if (tab) tab.location.href = link.url;
    else window.location.href = link.url;
  } catch (e) {
    tab?.close();
    toast.error(e instanceof ApiError ? e.message : "Couldn't open the file");
  }
}

const daysLeft = (d: string | null) => (d ? daysBetween(today, d) : null);

// ---------- Block ----------
const blockSheet = ref(false);
const blockReason = ref('');
async function block() {
  if (
    await act(
      'block',
      () => api(`/operators/${id}/block`, { method: 'POST', json: { reason: blockReason.value } }),
      `${name.value} blocked`,
    )
  ) {
    blockSheet.value = false;
    blockReason.value = '';
  }
}

// ---------- Aircraft ----------
const acSheet = ref(false);
const ac = reactive({
  id: '',
  type: '',
  registration: '',
  category: 'MIDSIZE',
  seats: '',
  year: '',
  baseAirport: '',
});
const acErrors = ref<Record<string, string>>({});
const removeAc = ref<AircraftRow | null>(null);

function openAircraft(a?: AircraftRow) {
  Object.assign(ac, {
    id: a?.id ?? '',
    type: a?.type ?? '',
    registration: a?.registration ?? '',
    category: a?.category ?? 'MIDSIZE',
    seats: a ? String(a.seats) : '',
    year: a?.year ? String(a.year) : '',
    baseAirport: a?.baseAirport ?? op.value?.bases[0] ?? '',
  });
  acErrors.value = {};
  acSheet.value = true;
}

async function saveAircraft() {
  acErrors.value = {};
  const body = {
    type: ac.type,
    registration: ac.registration,
    category: ac.category,
    seats: Number(ac.seats),
    year: ac.year ? Number(ac.year) : null,
    baseAirport: ac.baseAirport || null,
  };
  busy.value = 'aircraft';
  try {
    if (ac.id) await api(`/aircraft/${ac.id}`, { method: 'PATCH', json: body });
    else await api(`/operators/${id}/aircraft`, { method: 'POST', json: body });
    acSheet.value = false;
    await load();
    toast.success(ac.id ? 'Aircraft updated' : 'Aircraft added');
  } catch (e) {
    if (e instanceof ApiError && Object.keys(e.fields).length) acErrors.value = e.fields;
    else toast.error(e instanceof ApiError ? e.message : "Couldn't save the aircraft");
  } finally {
    busy.value = null;
  }
}

// ---------- Contacts ----------
const ctSheet = ref(false);
const ct = reactive({ id: '', name: '', role: '', phone: '', email: '', isPrimary: false });
const ctErrors = ref<Record<string, string>>({});
const removeCt = ref<ContactRow | null>(null);

function openContact(c?: ContactRow) {
  Object.assign(ct, {
    id: c?.id ?? '',
    name: c?.name ?? '',
    role: c?.role ?? '',
    phone: c?.phone ?? '',
    email: c?.email ?? '',
    isPrimary: c?.isPrimary ?? false,
  });
  ctErrors.value = {};
  ctSheet.value = true;
}

async function saveContact() {
  ctErrors.value = {};
  const body = {
    name: ct.name,
    role: ct.role,
    phone: ct.phone,
    email: ct.email,
    isPrimary: ct.isPrimary || undefined,
  };
  busy.value = 'contact';
  try {
    if (ct.id) await api(`/operator-contacts/${ct.id}`, { method: 'PATCH', json: body });
    else await api(`/operators/${id}/contacts`, { method: 'POST', json: body });
    ctSheet.value = false;
    await load();
    toast.success(ct.id ? 'Contact updated' : 'Contact added');
  } catch (e) {
    if (e instanceof ApiError && Object.keys(e.fields).length) ctErrors.value = e.fields;
    else toast.error(e instanceof ApiError ? e.message : "Couldn't save the contact");
  } finally {
    busy.value = null;
  }
}

const waLink = (phone: string) => `https://wa.me/${phone.replace(/\D/g, '')}`;

// ---------- Details ----------
const editing = ref(false);
const form = ref(newOperatorForm());
const formErrors = ref<Record<string, string>>({});
function startEdit() {
  form.value = newOperatorForm(op.value);
  formErrors.value = {};
  editing.value = true;
}
async function saveDetails() {
  formErrors.value = {};
  busy.value = 'details';
  try {
    op.value = await api<OperatorDetail>(`/operators/${id}`, {
      method: 'PATCH',
      json: operatorBody(form.value),
    });
    editing.value = false;
    toast.success('Saved');
  } catch (e) {
    if (e instanceof ApiError && Object.keys(e.fields).length) {
      formErrors.value = e.fields;
      toast.error('Please fix the highlighted fields');
    } else toast.error(e instanceof ApiError ? e.message : "Couldn't save");
  } finally {
    busy.value = null;
  }
}

// ---------- Bank details ----------
const bankForm = ref(newProfileForm());
const bankOpen = ref(false);
const bankErrors = ref<Record<string, string>>({});
async function openBank() {
  busy.value = 'bank-open';
  try {
    const res = op.value?.hasBankDetails
      ? await api<{ bankDetails: BankDetails | null }>(`/operators/${id}/bank-details`)
      : { bankDetails: null };
    fillBank(bankForm.value, res.bankDetails);
    bankOpen.value = true;
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : "Couldn't open the bank details");
  } finally {
    busy.value = null;
  }
}
async function saveBank() {
  bankErrors.value = {};
  const f = bankForm.value;
  const bankDetails = bankIsEmpty(f) ? null : { ...f.bank, branch: f.bank.branch || null };
  busy.value = 'bank';
  try {
    op.value = await api<OperatorDetail>(`/operators/${id}`, {
      method: 'PATCH',
      json: { bankDetails },
    });
    bankOpen.value = false;
    toast.success(bankDetails ? 'Bank details saved' : 'Bank details removed');
  } catch (e) {
    if (e instanceof ApiError && Object.keys(e.fields).length) bankErrors.value = e.fields;
    else toast.error(e instanceof ApiError ? e.message : "Couldn't save the bank details");
  } finally {
    busy.value = null;
  }
}
</script>

<template>
  <div>
    <RouterLink to="/operators" class="d-inline-block mb-2">‹ Operators</RouterLink>
    <SjSkeleton v-if="!op" :lines="8" height="3rem" />
    <template v-else>
      <div class="d-flex align-items-center gap-2 flex-wrap mb-1">
        <h1 class="page-title mb-0">{{ name }}</h1>
        <StatusBadge :status="op.status" />
      </div>
      <div v-if="op.brand" class="text-secondary small">{{ op.legalName }}</div>
      <div class="mt-2 mb-3 fw-bold" :class="op.quotable.ok ? 'text-success' : 'text-danger'">
        {{
          op.quotable.ok
            ? '✓ Can be chosen for legs and quotes'
            : `✗ Can't be quoted: ${op.quotable.reason}`
        }}
      </div>

      <!-- Verification checklist -->
      <section class="card mb-3" aria-labelledby="check-h">
        <div class="card-body">
          <h2 id="check-h" class="h3">Verification</h2>
          <ul class="list-unstyled mb-3">
            <li v-for="c in op.checklist" :key="c.key" class="d-flex gap-2 py-1">
              <span
                :class="c.done ? 'text-success' : c.required ? 'text-danger' : 'text-secondary'"
                aria-hidden="true"
                >{{ c.done ? '✓' : '○' }}</span
              >
              <span>
                {{ c.label }}<span v-if="!c.required" class="text-secondary"> (recommended)</span>
                <span v-if="!c.done && c.hint" class="d-block text-secondary small">{{
                  c.hint
                }}</span>
              </span>
            </li>
          </ul>
          <div
            v-for="e in op.expiries"
            :key="e.kind"
            class="small"
            :class="{ 'text-warning-emphasis': e.daysLeft <= 30 }"
          >
            {{ expiryText(e) }}
          </div>
          <div class="d-flex gap-2 flex-wrap mt-3">
            <SjButton
              v-if="!isVerified || op.status === 'FOUND'"
              :loading="busy === 'verify'"
              loading-label="Verifying…"
              :disabled-reason="verifyBlocker"
              @click="
                act(
                  'verify',
                  () => api(`/operators/${id}/verify`, { method: 'POST' }),
                  `${name} is verified`,
                )
              "
            >
              Mark as verified
            </SjButton>
            <SjButton
              v-if="op.blockKind === 'MANUAL'"
              variant="secondary"
              :loading="busy === 'unblock'"
              loading-label="Unblocking…"
              @click="
                act(
                  'unblock',
                  () => api(`/operators/${id}/unblock`, { method: 'POST' }),
                  `${name} unblocked`,
                )
              "
            >
              Unblock
            </SjButton>
            <SjButton v-else variant="ghost" @click="blockSheet = true">Block operator</SjButton>
          </div>
          <p v-if="op.blockKind" class="small mt-2 mb-0">⛔ {{ op.blockedReason }}</p>
          <p v-if="op.verifiedAt" class="text-secondary small mt-2 mb-0">
            Verified by you on {{ formatDateTime(new Date(op.verifiedAt)) }}
          </p>
        </div>
      </section>

      <!-- Documents -->
      <AgreementCard
        kind="OPERATOR_AGREEMENT"
        :subject-id="op.id"
        :subject-name="op.brand || op.legalName"
        @changed="load"
      />

      <section class="card mb-3" aria-labelledby="docs-h">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <h2 id="docs-h" class="h3 mb-0">Documents</h2>
            <SjButton variant="secondary" size="sm" @click="openUpload()">Upload</SjButton>
          </div>
          <p v-if="!op.documents.length" class="text-secondary mb-0">
            No documents yet. Upload the NSOP permit and the insurance certificate.
          </p>
          <div v-for="d in op.documents" :key="d.id" class="sj-row">
            <div class="flex-fill">
              <div class="fw-bold">{{ DOC_KIND_LABELS[d.kind] }}</div>
              <div class="small text-secondary">
                <template v-if="d.expiresOn">
                  Expires {{ formatDate(d.expiresOn) }}
                  <span
                    :class="{
                      'text-danger': (daysLeft(d.expiresOn) ?? 0) < 0,
                      'text-warning-emphasis': (daysLeft(d.expiresOn) ?? 99) <= 30,
                    }"
                  >
                    ({{
                      (daysLeft(d.expiresOn) ?? 0) < 0
                        ? 'expired'
                        : `${daysLeft(d.expiresOn)} days left`
                    }})
                  </span>
                </template>
                <template v-else>No expiry date</template>
              </div>
              <div class="small" :class="d.verifiedOn ? 'text-success' : 'text-warning-emphasis'">
                {{
                  d.verifiedOn
                    ? `✓ Verified by you on ${formatDate(d.verifiedOn)}`
                    : '○ Not checked yet'
                }}
              </div>
            </div>
            <div class="d-flex gap-1 flex-wrap justify-content-end">
              <SjButton variant="secondary" size="sm" @click="openFile(d.fileId)">Open</SjButton>
              <SjButton
                v-if="!d.verifiedOn"
                size="sm"
                :loading="busy === `doc-${d.id}`"
                loading-label="…"
                @click="
                  act(
                    `doc-${d.id}`,
                    () => api(`/operator-documents/${d.id}/verify`, { method: 'POST' }),
                    `${DOC_KIND_LABELS[d.kind]} verified`,
                  )
                "
              >
                Verify
              </SjButton>
              <SjButton
                variant="ghost"
                size="sm"
                :aria-label="`Delete ${DOC_KIND_LABELS[d.kind]}`"
                @click="deleteDoc = d"
                >Delete</SjButton
              >
            </div>
          </div>
        </div>
      </section>

      <!-- Aircraft -->
      <section class="card mb-3" aria-labelledby="ac-h">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <h2 id="ac-h" class="h3 mb-0">Aircraft</h2>
            <SjButton variant="secondary" size="sm" @click="openAircraft()">Add aircraft</SjButton>
          </div>
          <p v-if="!op.aircraft.length" class="text-secondary mb-0">
            No aircraft yet. Add them so this operator shows up for the right legs.
          </p>
          <div v-for="a in op.aircraft" :key="a.id" class="sj-row">
            <button type="button" class="sj-row__main" @click="openAircraft(a)">
              <span class="fw-bold d-block"
                >{{ a.type }}
                <span class="text-secondary fw-normal">{{ a.registration }}</span></span
              >
              <span class="small text-secondary">
                {{ CATEGORY_LABELS[a.category] }} · {{ a.seats }} seats<template v-if="a.year">
                  · {{ a.year }}</template
                >
                <template v-if="a.baseAirport"> · {{ airportLabel(a.baseAirport) }}</template>
              </span>
            </button>
            <SjButton
              variant="ghost"
              size="sm"
              :aria-label="`Remove ${a.type}`"
              @click="removeAc = a"
              >Remove</SjButton
            >
          </div>
        </div>
      </section>

      <!-- Contacts -->
      <section class="card mb-3" aria-labelledby="ct-h">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <h2 id="ct-h" class="h3 mb-0">Contacts</h2>
            <SjButton variant="secondary" size="sm" @click="openContact()">Add contact</SjButton>
          </div>
          <p v-if="!op.contacts.length" class="text-secondary mb-0">No contacts yet.</p>
          <div v-for="c in op.contacts" :key="c.id" class="sj-row">
            <button type="button" class="sj-row__main" @click="openContact(c)">
              <span class="fw-bold d-block">
                {{ c.name }} <span v-if="c.isPrimary" class="sj-badge sj-badge--gold">Main</span>
              </span>
              <span class="small text-secondary">{{
                [c.role, c.phone, c.email].filter(Boolean).join(' · ')
              }}</span>
            </button>
            <div class="d-flex gap-1">
              <a
                v-if="c.phone"
                :href="`tel:${c.phone}`"
                class="sj-btn sj-btn--secondary sj-btn--sm"
                :aria-label="`Call ${c.name}`"
                >Call</a
              >
              <a
                v-if="c.phone"
                :href="waLink(c.phone)"
                target="_blank"
                rel="noopener"
                class="sj-btn sj-btn--secondary sj-btn--sm"
                :aria-label="`WhatsApp ${c.name}`"
                >WhatsApp</a
              >
            </div>
          </div>
        </div>
      </section>

      <!-- Details -->
      <section class="card mb-3" aria-labelledby="det-h">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <h2 id="det-h" class="h3 mb-0">Details</h2>
            <SjButton v-if="!editing" variant="secondary" size="sm" @click="startEdit"
              >Edit</SjButton
            >
          </div>
          <form v-if="editing" novalidate @submit.prevent="saveDetails">
            <OperatorFields v-model:form="form" :errors="formErrors" />
            <div class="d-flex gap-2">
              <SjButton type="submit" :loading="busy === 'details'" loading-label="Saving…"
                >Save details</SjButton
              >
              <SjButton variant="ghost" @click="editing = false">Cancel</SjButton>
            </div>
          </form>
          <dl v-else class="sj-dl mb-0">
            <dt>NSOP permit no.</dt>
            <dd>{{ op.nsopNo || '—' }}</dd>
            <dt>Bases</dt>
            <dd>{{ op.bases.map(airportLabel).join(', ') || '—' }}</dd>
            <dt>CIN / GSTIN</dt>
            <dd>{{ op.cin || '—' }} / {{ op.gstin || '—' }}</dd>
            <dt>Website</dt>
            <dd>
              <a v-if="op.website" :href="op.website" target="_blank" rel="noopener">{{
                op.website
              }}</a><template v-else>—</template>
            </dd>
            <dt>Safety disclosure</dt>
            <dd>
              <a
                v-if="op.safetyDisclosureUrl"
                :href="op.safetyDisclosureUrl"
                target="_blank"
                rel="noopener"
                >Open page</a
              ><template v-else>—</template>
            </dd>
            <dt>DGCA rank</dt>
            <dd>
              {{ op.dgcaRank ?? '—'
              }}<template v-if="op.dgcaRankCheckedOn">
                (checked {{ formatDate(op.dgcaRankCheckedOn) }})</template
              >
            </dd>
            <dt>Track record</dt>
            <dd>
              {{ op.weddingsDone }} weddings flown<template v-if="op.avgReplyHours !== null">
                · replies in ~{{ op.avgReplyHours }} h</template
              >
            </dd>
            <dt>Cancellation terms</dt>
            <dd class="sj-pre">{{ op.cancellationTerms || '—' }}</dd>
            <template v-if="op.notes">
              <dt>Notes</dt>
              <dd class="sj-pre">{{ op.notes }}</dd>
            </template>
          </dl>
        </div>
      </section>

      <!-- Bank -->
      <section class="card mb-3" aria-labelledby="bank-h">
        <div class="card-body">
          <h2 id="bank-h" class="h3">Bank details (for paying the operator)</h2>
          <form v-if="bankOpen" novalidate @submit.prevent="saveBank">
            <BankFields v-model:form="bankForm" :errors="bankErrors" />
            <div class="d-flex gap-2">
              <SjButton type="submit" :loading="busy === 'bank'" loading-label="Saving…"
                >Save bank details</SjButton
              >
              <SjButton variant="ghost" @click="bankOpen = false">Cancel</SjButton>
            </div>
          </form>
          <div v-else class="d-flex align-items-center gap-2 flex-wrap">
            <span class="flex-fill">{{ op.bankHint ?? 'Not added yet' }}</span>
            <SjButton
              variant="secondary"
              size="sm"
              :loading="busy === 'bank-open'"
              loading-label="Opening…"
              @click="openBank"
            >
              {{ op.hasBankDetails ? 'View or change' : 'Add bank details' }}
            </SjButton>
          </div>
          <p class="text-secondary small mt-2 mb-0">
            Stored encrypted. Never shown to partners or clients.
          </p>
        </div>
      </section>

      <div class="sj-actionbar">
        <SjButton
          v-if="op.status === 'FOUND' && op.readyToVerify"
          block
          :loading="busy === 'verify'"
          loading-label="Verifying…"
          @click="
            act(
              'verify',
              () => api(`/operators/${id}/verify`, { method: 'POST' }),
              `${name} is verified`,
            )
          "
        >
          Mark as verified
        </SjButton>
        <SjButton
          v-else
          block
          @click="
            openUpload(
              op.checklist.find((c) => !c.done && c.key.startsWith('insurance'))
                ? 'INSURANCE'
                : 'NSOP',
            )
          "
        >
          Upload document
        </SjButton>
      </div>
    </template>

    <!-- Sheets -->
    <SjSheet :open="docSheet" title="Upload a document" @close="docSheet = false">
      <form novalidate @submit.prevent="upload">
        <div class="mb-3">
          <label class="form-label" for="doc-kind">What is it?</label>
          <select id="doc-kind" v-model="doc.kind" class="form-select">
            <option v-for="(label, k) in DOC_KIND_LABELS" :key="k" :value="k">{{ label }}</option>
          </select>
        </div>
        <div class="mb-3">
          <label class="form-label" for="doc-exp"
            >Expiry date
            <span v-if="doc.kind === 'OPERATOR_AGREEMENT'" class="text-secondary fw-normal"
              >(optional)</span
            ></label
          >
          <input
            id="doc-exp"
            v-model="doc.expiresOn"
            type="date"
            class="form-control"
            :class="{ 'is-invalid': docErrors.expiresOn }"
          />
          <div v-if="docErrors.expiresOn" class="invalid-feedback d-block">
            {{ docErrors.expiresOn }}
          </div>
        </div>
        <div class="mb-3">
          <label class="form-label" for="doc-file">File</label>
          <input
            id="doc-file"
            type="file"
            accept="application/pdf,image/png,image/jpeg,image/webp"
            capture="environment"
            class="form-control"
            :class="{ 'is-invalid': docErrors.file }"
            @change="doc.file = ($event.target as HTMLInputElement).files?.[0] ?? null"
          />
          <div v-if="docErrors.file" class="invalid-feedback d-block">{{ docErrors.file }}</div>
          <div v-else class="form-hint">PDF or a photo, up to 15 MB</div>
        </div>
        <SjButton type="submit" block :loading="busy === 'upload'" loading-label="Uploading…"
          >Upload</SjButton
        >
      </form>
    </SjSheet>

    <SjSheet :open="blockSheet" :title="`Block ${name}?`" @close="blockSheet = false">
      <form novalidate @submit.prevent="block">
        <p class="text-secondary">
          Blocked operators can't be chosen for any leg or quote until you unblock them.
        </p>
        <SjField v-model="blockReason" label="Reason" placeholder="e.g. Late twice this season" />
        <SjButton
          type="submit"
          variant="danger"
          block
          :loading="busy === 'block'"
          loading-label="Blocking…"
          :disabled-reason="blockReason.trim().length < 3 ? 'Say briefly why' : null"
        >
          Block operator
        </SjButton>
      </form>
    </SjSheet>

    <SjSheet
      :open="acSheet"
      :title="ac.id ? 'Edit aircraft' : 'Add aircraft'"
      @close="acSheet = false"
    >
      <form novalidate @submit.prevent="saveAircraft">
        <SjField
          v-model="ac.type"
          label="Type"
          placeholder="e.g. Citation XLS"
          :server-error="acErrors.type"
        />
        <SjField
          v-model="ac.registration"
          label="Registration"
          optional
          uppercase
          placeholder="VT-…"
          :server-error="acErrors.registration"
        />
        <div class="mb-3">
          <label class="form-label" for="ac-cat">Category</label>
          <select
            id="ac-cat"
            v-model="ac.category"
            class="form-select"
            :class="{ 'is-invalid': acErrors.category }"
          >
            <option v-for="c in AIRCRAFT_CATEGORIES" :key="c" :value="c">
              {{ CATEGORY_LABELS[c] }}
            </option>
          </select>
          <div v-if="acErrors.category" class="invalid-feedback d-block">
            {{ acErrors.category }}
          </div>
        </div>
        <div class="d-flex gap-2">
          <div class="flex-fill">
            <SjField
              v-model="ac.seats"
              label="Passenger seats"
              inputmode="numeric"
              :server-error="acErrors.seats"
            />
          </div>
          <div class="flex-fill">
            <SjField
              v-model="ac.year"
              label="Year"
              optional
              inputmode="numeric"
              :server-error="acErrors.year"
            />
          </div>
        </div>
        <div class="mb-3">
          <label class="form-label" for="ac-base">Based at</label>
          <select id="ac-base" v-model="ac.baseAirport" class="form-select">
            <option value="">Not set</option>
            <option v-for="a in airports" :key="a.iata" :value="a.iata">
              {{ a.city }} ({{ a.iata }})
            </option>
          </select>
        </div>
        <SjButton type="submit" block :loading="busy === 'aircraft'" loading-label="Saving…">{{
          ac.id ? 'Save aircraft' : 'Add aircraft'
        }}</SjButton>
      </form>
    </SjSheet>

    <SjSheet
      :open="ctSheet"
      :title="ct.id ? 'Edit contact' : 'Add contact'"
      @close="ctSheet = false"
    >
      <form novalidate @submit.prevent="saveContact">
        <SjField v-model="ct.name" label="Name" :server-error="ctErrors.name" />
        <SjField
          v-model="ct.role"
          label="Role"
          optional
          placeholder="e.g. Charter sales"
          :server-error="ctErrors.role"
        />
        <SjField
          v-model="ct.phone"
          label="Phone (WhatsApp)"
          optional
          type="tel"
          inputmode="tel"
          :server-error="ctErrors.phone"
        />
        <SjField
          v-model="ct.email"
          label="Email"
          optional
          type="email"
          inputmode="email"
          :server-error="ctErrors.email"
        />
        <label class="form-check mb-3">
          <input v-model="ct.isPrimary" class="form-check-input" type="checkbox" />
          <span class="form-check-label">Main contact for rate requests</span>
        </label>
        <div class="d-flex gap-2">
          <SjButton
            type="submit"
            class="flex-fill"
            :loading="busy === 'contact'"
            loading-label="Saving…"
            >{{ ct.id ? 'Save contact' : 'Add contact' }}</SjButton
          >
          <SjButton
            v-if="ct.id"
            variant="ghost"
            @click="
              ((ctSheet = false), (removeCt = op?.contacts.find((x) => x.id === ct.id) ?? null))
            "
            >Remove</SjButton
          >
        </div>
      </form>
    </SjSheet>

    <SjConfirm
      :open="!!deleteDoc"
      :title="`Delete this ${deleteDoc ? DOC_KIND_LABELS[deleteDoc.kind].toLowerCase() : 'document'}?`"
      body="The file is deleted for good. If it was verified, the operator may stop being quotable until a replacement is verified."
      confirm-label="Delete document"
      :busy="busy === 'delete-doc'"
      @confirm="
        act(
          'delete-doc',
          () => api(`/operator-documents/${deleteDoc!.id}`, { method: 'DELETE' }),
          'Document deleted',
        ).then(() => (deleteDoc = null))
      "
      @cancel="deleteDoc = null"
    />
    <SjConfirm
      :open="!!removeAc"
      :title="`Remove ${removeAc?.type ?? 'aircraft'}?`"
      body="It stops showing for new legs. Past rate replies that mention it are kept."
      confirm-label="Remove aircraft"
      :busy="busy === 'remove-ac'"
      @confirm="
        act(
          'remove-ac',
          () => api(`/aircraft/${removeAc!.id}`, { method: 'DELETE' }),
          'Aircraft removed',
        ).then(() => (removeAc = null))
      "
      @cancel="removeAc = null"
    />
    <SjConfirm
      :open="!!removeCt"
      :title="`Remove ${removeCt?.name ?? 'contact'}?`"
      body="The contact is removed from this operator."
      confirm-label="Remove contact"
      :busy="busy === 'remove-ct'"
      @confirm="
        act(
          'remove-ct',
          () => api(`/operator-contacts/${removeCt!.id}`, { method: 'DELETE' }),
          'Contact removed',
        ).then(() => (removeCt = null))
      "
      @cancel="removeCt = null"
    />
  </div>
</template>

<style scoped>
.sj-row {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 10px 0;
  border-top: 1px solid #eceef2;
}
.sj-row:first-of-type {
  border-top: 0;
}
.sj-row__main {
  flex: 1;
  text-align: left;
  background: none;
  border: 0;
  padding: 4px 0;
  min-height: 44px;
  cursor: pointer;
  border-radius: 8px;
}
.sj-row__main:hover {
  background: #f6f7f9;
}
.sj-dl {
  display: grid;
  grid-template-columns: minmax(110px, 35%) 1fr;
  gap: 6px 12px;
}
.sj-dl dt {
  font-weight: 600;
  color: #5b6170;
}
.sj-dl dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.sj-pre {
  white-space: pre-line;
}
a.sj-btn {
  text-decoration: none;
}
</style>
