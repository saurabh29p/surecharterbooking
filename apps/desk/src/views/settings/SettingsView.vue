<script setup lang="ts">
import { formatDateTime, stateName, type BusinessProfileView } from '@shubhjets/shared';
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { adoptSession, api, ApiError, type Session } from '../../api/client';
import type { DeviceSession } from '../../api/types';
import SjButton from '../../components/SjButton.vue';
import SjConfirm from '../../components/SjConfirm.vue';
import SjField from '../../components/SjField.vue';
import SjSkeleton from '../../components/SjSkeleton.vue';
import { useAuth } from '../../composables/auth';
import { describeDevice } from '../../composables/device';
import { useToast } from '../../composables/toast';

const router = useRouter();
const auth = useAuth();
const toast = useToast();

const profiles = ref<BusinessProfileView[] | null>(null);
const devices = ref<DeviceSession[] | null>(null);
const confirmAll = ref(false);
const loggingOutAll = ref(false);
const revoking = ref<string | null>(null);

const pw = ref({ current: '', next: '' });
const pwErrors = ref<Record<string, string>>({});
const pwBusy = ref(false);

async function load() {
  const [p, d] = await Promise.allSettled([
    api<BusinessProfileView[]>('/business-profiles'),
    api<DeviceSession[]>('/auth/sessions'),
  ]);
  if (p.status === 'fulfilled') profiles.value = p.value;
  else toast.error("Couldn't load business profiles");
  if (d.status === 'fulfilled') devices.value = d.value;
  else toast.error("Couldn't load signed-in devices");
}
onMounted(load);

async function revoke(id: string) {
  revoking.value = id;
  try {
    await api(`/auth/sessions/${id}`, { method: 'DELETE' });
    devices.value = devices.value?.filter((d) => d.id !== id) ?? null;
    toast.success('That device is logged out');
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : "Couldn't log that device out");
  } finally {
    revoking.value = null;
  }
}

async function logoutAll() {
  loggingOutAll.value = true;
  try {
    await auth.logoutAllDevices();
    confirmAll.value = false;
    await router.replace('/login');
    toast.success('Logged out on all devices');
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : "Couldn't log out all devices");
  } finally {
    loggingOutAll.value = false;
  }
}

async function logoutHere() {
  await auth.logout();
  await router.replace('/login');
}

async function changePassword() {
  pwErrors.value = {};
  pwBusy.value = true;
  try {
    const session = await api<Session>('/auth/password', {
      method: 'POST',
      json: { currentPassword: pw.value.current, newPassword: pw.value.next },
    });
    adoptSession(session);
    pw.value = { current: '', next: '' };
    devices.value = await api<DeviceSession[]>('/auth/sessions');
    toast.success('Password changed. Other devices are logged out.');
  } catch (e) {
    if (e instanceof ApiError) {
      pwErrors.value = e.fields;
      if (!Object.keys(e.fields).length) toast.error(e.message);
    }
  } finally {
    pwBusy.value = false;
  }
}
</script>

