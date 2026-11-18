<script setup lang="ts">
import { type ShareChannel, INSTAGRAM_INBOX_URL, MESSENGER_URL } from '@shubhjets/shared';
import { computed, reactive, ref, watch } from 'vue';
import { api, ApiError, download, fetchFile } from '../api/client';
import { useToast } from '../composables/toast';
import SjButton from './SjButton.vue';
import SjSheet from './SjSheet.vue';

interface Prep {
  emailReady: boolean;
  title: string;
  message: string;
  subject: string;
  recipient: { name: string | null; phone: string | null; email: string | null };
  expiryDays: number;
}
interface LinkResult {
  shareId: string;
  url: string;
  message: string;
  subject: string;
  whatsappUrl: string;
  telegramUrl: string;
  mailtoUrl: string;
}

/**
 * One Share button for every document (BRIEF.md §5.6). The app prepares the message and a secure
 * link for each send; you press send in WhatsApp, Telegram, email, Instagram or Messenger.
 */
const props = defineProps<{
  open: boolean;
  documentId: string | null;
  title: string;
  filename: string;
}>();
const emit = defineEmits<{ close: []; shared: [channel: ShareChannel] }>();
const toast = useToast();

const prep = ref<Prep | null>(null);
const form = reactive({ name: '', phone: '', email: '', message: '' });
const busy = ref<string | null>(null);
const lastLink = ref<LinkResult | null>(null);
const pdf = ref<File | null>(null);
const canShareFiles = ref(false);

watch(
  () => [props.open, props.documentId] as const,
  async ([open, id]) => {
    if (!open || !id) return;
    prep.value = null;
    lastLink.value = null;
    try {
      const p = await api<Prep>(`/documents/${id}/share`);
      prep.value = p;
      Object.assign(form, {
        name: p.recipient.name ?? '',
        phone: p.recipient.phone ?? '',
        email: p.recipient.email ?? '',
        message: p.message,
      });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't prepare the message");
    }
    // The PDF is fetched now so the phone's share sheet can open straight from the tap.
    pdf.value = null;
    try {
      const f = await fetchFile(`/documents/${id}/pdf`, props.filename);
      pdf.value = new File([f.blob], f.name, { type: 'application/pdf' });
      canShareFiles.value = !!navigator.canShare?.({ files: [pdf.value] });
    } catch {
      canShareFiles.value = false;
    }
  },
  { immediate: true },
);

const messageOk = computed(() => form.message.includes('{link}'));
const blocker = computed(() =>
  !prep.value ? 'Preparing…' : messageOk.value ? null : 'Keep {link} in the message',
);

async function makeLink(channel: ShareChannel): Promise<LinkResult> {
  const r = await api<LinkResult>(`/documents/${props.documentId}/share-links`, {
    method: 'POST',
    json: {
      channel,
      recipient: form.name || form.phone || form.email || null,
      phone: form.phone || null,
      email: form.email || null,
      message: form.message,
      subject: prep.value?.subject,
    },
  });
  lastLink.value = r;
  emit('shared', channel);
  return r;
}

/** Opens a tab first (phones block tabs opened after a wait), then points it at the app. */
async function viaTab(channel: ShareChannel, pick: (r: LinkResult) => string, ok: string) {
  const tab = window.open('', '_blank');
  busy.value = channel;
  try {
    const r = await makeLink(channel);
    if (tab) tab.location.href = pick(r);
    else window.location.href = pick(r);
    toast.success(ok);
  } catch (e) {
    tab?.close();
    toast.error(e instanceof ApiError ? e.message : "Couldn't make the link");
  } finally {
    busy.value = null;
  }
}

const whatsapp = () =>
  viaTab('WHATSAPP', (r) => r.whatsappUrl, 'Secure link ready: send it in WhatsApp');
const telegram = () =>
  viaTab('TELEGRAM', (r) => r.telegramUrl, 'Secure link ready: send it in Telegram');

