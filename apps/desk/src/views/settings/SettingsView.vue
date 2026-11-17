<script setup lang="ts">
import { formatBps, formatINR, type BusinessProfileView } from '@shubhjets/shared';
import { computed, onMounted, ref } from 'vue';
import { api } from '../../api/client';
import { useSettings } from '../../composables/settings';

/** Settings home: one card per area, each with a short summary of where it stands. */
const settings = useSettings();
const profiles = ref<BusinessProfileView[] | null>(null);

onMounted(async () => {
  await Promise.allSettled([
    settings.load(true),
    api<BusinessProfileView[]>('/business-profiles').then((p) => (profiles.value = p)),
  ]);
});

const defaultProfile = computed(() => profiles.value?.find((p) => p.isDefault) ?? null);
const gstConfirmed = computed(() => settings.row('gst.rate_bps')?.confirmed === true);
const markup = computed(() => {
  const v = settings.row('markup.default_bps')?.value;
  return typeof v === 'number' ? formatBps(v) : '…';
});
const target = computed(() => {
  const v = settings.row('target.monthly_margin_paise')?.value;
  return typeof v === 'number' ? formatINR(v, { paise: 'never' }) : '…';
});
</script>

<template>
  <div>
    <h1 class="page-title mb-3">Settings</h1>
    <div class="d-grid gap-2">
      <RouterLink to="/settings/profiles" class="card sj-card-link">
        <div class="card-body d-flex align-items-center gap-3">
          <div class="flex-fill">
            <div class="fw-bold">Business profiles</div>
            <div class="text-secondary small">
              <template v-if="!profiles">Loading…</template>
              <template v-else-if="!defaultProfile">No profile yet</template>
              <template v-else>
                Default: {{ defaultProfile.label }} ·
                <span v-if="defaultProfile.readiness.warnings.length" class="text-warning-emphasis">
                  ⚠ {{ defaultProfile.readiness.warnings.length }} to fill in
                </span>
                <span v-else class="text-success">✓ complete</span>
              </template>
            </div>
          </div>
          <span aria-hidden="true" class="fs-2 text-secondary">›</span>
        </div>
      </RouterLink>

      <RouterLink to="/settings/rules" class="card sj-card-link">
        <div class="card-body d-flex align-items-center gap-3">
          <div class="flex-fill">
            <div class="fw-bold">Pricing and rules</div>
            <div class="text-secondary small">
              Markup {{ markup }} · target {{ target }}/month ·
              <span v-if="gstConfirmed" class="text-success">✓ GST confirmed</span>
              <span v-else class="text-warning-emphasis">⚠ GST not confirmed</span>
            </div>
          </div>
          <span aria-hidden="true" class="fs-2 text-secondary">›</span>
        </div>
      </RouterLink>

      <RouterLink to="/settings/activity" class="card sj-card-link">
        <div class="card-body d-flex align-items-center gap-3">
          <div class="flex-fill">
            <div class="fw-bold">Activity log</div>
            <div class="text-secondary small">Every change, who made it and when</div>
          </div>
          <span aria-hidden="true" class="fs-2 text-secondary">›</span>
        </div>
      </RouterLink>

      <RouterLink to="/settings/security" class="card sj-card-link">
        <div class="card-body d-flex align-items-center gap-3">
          <div class="flex-fill">
            <div class="fw-bold">Login and devices</div>
            <div class="text-secondary small">
              Signed-in devices, log out all devices, change password
            </div>
          </div>
          <span aria-hidden="true" class="fs-2 text-secondary">›</span>
        </div>
      </RouterLink>
    </div>
  </div>
</template>
