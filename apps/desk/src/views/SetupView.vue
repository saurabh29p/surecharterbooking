<script setup lang="ts">
import type { BusinessProfileView } from '@shubhjets/shared';
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api, ApiError, type SessionUser } from '../api/client';
import SjButton from '../components/SjButton.vue';
import SjSkeleton from '../components/SjSkeleton.vue';
import BankFields from '../components/profile/BankFields.vue';
import BusinessFields from '../components/profile/BusinessFields.vue';
import SigningFields from '../components/profile/SigningFields.vue';
import { useAuth } from '../composables/auth';
import { newProfileForm, toBody, type ProfileSection } from '../composables/profileForm';
import { useToast } from '../composables/toast';

/**
 * First-login setup: three short steps, every field optional and every step skippable.
 * Anything skipped can be filled in later under Settings → Business profiles.
 */
const router = useRouter();
const auth = useAuth();
const toast = useToast();

const STEPS: { key: ProfileSection; title: string; intro: string }[] = [
  {
    key: 'business',
    title: 'Your business',
    intro: 'Who quotes and invoices go out from. Delhi is preselected.',
  },
  { key: 'bank', title: 'Bank details', intro: 'Where clients pay you.' },
  {
    key: 'signing',
    title: 'Signing and invoices',
    intro: 'Who signs agreements, and how invoices are numbered.',
  },
];

const loading = ref(true);
const step = ref(0);
const done = ref(false);
const saving = ref(false);
const errors = ref<Record<string, string>>({});
const profile = ref<BusinessProfileView | null>(null);
const form = newProfileForm();

const current = computed(() => STEPS[step.value]!);

onMounted(async () => {
  try {
    const list = await api<BusinessProfileView[]>('/business-profiles');
    profile.value = list.find((p) => p.isDefault) ?? null;
    Object.assign(form, newProfileForm(profile.value));
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : 'Could not load your profile');
  } finally {
    loading.value = false;
  }
});

async function saveProfile(body: Record<string, unknown>) {
  if (profile.value) {
    if (Object.keys(body).length === 0) return;
    profile.value = await api<BusinessProfileView>(`/business-profiles/${profile.value.id}`, {
      method: 'PATCH',
      json: body,
    });
  } else {
    profile.value = await api<BusinessProfileView>('/business-profiles', {
      method: 'POST',
      json: body,
    });
  }
}

async function next(save: boolean) {
  errors.value = {};
  saving.value = true;
  try {
    if (save) await saveProfile(toBody(form, [current.value.key]));
    if (step.value < STEPS.length - 1) {
      step.value++;
    } else {
      if (!profile.value) await saveProfile({}); // make sure a (Delhi) default profile exists
      const user = await api<SessionUser>('/auth/setup-complete', { method: 'POST' });
      auth.markSetupDone(user);
      done.value = true;
    }
    window.scrollTo({ top: 0 });
  } catch (e) {
    if (e instanceof ApiError && Object.keys(e.fields).length) {
      errors.value = e.fields;
      toast.error('Please fix the highlighted fields');
    } else {
      toast.error(e instanceof ApiError ? e.message : "Couldn't save. Please try again.");
    }
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="container-tight py-4 px-3">
    <div class="text-center mb-3">
      <span class="sj-wordmark sj-wordmark--light fs-2">ShubhJets</span>
    </div>
    <div class="card">
      <div class="card-body">
        <SjSkeleton v-if="loading" :lines="6" height="2.5rem" />

        <div v-else-if="done" class="text-center py-3">
          <div class="sj-check mb-3" aria-hidden="true">✓</div>
          <h1 class="h2">You're set up</h1>
          <p class="text-secondary">
            Everything can be changed later in Settings → Business profiles.
          </p>
          <div
            v-if="profile && profile.readiness.warnings.length"
            class="alert alert-warning text-start"
          >
            <div class="fw-bold mb-1">Still to fill in before documents go out:</div>
            <ul class="sj-warning-list">
              <li v-for="w in profile.readiness.warnings" :key="w">{{ w }}</li>
            </ul>
          </div>
          <SjButton block @click="router.replace('/')">Go to Today</SjButton>
        </div>

        <form v-else novalidate @submit.prevent="next(true)">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <span class="text-secondary small fw-bold"
              >Step {{ step + 1 }} of {{ STEPS.length }}</span
            >
            <span class="text-secondary small">Everything is optional</span>
          </div>
          <div class="progress mb-3" style="height: 4px">
            <div
              class="progress-bar"
              :style="{
                width: `${((step + 1) / STEPS.length) * 100}%`,
                background: 'var(--sj-gold)',
              }"
            />
          </div>
          <h1 class="h2 mb-1">{{ current.title }}</h1>
          <p class="text-secondary mb-3">{{ current.intro }}</p>

          <BusinessFields v-if="current.key === 'business'" v-model:form="form" :errors="errors" />
          <BankFields v-else-if="current.key === 'bank'" v-model:form="form" :errors="errors" />
          <SigningFields v-else v-model:form="form" :errors="errors" />

          <div class="d-flex gap-2 mt-2">
            <SjButton
              variant="ghost"
              :disabled-reason="saving ? 'Saving…' : null"
              @click="next(false)"
              >Skip for now</SjButton
            >
            <SjButton type="submit" class="flex-fill" :loading="saving" loading-label="Saving…">
              {{ step === STEPS.length - 1 ? 'Save and finish' : 'Save and continue' }}
            </SjButton>
          </div>
          <div v-if="step > 0" class="text-center mt-2">
            <button type="button" class="btn btn-link btn-sm" @click="step--">Back</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