async function copyThenOpen(channel: 'INSTAGRAM' | 'MESSENGER') {
  const tab = window.open('', '_blank');
  busy.value = channel;
  try {
    const r = await makeLink(channel);
    await navigator.clipboard.writeText(r.message).catch(() => undefined);
    if (tab) tab.location.href = channel === 'INSTAGRAM' ? INSTAGRAM_INBOX_URL : MESSENGER_URL;
    toast.success(
      `Message and link copied: paste them in ${channel === 'INSTAGRAM' ? 'Instagram' : 'Messenger'}`,
    );
  } catch (e) {
    tab?.close();
    toast.error(e instanceof ApiError ? e.message : "Couldn't make the link");
  } finally {
    busy.value = null;
  }
}

async function email() {
  if (!prep.value) return;
  if (!prep.value.emailReady) {
    // Not set up yet: the phone's mail app opens with the message (attach the PDF there).
    busy.value = 'EMAIL';
    try {
      const r = await makeLink('EMAIL');
      window.location.href = r.mailtoUrl;
      toast.show({
        tone: 'info',
        message: 'Your mail app opens with the message and link. Attach the PDF if you like.',
      });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't make the link");
    } finally {
      busy.value = null;
    }
    return;
  }
  if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) {
    toast.error('Enter the email address first');
    return;
  }
  busy.value = 'EMAIL';
  try {
    await api(`/documents/${props.documentId}/email`, {
      method: 'POST',
      json: { to: form.email.trim(), message: form.message, subject: prep.value.subject },
    });
    emit('shared', 'EMAIL');
    toast.success(`Emailed to ${form.email.trim()} with the PDF attached`);
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : "Couldn't send the email");
  } finally {
    busy.value = null;
  }
}

/** The phone's share sheet (any app). A second tap reuses the link, so the sheet can open at once. */
async function phoneShare() {
  busy.value = 'WEB_SHARE';
  try {
    const r =
      lastLink.value?.message.includes(lastLink.value.url) && shareChannel.value === 'WEB_SHARE'
        ? lastLink.value
        : await makeLink('WEB_SHARE');
    shareChannel.value = 'WEB_SHARE';
    const data: Parameters<typeof navigator.share>[0] =
      pdf.value && canShareFiles.value
        ? { files: [pdf.value], text: r.message }
        : { text: r.message };
    await navigator.share(data);
    toast.success('Shared');
  } catch (e) {
    const name = (e as DOMException).name;
    if (name === 'NotAllowedError')
      toast.show({
        tone: 'info',
        message: 'The link is ready. Tap “Phone share sheet” again to open it.',
      });
    else if (name !== 'AbortError')
      toast.error(e instanceof ApiError ? e.message : "Couldn't open the share sheet");
  } finally {
    busy.value = null;
  }
}
const shareChannel = ref<ShareChannel | null>(null);

async function copyLink() {
  busy.value = 'COPY_LINK';
  try {
    const r = await makeLink('COPY_LINK');
    const copied = await navigator.clipboard
      .writeText(r.url)
      .then(() => true)
      .catch(() => false);
    toast.success(copied ? 'Secure link copied' : 'Secure link ready below: copy it from the box');
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : "Couldn't make the link");
  } finally {
    busy.value = null;
  }
}

async function downloadPdf() {
  busy.value = 'DOWNLOAD';
  try {
    await download(`/documents/${props.documentId}/pdf`, props.filename);
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : "Couldn't download the PDF");
  } finally {
    busy.value = null;
  }
}
const hasNativeShare = typeof navigator !== 'undefined' && !!navigator.share;
</script>

