<script setup lang="ts">
import {
  ACTIVITY_LABELS,
  PARTNER_STATUSES,
  PARTNER_STATUS_LABELS,
  PARTNER_TYPE_LABELS,
  formatDate,
  formatDateTime,
  formatINR,
  type ActivityKind,
  type PartnerStatus,
} from '@shubhjets/shared';
import { onMounted, ref } from 'vue';
import AgreementCard from '../../components/AgreementCard.vue';
import { useRoute } from 'vue-router';
import { api, ApiError } from '../../api/client';
import ConsentPanel from '../../components/ConsentPanel.vue';
import SjButton from '../../components/SjButton.vue';
import SjConfirm from '../../components/SjConfirm.vue';
import SjField from '../../components/SjField.vue';
import SjSheet from '../../components/SjSheet.vue';
import SjSkeleton from '../../components/SjSkeleton.vue';
import PartnerFields from '../../components/partner/PartnerFields.vue';
import PartnerStatusBadge from '../../components/partner/PartnerStatusBadge.vue';
import { newPartnerForm, partnerBody } from '../../composables/partnerForm';
import {
  commissionText,
  waLink,
  type ActivityResult,
  type PartnerDetail,
} from '../../composables/partners';
import { useToast } from '../../composables/toast';

const route = useRoute();
const toast = useToast();
const id = String(route.params.id);
const p = ref<PartnerDetail | null>(null);
const busy = ref<string | null>(null);

async function load() {
  try {
    p.value = await api<PartnerDetail>(`/partners/${id}`);
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : "Couldn't load this partner");
  }
}
onMounted(load);

// ---------- Activities ----------
const actSheet = ref(false);
const act = ref({ kind: 'CALLED' as ActivityKind, note: '', nextFollowUpOn: '' });

function openActivity(kind: ActivityKind) {
  act.value = { kind, note: '', nextFollowUpOn: p.value?.nextFollowUpOn ?? '' };
  actSheet.value = true;
}

async function logActivity() {
  busy.value = 'activity';
  try {
    const res = await api<ActivityResult>(`/partners/${id}/activities`, {
      method: 'POST',
      json: {
        kind: act.value.kind,
        note: act.value.note,
        nextFollowUpOn: act.value.nextFollowUpOn,
      },
    });
    actSheet.value = false;
    await load();
    toast.success(`${ACTIVITY_LABELS[act.value.kind]} logged`, async () => {
      await api(`/partner-activities/${res.activityId}`, {
        method: 'DELETE',
        json: { restoreStatus: res.undo.status, restoreFollowUpOn: res.undo.nextFollowUpOn ?? '' },
      });
      await load();
      toast.success('Undone');
    });
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : "Couldn't log that");
  } finally {
    busy.value = null;
  }
}

// ---------- Status ----------
async function setStatus(status: PartnerStatus) {
  if (!p.value || p.value.status === status) return;
  const before = p.value.status;
  p.value.status = status; // optimistic
  try {
    await api(`/partners/${id}`, { method: 'PATCH', json: { status } });
    toast.success(`Now: ${PARTNER_STATUS_LABELS[status]}`, async () => {
      await api(`/partners/${id}`, { method: 'PATCH', json: { status: before } });
      if (p.value) p.value.status = before;
      toast.success('Undone');
    });
  } catch (e) {
    p.value.status = before;
    toast.error(e instanceof ApiError ? e.message : "Couldn't change the status");
  }
}

// ---------- Details ----------
const editing = ref(false);
const form = ref(newPartnerForm());
const errors = ref<Record<string, string>>({});
function startEdit() {
  form.value = newPartnerForm(p.value);
  errors.value = {};
  editing.value = true;
}
async function saveDetails() {
  errors.value = {};
  let body;
  try {
    body = partnerBody(form.value);
  } catch (e) {
    errors.value = (e as { fields: Record<string, string> }).fields;
    return;
  }
  busy.value = 'details';
  try {
    p.value = await api<PartnerDetail>(`/partners/${id}`, { method: 'PATCH', json: body });
    editing.value = false;
    toast.success('Saved');
  } catch (e) {
    if (e instanceof ApiError && Object.keys(e.fields).length) {
      errors.value = e.fields;
      toast.error('Please fix the highlighted fields');
    } else toast.error(e instanceof ApiError ? e.message : "Couldn't save");
  } finally {
    busy.value = null;
  }
}

