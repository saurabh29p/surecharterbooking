<script setup lang="ts">
import { formatDateTime, SHARE_CHANNEL_LABELS, type ShareChannel } from '@shubhjets/shared';
import { onMounted, ref, watch } from 'vue';
import { api, ApiError } from '../api/client';
import { useToast } from '../composables/toast';
import SjButton from './SjButton.vue';
import SjConfirm from './SjConfirm.vue';

interface ShareRow {
  id: string;
  version: number;
  channel: ShareChannel;
  recipient: string | null;
  sharedAt: string;
  link: { state: 'ACTIVE' | 'EXPIRED' | 'REVOKED'; expiresAt: string | null } | null;
  opened: { count: number; first: string | null; last: string | null };
  acceptance: { name: string; at: string } | null;
}

/** Who a document was sent to, how, whether they opened it, and switching links off. */
const props = defineProps<{ documentId: string; reload?: number }>();
const toast = useToast();
const rows = ref<ShareRow[] | null>(null);
const revoking = ref<ShareRow | null>(null);
const busy = ref(false);

async function load() {
  try {
    rows.value = await api<ShareRow[]>(`/documents/${props.documentId}/shares`);
  } catch {
    rows.value = [];
  }
}
onMounted(load);
watch(() => [props.documentId, props.reload], load);

async function revoke() {
  if (!revoking.value) return;
  busy.value = true;
  try {
    await api(`/shares/${revoking.value.id}/revoke`, { method: 'POST' });
    toast.success('Link switched off');
    revoking.value = null;
    await load();
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : "Couldn't switch it off");
  } finally {
    busy.value = false;
  }
}
const stateLabel = { ACTIVE: 'Link works', EXPIRED: 'Link expired', REVOKED: 'Link off' };
</script>

<template>
  <div>
    <p v-if="rows && !rows.length" class="small text-secondary mb-0">Not sent yet.</p>
    <div v-for="s in rows ?? []" :key="s.id" class="sj-share">
      <div class="d-flex justify-content-between gap-2">
        <div class="min-w-0">
          <div class="fw-bold small">
            {{ SHARE_CHANNEL_LABELS[s.channel]
            }}<template v-if="s.recipient"> · {{ s.recipient }}</template>
          </div>
          <div class="small text-secondary">
            {{ formatDateTime(new Date(s.sharedAt)) }} · v{{ s.version }}
          </div>
          <div v-if="s.link" class="small">
            <span v-if="s.opened.count" class="text-success fw-bold">
              ✓ Opened {{ s.opened.count }}×, last {{ formatDateTime(new Date(s.opened.last!)) }}
            </span>
            <span v-else class="text-secondary">Not opened yet</span>
          </div>
          <div v-if="s.acceptance" class="small text-success fw-bold">
            ✓ Accepted by {{ s.acceptance.name }} · {{ formatDateTime(new Date(s.acceptance.at)) }}
          </div>
        </div>
        <div v-if="s.link" class="text-end">
          <span class="sj-state" :class="`sj-state--${s.link.state.toLowerCase()}`">{{
            stateLabel[s.link.state]
          }}</span>
          <SjButton
            v-if="s.link.state === 'ACTIVE'"
            variant="ghost"
            size="sm"
            class="d-block ms-auto"
            @click="revoking = s"
          >
            Switch off
          </SjButton>
        </div>
      </div>
    </div>
    <SjConfirm
      :open="!!revoking"
      title="Switch off this link?"
      :body="`${revoking?.recipient ?? 'They'} will no longer be able to open it. You can always share again with a new link.`"
      confirm-label="Switch off link"
      :busy="busy"
      @confirm="revoke"
      @cancel="revoking = null"
    />
  </div>
</template>

<style scoped>
.min-w-0 {
  min-width: 0;
}
.sj-share {
  padding: 8px 0;
  border-top: 1px solid #eceef2;
}
.sj-state {
  display: inline-block;
  font-size: 0.6875rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 999px;
  white-space: nowrap;
}
.sj-state--active {
  background: #dcf2e4;
  color: #145c36;
}
.sj-state--expired {
  background: #eceef2;
  color: #4b5160;
}
.sj-state--revoked {
  background: #fde2df;
  color: #8a1c12;
}
</style>
