<script setup lang="ts">
import { formatDate, formatDayMonth, parseGuestLines } from '@shubhjets/shared';
import { computed, onMounted, reactive, ref } from 'vue';
import { api, ApiError } from '../../api/client';
import { useAirports } from '../../composables/airports';
import { useToast } from '../../composables/toast';
import type { WeddingDetail } from '../../composables/weddings';
import SjButton from '../SjButton.vue';
import SjConfirm from '../SjConfirm.vue';
import SjField from '../SjField.vue';
import SjSheet from '../SjSheet.vue';
import SjSkeleton from '../SjSkeleton.vue';

interface GuestRow {
  id: string;
  name: string;
  phone: string | null;
  idReceived: boolean;
  hasIdFile: boolean;
  idDeletedAt: string | null;
}
interface LegManifest {
  legId: string;
  seq: number;
  from: string;
  to: string;
  date: string;
  pax: number;
  status: string;
  count: number;
  idsReceived: number;
  guests: GuestRow[];
}
interface Manifest {
  idsDueOn: string | null;
  idsDeletedOn: string | null;
  legs: LegManifest[];
}

/**
 * The Guests tab (BRIEF.md §2 step 7): names per leg, pasted from WhatsApp, and each guest's ID:
 * received or not, and the photo or PDF (encrypted, opened through logged links, deleted
 * automatically after the wedding).
 */
const props = defineProps<{ wedding: WeddingDetail }>();
const toast = useToast();
const { label: airportLabel } = useAirports();
const data = ref<Manifest | null>(null);
const busy = ref<string | null>(null);

async function load() {
  try {
    data.value = await api<Manifest>(`/weddings/${props.wedding.id}/guests`);
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : "Couldn't load the guests");
  }
}
onMounted(load);

const missingIds = computed(() =>
  (data.value?.legs ?? []).reduce((s, l) => s + (l.count - l.idsReceived), 0),
);

// ---------- Adding ----------
const addFor = ref<LegManifest | null>(null);
const pasted = ref('');
const preview = computed(() => parseGuestLines(pasted.value));
async function add() {
  if (!addFor.value) return;
  busy.value = 'add';
  try {
    const r = await api<{ added: number; skipped: string[]; warning: string | null }>(
      `/legs/${addFor.value.legId}/guests`,
      { method: 'POST', json: { text: pasted.value } },
    );
    toast.success(
      `${r.added} guest${r.added === 1 ? '' : 's'} added${r.skipped.length ? `; ${r.skipped.length} already there` : ''}`,
    );
    if (r.warning) toast.show({ tone: 'info', message: r.warning });
    addFor.value = null;
    pasted.value = '';
    await load();
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : "Couldn't add the guests");
  } finally {
    busy.value = null;
  }
}
async function copy(to: LegManifest, from: LegManifest) {
  busy.value = `copy-${to.legId}`;
  try {
    const r = await api<{ added: number; warning: string | null }>(
      `/legs/${to.legId}/guests/copy-from/${from.legId}`,
      { method: 'POST' },
    );
    toast.success(`${r.added} guest${r.added === 1 ? '' : 's'} copied from leg ${from.seq}`);
    if (r.warning) toast.show({ tone: 'info', message: r.warning });
    await load();
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : "Couldn't copy the guests");
  } finally {
    busy.value = null;
  }
}
const copySource = (l: LegManifest) =>
  data.value?.legs.find((x) => x.legId !== l.legId && x.count > 0) ?? null;