// ---------- Referral agreement ----------
const fileInput = ref<HTMLInputElement | null>(null);
const removeReferral = ref(false);
async function uploadReferral(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const body = new FormData();
  body.append('file', file);
  busy.value = 'referral';
  try {
    p.value = await api<PartnerDetail>(`/partners/${id}/referral-agreement`, {
      method: 'POST',
      body,
    });
    toast.success('Signed referral agreement saved');
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : "Couldn't upload the agreement");
  } finally {
    busy.value = null;
    if (fileInput.value) fileInput.value.value = '';
  }
}
async function openReferral() {
  if (!p.value?.referralFileId) return;
  const tab = window.open('', '_blank');
  try {
    const link = await api<{ url: string }>(`/files/${p.value.referralFileId}/link`, {
      method: 'POST',
    });
    if (tab) tab.location.href = link.url;
    else window.location.href = link.url;
  } catch (e) {
    tab?.close();
    toast.error(e instanceof ApiError ? e.message : "Couldn't open the file");
  }
}
async function doRemoveReferral() {
  busy.value = 'remove-referral';
  try {
    p.value = await api<PartnerDetail>(`/partners/${id}/referral-agreement`, { method: 'DELETE' });
    toast.success('Agreement removed');
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : "Couldn't remove the agreement");
  } finally {
    busy.value = null;
    removeReferral.value = false;
  }
}
</script>