<template>
  <div>
    <h1 class="page-title mb-3">Settings</h1>

    <section class="mb-4" aria-labelledby="profiles-h">
      <div class="d-flex justify-content-between align-items-center mb-2">
        <h2 id="profiles-h" class="h3 mb-0">Business profiles</h2>
        <SjButton variant="secondary" size="sm" @click="router.push('/settings/profiles/new')"
          >Add profile</SjButton
        >
      </div>
      <p class="text-secondary small">
        Who quotes, invoices and agreements go out from. New weddings use the default.
      </p>
      <SjSkeleton v-if="!profiles" :lines="2" height="5rem" />
      <div v-else-if="profiles.length === 0" class="card card-body text-center">
        <p class="mb-2">No business profile yet.</p>
        <SjButton @click="router.push('/settings/profiles/new')"
          >Create your first profile</SjButton
        >
      </div>
      <div v-else class="d-grid gap-2">
        <RouterLink
          v-for="p in profiles"
          :key="p.id"
          :to="`/settings/profiles/${p.id}`"
          class="card sj-card-link"
        >
          <div class="card-body d-flex gap-3 align-items-start">
            <div class="flex-fill">
              <div class="d-flex align-items-center gap-2 flex-wrap">
                <span class="fw-bold">{{ p.label }}</span>
                <span v-if="p.isDefault" class="sj-badge sj-badge--gold">★ Default</span>
                <span class="sj-badge sj-badge--muted">{{ stateName(p.stateCode) }}</span>
              </div>
              <div class="text-secondary small mt-1">
                {{ p.legalName || p.brandName || 'No name yet' }} ·
                {{ p.gstin ? `GSTIN ${p.gstin}` : 'No GSTIN yet' }}
              </div>
              <ul
                v-if="p.readiness.warnings.length"
                class="sj-warning-list small mt-2 text-warning-emphasis"
              >
                <li v-for="w in p.readiness.warnings" :key="w">{{ w }}</li>
              </ul>
              <div v-else class="small mt-2 text-success">
                ✓ Ready for quotes, invoices and agreements
              </div>
            </div>
            <span aria-hidden="true" class="text-secondary fs-2">›</span>
          </div>
        </RouterLink>
      </div>
    </section>

    <section class="mb-4" aria-labelledby="devices-h">
      <h2 id="devices-h" class="h3">Signed-in devices</h2>
      <p class="text-secondary small">
        Each device stays logged in for 30 days after it was last used.
      </p>
      <SjSkeleton v-if="!devices" :lines="2" height="3rem" />
      <div v-else class="card">
        <div class="list-group list-group-flush">
          <div
            v-for="d in devices"
            :key="d.id"
            class="list-group-item d-flex align-items-center gap-2"
          >
            <div class="flex-fill">
              <div class="fw-bold">
                {{ describeDevice(d.userAgent) }}
                <span v-if="d.current" class="sj-badge sj-badge--gold ms-1">This device</span>
              </div>
              <div class="text-secondary small">
                Signed in {{ formatDateTime(new Date(d.signedInAt)) }}
                <template v-if="d.lastUsedAt">
                  · last used {{ formatDateTime(new Date(d.lastUsedAt)) }}</template
                >
              </div>
            </div>
            <SjButton
              v-if="!d.current"
              variant="secondary"
              size="sm"
              :loading="revoking === d.id"
              loading-label="Logging out…"
              @click="revoke(d.id)"
            >
              Log out
            </SjButton>
          </div>
        </div>
      </div>
      <div class="d-flex gap-2 flex-wrap mt-3">
        <SjButton variant="secondary" @click="logoutHere">Log out on this device</SjButton>
        <SjButton variant="danger" @click="confirmAll = true">Log out all devices</SjButton>
      </div>
    </section>

    <section class="mb-4" aria-labelledby="pw-h">
      <h2 id="pw-h" class="h3">Change password</h2>
      <form class="card card-body" novalidate @submit.prevent="changePassword">
        <SjField
          v-model="pw.current"
          label="Current password"
          type="password"
          autocomplete="current-password"
          :server-error="pwErrors.currentPassword"
        />
        <SjField
          v-model="pw.next"
          label="New password"
          type="password"
          autocomplete="new-password"
          hint="At least 12 characters. A short sentence works well."
          :validate="(v) => (v.length < 12 ? 'Use at least 12 characters' : null)"
          :server-error="pwErrors.newPassword"
        />
        <div>
          <SjButton
            type="submit"
            :loading="pwBusy"
            loading-label="Changing…"
            :disabled-reason="!pw.current || !pw.next ? 'Fill in both passwords first' : null"
          >
            Change password
          </SjButton>
        </div>
        <p class="text-secondary small mt-2 mb-0">
          Other devices are logged out when you change your password.
        </p>
      </form>
    </section>

    <SjConfirm
      :open="confirmAll"
      title="Log out all devices?"
      body="This logs you out on every phone and computer, including this one. You'll need your password to log back in."
      confirm-label="Log out everywhere"
      :busy="loggingOutAll"
      @confirm="logoutAll"
      @cancel="confirmAll = false"
    />
  </div>
</template>