// ---------- One guest ----------
const open = ref<GuestRow | null>(null);
const edit = reactive({ name: '', phone: '' });
const errors = ref<Record<string, string>>({});
const fileInput = ref<HTMLInputElement | null>(null);
const removeOpen = ref(false);
function openGuest(g: GuestRow) {
  open.value = g;
  edit.name = g.name;
  edit.phone = g.phone ?? '';
  errors.value = {};
}
async function refreshOpen() {
  await load();
  const id = open.value?.id;
  open.value = data.value?.legs.flatMap((l) => l.guests).find((g) => g.id === id) ?? null;
}
async function saveGuest() {
  if (!open.value) return;
  busy.value = 'save';
  errors.value = {};
  try {
    await api(`/guests/${open.value.id}`, {
      method: 'PATCH',
      json: { name: edit.name, phone: edit.phone },
    });
    toast.success('Saved');
    await refreshOpen();
  } catch (e) {
    if (e instanceof ApiError && Object.keys(e.fields).length) errors.value = e.fields;
    else toast.error(e instanceof ApiError ? e.message : "Couldn't save");
  } finally {
    busy.value = null;
  }
}
async function setReceived(v: boolean) {
  if (!open.value) return;
  const g = open.value;
  g.idReceived = v; // instant; rolled back on error
  try {
    await api(`/guests/${g.id}`, { method: 'PATCH', json: { idReceived: v } });
    await load();
  } catch (e) {
    g.idReceived = !v;
    toast.error(e instanceof ApiError ? e.message : "Couldn't save");
  }
}
async function onIdFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0];
  (e.target as HTMLInputElement).value = '';
  if (!f || !open.value) return;
  busy.value = 'upload';
  try {
    const body = new FormData();
    body.append('file', f);
    await api(`/guests/${open.value.id}/id-document`, { method: 'POST', body });
    toast.success('ID saved (encrypted)');
    await refreshOpen();
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : "Couldn't upload the ID");
  } finally {
    busy.value = null;
  }
}
async function viewId() {
  if (!open.value) return;
  const tab = window.open('', '_blank');
  try {
    const link = await api<{ url: string }>(`/guests/${open.value.id}/id-document/link`, {
      method: 'POST',
    });
    if (tab) tab.location.href = link.url;
  } catch (e) {
    tab?.close();
    toast.error(e instanceof ApiError ? e.message : "Couldn't open the ID");
  }
}
async function deleteId() {
  if (!open.value) return;
  busy.value = 'del-id';
  try {
    await api(`/guests/${open.value.id}/id-document`, { method: 'DELETE' });
    toast.success('ID file deleted; “ID received” is kept');
    await refreshOpen();
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : "Couldn't delete the ID");
  } finally {
    busy.value = null;
  }
}
async function removeGuest() {
  if (!open.value) return;
  busy.value = 'remove';
  try {
    await api(`/guests/${open.value.id}`, { method: 'DELETE' });
    toast.success(`${open.value.name} removed`);
    removeOpen.value = false;
    open.value = null;
    await load();
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : "Couldn't remove the guest");
  } finally {
    busy.value = null;
  }
}
</script>

