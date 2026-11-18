<script setup lang="ts">
import { DOCUMENT_STATUS_LABELS, formatDateTime } from '@shubhjets/shared';
import { computed, ref } from 'vue';
import { api, ApiError } from '../api/client';
import { openPdf, sharePdf, type DocumentRow } from '../composables/documents';
import { SHARE_CHANNELS } from '../composables/quotes';
import { useToast } from '../composables/toast';
import SjButton from './SjButton.vue';
import SjField from './SjField.vue';
import SjSheet from './SjSheet.vue';

/**
 * One generated document (agreement, invoice, rate request): its latest version, then open,
 * share or log how you sent it, and for agreements upload the signed copy.
 */
const props = defineProps<{
  title: string;
  doc: DocumentRow | null;
  /** What it says when there is nothing yet. */
  emptyText: string;
  makeLabel?: string;
  /** Why it can't be made yet (disables the button). */
  makeBlocker?: string | null;
  making?: boolean;
  signable?: boolean;
  shareText: string;
}>();
const emit = defineEmits<{ make: []; changed: [] }>();
const toast = useToast();

const latest = computed(() => props.doc?.versions[0] ?? null);
const busy = ref<string | null>(null);
const sentOpen = ref(false);
const sentChannel = ref('WHATSAPP');
const sentTo = ref('');
const fileInput = ref<HTMLInputElement | null>(null);

const statusClass = computed(() =>
  props.doc?.status === 'SIGNED'
    ? 'sj-badge--ok'
    : props.doc?.status === 'SHARED'
      ? 'sj-badge--gold'
      : 'sj-badge--muted',
);

async function open() {
  if (!props.doc) return;
  busy.value = 'open';
  try {
    await openPdf(`/documents/${props.doc.id}/pdf`);
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : "Couldn't open the PDF");
  } finally {
    busy.value = null;
  }
}

async function share() {
  if (!props.doc) return;
  busy.value = 'share';
  try {
    const r = await sharePdf(
      `/documents/${props.doc.id}/pdf`,
      `${props.title}.pdf`,
      props.shareText,
    );
    if (r === 'shared') await logSent('WEB_SHARE', null, 'Shared');
    if (r === 'downloaded') sentOpen.value = true;
  } catch (e) {
    toast.error(
      e instanceof ApiError ? e.message : "Couldn't share it. Download it and send it yourself.",
    );
  } finally {
    busy.value = null;
  }
}

async function logSent(channel: string, recipient: string | null, ok?: string) {
  if (!props.doc) return;
  busy.value = 'sent';
  try {
    await api(`/documents/${props.doc.id}/sent`, { method: 'POST', json: { channel, recipient } });
    sentOpen.value = false;
    sentTo.value = '';
    toast.success(
      ok ??
        `Marked as sent on ${SHARE_CHANNELS.find((c) => c.value === channel)?.label ?? channel}`,
    );
    emit('changed');
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : "Couldn't record it");
  } finally {
    busy.value = null;
  }
}

const signBlocker = computed(() =>
  !latest.value
    ? 'Make the agreement first'
    : latest.value.draft
      ? 'Draft: approve the template in Settings → Agreement templates, then make a new version'
      : latest.value.signed
        ? 'Already signed'
        : null,
);

async function onFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0];
  (e.target as HTMLInputElement).value = '';
  if (!f || !props.doc) return;
  busy.value = 'sign';
  try {
    const body = new FormData();
    body.append('file', f);
    await api(`/documents/${props.doc.id}/signed`, { method: 'POST', body });
    toast.success('Signed copy saved');
    emit('changed');
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : "Couldn't upload the signed copy");
  } finally {
    busy.value = null;
  }
}
async function openSigned() {
  if (!props.doc) return;
  try {
    await openPdf(`/documents/${props.doc.id}/signed`);
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : "Couldn't open the signed copy");
  }
}
</script>

