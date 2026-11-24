<script setup lang="ts">
import type { BusinessProfileView } from '@shubhjets/shared';
import { onMounted, ref, watch } from 'vue';
import { api, ApiError } from '../../api/client';
import { useToast } from '../../composables/toast';
import SjButton from '../SjButton.vue';
import SjConfirm from '../SjConfirm.vue';

/** Logo for PDFs from this profile; falls back to the Vaanika logo. */
const props = defineProps<{ profile: BusinessProfileView }>();
const emit = defineEmits<{ updated: [BusinessProfileView] }>();
const toast = useToast();

const input = ref<HTMLInputElement | null>(null);
const src = ref<string | null>(null);
const uploading = ref(false);
const confirmRemove = ref(false);
const removing = ref(false);

async function loadPreview() {
  src.value = null;
  if (!props.profile.logoFileId) return;
  try {
    src.value = (
      await api<{ url: string }>(`/files/${props.profile.logoFileId}/link`, { method: 'POST' })
    ).url;
  } catch {
    src.value = null;
  }
}
onMounted(loadPreview);
watch(() => props.profile.logoFileId, loadPreview);

async function onPick(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const form = new FormData();
  form.append('file', file);
  uploading.value = true;
  try {
    emit(
      'updated',
      await api<BusinessProfileView>(`/business-profiles/${props.profile.id}/logo`, {
        method: 'POST',
        body: form,
      }),
    );
    toast.success('Logo updated');
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : "Couldn't upload the logo");
  } finally {
    uploading.value = false;
    if (input.value) input.value.value = '';
  }
}

async function remove() {
  removing.value = true;
  try {
    emit(
      'updated',
      await api<BusinessProfileView>(`/business-profiles/${props.profile.id}/logo`, {
        method: 'DELETE',
      }),
    );
    toast.success('Logo removed; PDFs use the Vaanika logo');
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : "Couldn't remove the logo");
  } finally {
    removing.value = false;
    confirmRemove.value = false;
  }
}
</script>

<template>
  <div class="d-flex align-items-center gap-3 flex-wrap">
    <div class="sj-logo-box" aria-label="Logo preview">
      <img v-if="src" :src="src" alt="Current logo" width="120" height="56" />
      <span v-else class="sj-wordmark fs-3">{{ profile.brandName || 'Vaanika' }}</span>
    </div>
    <div class="d-flex gap-2 flex-wrap">
      <input
        ref="input"
        type="file"
        tabindex="-1"
        aria-label="Choose the logo image"
        accept="image/png,image/jpeg,image/webp"
        class="visually-hidden"
        @change="onPick"
      />
      <SjButton
        variant="secondary"
        size="sm"
        :loading="uploading"
        loading-label="Uploading…"
        @click="input?.click()"
      >
        {{ profile.logoFileId ? 'Replace logo' : 'Upload logo' }}
      </SjButton>
      <SjButton v-if="profile.logoFileId" variant="ghost" size="sm" @click="confirmRemove = true"
        >Remove</SjButton
      >
    </div>
    <p class="text-secondary small w-100 mb-0">
      PNG, JPG or WebP up to 2 MB. Without a logo, PDFs use the wordmark shown.
    </p>
    <SjConfirm
      :open="confirmRemove"
      title="Remove the logo?"
      body="The file is deleted and PDFs go back to the Vaanika logo. You can upload a logo again any time."
      confirm-label="Remove logo"
      :busy="removing"
      @confirm="remove"
      @cancel="confirmRemove = false"
    />
  </div>
</template>

<style scoped>
.sj-logo-box {
  width: 140px;
  height: 72px;
  display: grid;
  place-items: center;
  border: 1px dashed #c9ccd4;
  border-radius: 10px;
  background: var(--sj-midnight);
  overflow: hidden;
}
.sj-logo-box img {
  max-width: 120px;
  max-height: 56px;
  object-fit: contain;
}
</style>