<template>
  <div>
    <RouterLink to="/partners" class="d-inline-block mb-2">‹ Partners</RouterLink>
    <SjSkeleton v-if="!p" :lines="8" height="3rem" />
    <template v-else>
      <div class="d-flex align-items-center gap-2 flex-wrap mb-1">
        <h1 class="page-title mb-0">{{ p.firm }}</h1>
        <PartnerStatusBadge :status="p.status" />
      </div>
      <div class="text-secondary small mb-2">
        {{ PARTNER_TYPE_LABELS[p.type] }}<template v-if="p.city"> · {{ p.city }}</template>
        <template v-if="p.contactPerson"> · {{ p.contactPerson }}</template>
      </div>
      <div v-if="p.duplicates.length" class="alert alert-warning py-2">
        Possible duplicate of
        <template v-for="(d, i) in p.duplicates" :key="d.id">
          <RouterLink :to="`/partners/${d.id}`">{{ d.firm }}</RouterLink> (same
          {{ d.matchedOn.join(', ') }})<template v-if="i < p.duplicates.length - 1">, </template>
        </template>
      </div>
      <div class="d-flex gap-2 flex-wrap mb-3">
        <a v-if="p.phone" :href="`tel:${p.phone}`" class="sj-btn sj-btn--secondary sj-btn--sm"
          >📞 Call</a
        >
        <a
          v-if="p.phone"
          :href="waLink(p.phone)"
          target="_blank"
          rel="noopener"
          class="sj-btn sj-btn--secondary sj-btn--sm"
          >💬 WhatsApp</a
        >
        <a v-if="p.email" :href="`mailto:${p.email}`" class="sj-btn sj-btn--secondary sj-btn--sm"
          >✉ Email</a
        >
        <a
          v-if="p.instagram"
          :href="`https://instagram.com/${p.instagram.replace(/^@/, '')}`"
          target="_blank"
          rel="noopener"
          class="sj-btn sj-btn--secondary sj-btn--sm"
          >Instagram</a
        >
      </div>

      <!-- Money and season -->
      <section class="card mb-3" aria-labelledby="money-h">
        <div class="card-body">
          <h2 id="money-h" class="h3">This season</h2>
          <div class="sj-stats">
            <div>
              <span class="sj-stat">{{ p.stats.weddingsThisSeason }}</span><span
                class="small text-secondary"
                >weddings</span
              >
            </div>
            <div>
              <span class="sj-stat">{{
                formatINR(p.stats.bookingsValue, { paise: 'never' })
              }}</span><span class="small text-secondary">booked</span>
            </div>
            <div>
              <span class="sj-stat">{{
                formatINR(p.stats.commissionOwed, { paise: 'never' })
              }}</span><span class="small text-secondary">commission owed</span>
            </div>
          </div>
          <p class="small text-secondary mt-2 mb-0">
            Commission: {{ commissionText(p.commissionBasis, p.commissionBps) }} · earned
            {{ formatINR(p.stats.commissionEarned, { paise: 'never' }) }}, paid
            {{ formatINR(p.stats.commissionPaid, { paise: 'never' }) }}
          </p>
        </div>
      </section>

      <!-- Pipeline -->
      <section class="card mb-3" aria-labelledby="pipe-h">
        <div class="card-body">
          <h2 id="pipe-h" class="h3">Pipeline</h2>
          <div class="d-flex gap-2 flex-wrap mb-3" role="radiogroup" aria-label="Stage">
            <button
              v-for="s in PARTNER_STATUSES"
              :key="s"
              type="button"
              role="radio"
              class="sj-chip"
              :class="{ 'is-active': p.status === s }"
              :aria-checked="p.status === s"
              @click="setStatus(s)"
            >
              {{ PARTNER_STATUS_LABELS[s] }}
            </button>
          </div>
          <div class="small mb-2" :class="{ 'text-warning-emphasis fw-bold': p.followUpDue }">
            Next follow-up: {{ p.nextFollowUpOn ? formatDate(p.nextFollowUpOn) : 'not set'
            }}<template v-if="p.followUpDue"> (due)</template>
          </div>
          <div class="d-flex gap-1 flex-wrap mb-3">
            <SjButton
              v-for="(label, k) in ACTIVITY_LABELS"
              :key="k"
              variant="secondary"
              size="sm"
              @click="openActivity(k)"
              >{{ label }}</SjButton
            >
          </div>
          <p v-if="!p.activities.length" class="text-secondary mb-0">Nothing logged yet.</p>
          <ul v-else class="list-unstyled mb-0">
            <li v-for="a in p.activities" :key="a.id" class="py-1 border-top">
              <span class="fw-bold">{{ ACTIVITY_LABELS[a.kind] }}</span>
              <span class="text-secondary small"> · {{ formatDateTime(new Date(a.at)) }}</span>
              <span v-if="a.note" class="d-block small">{{ a.note }}</span>
            </li>
          </ul>
        </div>
      </section>

      <!-- Referral agreement -->
      <AgreementCard
        kind="REFERRAL_AGREEMENT"
        :subject-id="p.id"
        :subject-name="p.firm"
        @changed="load"
      />

      <section class="card mb-3" aria-labelledby="ref-h">
        <div class="card-body">
          <h2 id="ref-h" class="h3">Referral agreement status</h2>
          <p class="small text-secondary mb-2">Signed one outside the app? Upload it here.</p>
          <p class="mb-2" :class="p.referralSigned ? 'text-success' : 'text-warning-emphasis'">
            {{ p.referralSigned ? '✓ Signed copy saved' : '⚠ Not signed yet' }}
          </p>
          <div class="d-flex gap-2 flex-wrap">
            <input
              ref="fileInput"
              type="file"
              accept="application/pdf,image/png,image/jpeg"
              class="visually-hidden"
              @change="uploadReferral"
            />
            <SjButton v-if="p.referralFileId" variant="secondary" size="sm" @click="openReferral"
              >Open signed copy</SjButton
            >
            <SjButton
              variant="secondary"
              size="sm"
              :loading="busy === 'referral'"
              loading-label="Uploading…"
              @click="fileInput?.click()"
            >
              {{ p.referralFileId ? 'Replace signed copy' : 'Upload signed copy' }}
            </SjButton>
            <SjButton
              v-if="p.referralFileId"
              variant="ghost"
              size="sm"
              @click="removeReferral = true"
              >Remove</SjButton
            >
          </div>
          <p class="text-secondary small mt-2 mb-0">
            The app will generate the agreement itself in a later step.
          </p>
        </div>
      </section>

      <!-- Weddings and clients -->
      <section class="card mb-3" aria-labelledby="w-h">
        <div class="card-body">
          <h2 id="w-h" class="h3">Weddings and clients</h2>
          <p v-if="!p.weddings.length && !p.clients.length" class="text-secondary mb-0">
            None yet.
          </p>
          <ul class="list-unstyled mb-2">
            <li v-for="w in p.weddings" :key="w.id" class="py-1">
              <span class="fw-bold">{{ w.code }}</span> · {{ w.venue_city }} ·
              {{ w.starts_on ? formatDate(w.starts_on) : '' }}
              <span class="sj-badge sj-badge--muted ms-1">{{
                w.status.replaceAll('_', ' ').toLowerCase()
              }}</span>
            </li>
          </ul>
          <ul class="list-unstyled mb-0">
            <li v-for="c in p.clients" :key="c.id" class="py-1">
              <RouterLink :to="`/clients/${c.id}`">{{ c.name }}</RouterLink>
            </li>
          </ul>
        </div>
      </section>

      <ConsentPanel
        subject-type="PARTNER"
        :subject-id="p.id"
        :consents="p.consents"
        @changed="load"
      />

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
            <PartnerFields v-model:form="form" :errors="errors" />
            <div class="d-flex gap-2">
              <SjButton type="submit" :loading="busy === 'details'" loading-label="Saving…"
                >Save details</SjButton
              >
              <SjButton variant="ghost" @click="editing = false">Cancel</SjButton>
            </div>
          </form>
          <dl v-else class="sj-dl mb-0">
            <dt>Phone</dt>
            <dd>{{ p.phone || '—' }}</dd>
            <dt>Email</dt>
            <dd>{{ p.email || '—' }}</dd>
            <dt>Website</dt>
            <dd>
              <a v-if="p.website" :href="p.website" target="_blank" rel="noopener">{{
                p.website
              }}</a><template v-else>—</template>
            </dd>
            <dt>Found at</dt>
            <dd>
              <a v-if="p.sourceLink" :href="p.sourceLink" target="_blank" rel="noopener">Open</a
              ><template v-else>—</template>
            </dd>
            <dt>Why they fit</dt>
            <dd>{{ p.fitNote || '—' }}</dd>
            <template v-if="p.notes">
              <dt>Notes</dt>
              <dd class="sj-pre">{{ p.notes }}</dd>
            </template>
          </dl>
        </div>
      </section>

      <div class="sj-actionbar">
        <SjButton block @click="openActivity('CALLED')">Log a call</SjButton>
      </div>
    </template>

    <SjSheet
      :open="actSheet"
      :title="`Log: ${ACTIVITY_LABELS[act.kind]}`"
      @close="actSheet = false"
    >
      <form novalidate @submit.prevent="logActivity">
        <div class="mb-3">
          <label class="form-label" for="act-kind">What happened</label>
          <select id="act-kind" v-model="act.kind" class="form-select">
            <option v-for="(label, k) in ACTIVITY_LABELS" :key="k" :value="k">{{ label }}</option>
          </select>
        </div>
        <SjField v-model="act.note" label="Note" optional multiline :maxlength="1000" />
        <div class="mb-3">
          <label class="form-label" for="act-fu">Next follow-up</label>
          <input
            id="act-fu"
            v-model="act.nextFollowUpOn"
            type="date"
            class="form-control"
            style="max-width: 220px"
          />
        </div>
        <SjButton type="submit" block :loading="busy === 'activity'" loading-label="Saving…"
          >Save</SjButton
        >
      </form>
    </SjSheet>
    <SjConfirm
      :open="removeReferral"
      title="Remove the signed agreement?"
      body="The file is deleted and the partner is marked as not signed."
      confirm-label="Remove"
      :busy="busy === 'remove-referral'"
      @confirm="doRemoveReferral"
      @cancel="removeReferral = false"
    />
  </div>
</template>

<style scoped>
.sj-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.sj-stats > div {
  display: flex;
  flex-direction: column;
}
.sj-stat {
  font-size: 1.15rem;
  font-weight: 700;
}
.sj-dl {
  display: grid;
  grid-template-columns: minmax(100px, 32%) 1fr;
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