<template>
  <div>
    <SjSkeleton v-if="!data" :lines="4" height="4rem" />
    <template v-else>
      <section class="card mb-3">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-start gap-2">
            <div>
              <h2 class="h3 mb-1">Guest IDs</h2>
              <div v-if="data.idsDueOn" class="small">
                Due by <b>{{ formatDate(data.idsDueOn) }}</b>
              </div>
            </div>
            <span class="sj-badge" :class="missingIds ? 'sj-badge--warn' : 'sj-badge--ok'">
              {{ missingIds ? `${missingIds} missing` : '✓ All in' }}
            </span>
          </div>
          <p v-if="data.idsDeletedOn" class="small text-secondary mb-0 mt-1">
            🔒 ID files are encrypted and deleted automatically on
            {{ formatDate(data.idsDeletedOn) }}.
          </p>
        </div>
      </section>

      <section
        v-for="l in data.legs"
        :key="l.legId"
        class="card mb-3"
        :aria-label="`Leg ${l.seq} guests`"
      >
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-start gap-2">
            <div class="min-w-0">
              <h3 class="h4 mb-0">
                Leg {{ l.seq }}: {{ airportLabel(l.from) }} → {{ airportLabel(l.to) }}
              </h3>
              <div class="small text-secondary">
                {{ formatDayMonth(l.date) }} ·
                <span :class="l.count > l.pax ? 'text-danger fw-bold' : ''"
                  >{{ l.count }} of {{ l.pax }} guests</span
                >
                · IDs {{ l.idsReceived }}/{{ l.count }}
              </div>
            </div>
          </div>
          <p v-if="!l.count" class="small text-secondary mt-2 mb-2">
            No guests yet. Paste the list the planner sent.
          </p>
          <ul v-else class="sj-guests">
            <li v-for="g in l.guests" :key="g.id">
              <button type="button" class="sj-guest" @click="openGuest(g)">
                <span class="min-w-0">
                  <span class="d-block fw-bold text-truncate">{{ g.name }}</span>
                  <span v-if="g.phone" class="small text-secondary">{{ g.phone }}</span>
                </span>
                <span
                  class="sj-id"
                  :class="
                    g.hasIdFile ? 'sj-id--file' : g.idReceived ? 'sj-id--ok' : 'sj-id--missing'
                  "
                >
                  {{ g.hasIdFile ? '🔒 ID file' : g.idReceived ? '✓ ID' : 'No ID' }}
                </span>
              </button>
            </li>
          </ul>
          <div class="d-flex flex-wrap gap-2 mt-2">
            <SjButton size="sm" variant="secondary" @click="((addFor = l), (pasted = ''))"
              >Add guests</SjButton
            >
            <SjButton
              v-if="copySource(l)"
              size="sm"
              variant="ghost"
              :loading="busy === `copy-${l.legId}`"
              loading-label="Copying…"
              @click="copy(l, copySource(l)!)"
            >
              Copy from leg {{ copySource(l)!.seq }}
            </SjButton>
          </div>
        </div>
      </section>
    </template>

    <SjSheet
      :open="!!addFor"
      :title="`Add guests to leg ${addFor?.seq ?? ''}`"
      @close="addFor = null"
    >
      <label class="form-label" for="g-paste">Names, one per line</label>
      <textarea
        id="g-paste"
        v-model="pasted"
        class="form-control"
        rows="8"
        placeholder="Paste from WhatsApp, e.g.&#10;1. Asha Mehta, +91 98100 00001&#10;2. Rohan Mehta"
      />
      <p class="small text-secondary mt-1">
        {{ preview.length }} name{{ preview.length === 1 ? '' : 's' }} found<template
          v-if="preview.some((g) => g.phone)"
          >, {{ preview.filter((g) => g.phone).length }} with phones</template
        >. Names already on this leg are skipped.
      </p>
      <SjButton
        block
        :loading="busy === 'add'"
        loading-label="Adding…"
        :disabled-reason="preview.length ? null : 'Paste at least one name'"
        @click="add"
      >
        Add {{ preview.length || '' }} guest{{ preview.length === 1 ? '' : 's' }}
      </SjButton>
    </SjSheet>

    <SjSheet :open="!!open" :title="open?.name ?? 'Guest'" @close="open = null">
      <template v-if="open">
        <SjField v-model="edit.name" label="Name" :maxlength="120" :server-error="errors.name" />
        <SjField
          v-model="edit.phone"
          label="Phone"
          optional
          inputmode="tel"
          :server-error="errors.phone"
        />
        <SjButton
          size="sm"
          variant="secondary"
          class="mb-3"
          :loading="busy === 'save'"
          loading-label="Saving…"
          :disabled-reason="
            edit.name === open.name && edit.phone === (open.phone ?? '') ? 'No changes' : null
          "
          @click="saveGuest"
        >
          Save name and phone
        </SjButton>

        <div class="sj-idbox">
          <div class="fw-bold mb-1">Government photo ID</div>
          <label class="form-check mb-2">
            <input
              type="checkbox"
              class="form-check-input"
              :checked="open.idReceived"
              :disabled="open.hasIdFile"
              @change="setReceived(($event.target as HTMLInputElement).checked)"
            />
            <span class="form-check-label">ID received (details checked)</span>
          </label>
          <div class="d-flex flex-wrap gap-2">
            <SjButton
              size="sm"
              :loading="busy === 'upload'"
              loading-label="Encrypting…"
              @click="fileInput?.click()"
            >
              {{ open.hasIdFile ? 'Replace ID photo' : 'Add ID photo or PDF' }}
            </SjButton>
            <SjButton v-if="open.hasIdFile" size="sm" variant="secondary" @click="viewId"
              >View ID</SjButton
            >
            <SjButton
              v-if="open.hasIdFile"
              size="sm"
              variant="ghost"
              :loading="busy === 'del-id'"
              loading-label="Deleting…"
              @click="deleteId"
            >
              Delete ID file
            </SjButton>
          </div>
          <input
            ref="fileInput"
            type="file"
            class="d-none"
            accept="image/*,application/pdf"
            capture="environment"
            @change="onIdFile"
          />
          <p class="small text-secondary mt-2 mb-0">
            Stored encrypted; every viewing is logged<template v-if="data?.idsDeletedOn"
              >; deleted on {{ formatDate(data.idsDeletedOn) }}</template
            >.
            <template v-if="open.idDeletedAt">
              The file was deleted {{ formatDate(open.idDeletedAt.slice(0, 10)) }}.</template
            >
          </p>
        </div>
        <p class="text-center mt-3 mb-0">
          <SjButton variant="ghost" size="sm" @click="removeOpen = true">Remove guest</SjButton>
        </p>
      </template>
    </SjSheet>

    <SjConfirm
      :open="removeOpen"
      :title="`Remove ${open?.name ?? 'this guest'}?`"
      body="They are taken off this leg, and their ID file (if any) is deleted for good."
      confirm-label="Remove guest"
      :busy="busy === 'remove'"
      @confirm="removeGuest"
      @cancel="removeOpen = false"
    />
  </div>
</template>

<style scoped>
.min-w-0 {
  min-width: 0;
}
.sj-guests {
  list-style: none;
  padding: 0;
  margin: 8px 0 0;
}
.sj-guest {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 48px;
  padding: 6px 4px;
  border: 0;
  border-top: 1px solid #eceef2;
  background: none;
  text-align: left;
  transition: background-color var(--sj-fast);
}
.sj-guest:hover {
  background: #f8f6f1;
}
.sj-guest:active {
  transform: scale(0.99);
}
.sj-id {
  flex: 0 0 auto;
  font-size: 0.75rem;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 999px;
}
.sj-id--ok {
  background: #dcf2e4;
  color: #145c36;
}
.sj-id--file {
  background: #e5ebf7;
  color: #1d3b72;
}
.sj-id--missing {
  background: #fff1e0;
  color: #7a4a00;
}
.sj-idbox {
  background: #f6f7f9;
  border-radius: 10px;
  padding: 10px 12px;
}
.sj-badge--ok {
  background: #dcf2e4;
  color: #145c36;
}
</style>