<template>
  <section class="card mb-3" :aria-label="title">
    <div class="card-body">
      <div class="d-flex justify-content-between align-items-start gap-2">
        <div class="min-w-0">
          <h3 class="h4 mb-0">{{ title }}</h3>
          <div v-if="latest" class="small text-secondary">
            Version {{ latest.version }} · {{ formatDateTime(new Date(latest.createdAt)) }}
          </div>
        </div>
        <span v-if="doc" class="sj-badge" :class="statusClass">{{
          DOCUMENT_STATUS_LABELS[doc.status]
        }}</span>
      </div>

      <p v-if="!doc" class="small text-secondary mt-2 mb-2">{{ emptyText }}</p>
      <template v-else>
        <div v-if="latest?.draft" class="sj-note sj-note--draft mt-2">
          Draft: the template isn't lawyer-approved yet, so the PDF says “DRAFT – NOT FOR
          SIGNATURE”.
        </div>
        <div v-if="latest?.missing.length" class="sj-note sj-note--warn mt-2">
          Missing: {{ latest.missing.join(', ') }}. They show as red marks in the PDF.
        </div>
        <div class="d-flex flex-wrap gap-2 mt-2">
          <SjButton size="sm" :loading="busy === 'share'" loading-label="Opening…" @click="share"
            >Share</SjButton
          >
          <SjButton
            variant="secondary"
            size="sm"
            :loading="busy === 'open'"
            loading-label="Opening…"
            @click="open"
            >Open PDF</SjButton
          >
          <SjButton variant="ghost" size="sm" @click="sentOpen = true">I sent it</SjButton>
        </div>
        <div v-if="signable" class="d-flex flex-wrap gap-2 mt-2 align-items-center">
          <SjButton
            variant="secondary"
            size="sm"
            :loading="busy === 'sign'"
            loading-label="Uploading…"
            :disabled-reason="signBlocker"
            @click="fileInput?.click()"
          >
            Upload signed copy
          </SjButton>
          <SjButton v-if="latest?.signed" variant="ghost" size="sm" @click="openSigned"
            >Open signed copy</SjButton
          >
          <input
            ref="fileInput"
            type="file"
            accept="application/pdf,image/png,image/jpeg"
            class="d-none"
            @change="onFile"
          />
        </div>
        <details v-if="doc.shares.length || doc.versions.length > 1" class="small mt-2">
          <summary>History</summary>
          <ul class="ps-3 mb-0 mt-1">
            <li v-for="s in doc.shares" :key="s.id">
              v{{ s.version }} sent by
              {{ SHARE_CHANNELS.find((c) => c.value === s.channel)?.label ?? s.channel
              }}<template v-if="s.recipient"> to {{ s.recipient }}</template
              >, {{ formatDateTime(new Date(s.sharedAt)) }}
            </li>
            <li v-for="v in doc.versions" :key="v.id">
              v{{ v.version }} made {{ formatDateTime(new Date(v.createdAt))
              }}{{ v.draft ? ' (draft)' : '' }}{{ v.signed ? ' · signed' : '' }}
            </li>
          </ul>
        </details>
      </template>
      <div v-if="makeLabel" class="mt-2">
        <SjButton
          :variant="doc ? 'ghost' : 'primary'"
          size="sm"
          :loading="making"
          loading-label="Making…"
          :disabled-reason="makeBlocker ?? null"
          @click="emit('make')"
        >
          {{ makeLabel }}
        </SjButton>
      </div>
    </div>

    <SjSheet :open="sentOpen" title="How did you send it?" @close="sentOpen = false">
      <div class="mb-3">
        <label class="form-label" :for="`dc-ch-${doc?.id}`">Sent by</label>
        <select :id="`dc-ch-${doc?.id}`" v-model="sentChannel" class="form-select">
          <option v-for="c in SHARE_CHANNELS" :key="c.value" :value="c.value">{{ c.label }}</option>
        </select>
      </div>
      <SjField v-model="sentTo" label="To" optional :maxlength="200" />
      <SjButton
        block
        :loading="busy === 'sent'"
        loading-label="Saving…"
        @click="logSent(sentChannel, sentTo.trim() || null)"
        >Mark as sent</SjButton
      >
    </SjSheet>
  </section>
</template>

<style scoped>
.min-w-0 {
  min-width: 0;
}
.sj-note {
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 0.8125rem;
}
.sj-note--draft {
  background: #fdecea;
  color: #6b1a12;
}
.sj-note--warn {
  background: #fff6e0;
  color: #5c4310;
}
.sj-badge--ok {
  background: #dcf2e4;
  color: #145c36;
}
</style>