<template>
  <SjSheet :open="open" :title="`Share ${title}`" @close="emit('close')">
    <div v-if="!prep" class="text-secondary small">Preparing the message…</div>
    <template v-else>
      <div class="d-flex gap-2">
        <div class="flex-fill">
          <label class="form-label" for="sh-name">To</label>
          <input id="sh-name" v-model="form.name" class="form-control" autocomplete="off" />
        </div>
        <div style="flex: 0 0 48%">
          <label class="form-label" for="sh-phone">WhatsApp number</label>
          <input
            id="sh-phone"
            v-model="form.phone"
            class="form-control"
            inputmode="tel"
            autocomplete="off"
          />
        </div>
      </div>
      <div class="mt-2">
        <label class="form-label" for="sh-email">Email</label>
        <input
          id="sh-email"
          v-model="form.email"
          class="form-control"
          type="email"
          inputmode="email"
          autocomplete="off"
        />
      </div>
      <div class="mt-2">
        <label class="form-label" for="sh-msg">Message</label>
        <textarea
          id="sh-msg"
          v-model="form.message"
          class="form-control"
          rows="6"
          :class="{ 'is-invalid': !messageOk }"
        />
        <div class="form-hint small" :class="messageOk ? 'text-secondary' : 'text-danger'">
          <code v-text="'{link}'" /> becomes a secure link that works for
          {{ prep.expiryDays }} days.
        </div>
      </div>

      <div class="sj-channels mt-3">
        <SjButton
          :loading="busy === 'WHATSAPP'"
          loading-label="Preparing…"
          :disabled-reason="blocker"
          @click="whatsapp"
          >WhatsApp</SjButton
        >
        <SjButton
          variant="secondary"
          :loading="busy === 'TELEGRAM'"
          loading-label="Preparing…"
          :disabled-reason="blocker"
          @click="telegram"
          >Telegram</SjButton
        >
        <SjButton
          variant="secondary"
          :loading="busy === 'EMAIL'"
          loading-label="Sending…"
          :disabled-reason="blocker"
          @click="email"
        >
          {{ prep.emailReady ? 'Email with PDF' : 'Email' }}
        </SjButton>
        <SjButton
          v-if="hasNativeShare"
          variant="secondary"
          :loading="busy === 'WEB_SHARE'"
          loading-label="Opening…"
          :disabled-reason="blocker"
          @click="phoneShare"
        >
          Phone share sheet
        </SjButton>
        <SjButton
          variant="secondary"
          :loading="busy === 'INSTAGRAM'"
          loading-label="Copying…"
          :disabled-reason="blocker"
          @click="copyThenOpen('INSTAGRAM')"
          >Instagram</SjButton
        >
        <SjButton
          variant="secondary"
          :loading="busy === 'MESSENGER'"
          loading-label="Copying…"
          :disabled-reason="blocker"
          @click="copyThenOpen('MESSENGER')"
          >Messenger</SjButton
        >
        <SjButton
          variant="ghost"
          :loading="busy === 'COPY_LINK'"
          loading-label="Copying…"
          :disabled-reason="blocker"
          @click="copyLink"
          >Copy link</SjButton
        >
        <SjButton
          variant="ghost"
          :loading="busy === 'DOWNLOAD'"
          loading-label="Downloading…"
          @click="downloadPdf"
          >Download PDF</SjButton
        >
      </div>
      <p v-if="!prep.emailReady" class="small text-secondary mt-2 mb-0">
        Email from the app isn't set up yet, so Email opens your mail app.
      </p>
      <div v-if="lastLink" class="sj-lastlink mt-3">
        <div class="small fw-bold mb-1">Secure link</div>
        <input
          class="form-control form-control-sm"
          :value="lastLink.url"
          readonly
          aria-label="Secure link"
          @focus="($event.target as HTMLInputElement).select()"
        />
      </div>
      <p class="small text-secondary mt-2 mb-0">
        Nothing is sent by the app: you press send. Every share is logged.
      </p>
    </template>
  </SjSheet>
</template>

<style scoped>
.sj-channels {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.sj-lastlink {
  background: #f6f7f9;
  border-radius: 10px;
  padding: 8px 10px;
}
</style>
