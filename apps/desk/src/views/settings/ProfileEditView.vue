<script setup lang="ts">
import type { BankDetails, BusinessProfileView } from '@shubhjets/shared';
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, ApiError } from '../../api/client';
import SjButton from '../../components/SjButton.vue';
import SjConfirm from '../../components/SjConfirm.vue';
import SjSkeleton from '../../components/SjSkeleton.vue';
import BankFields from '../../components/profile/BankFields.vue';
import BusinessFields from '../../components/profile/BusinessFields.vue';
import SigningFields from '../../components/profile/SigningFields.vue';
import { bankIsEmpty, fillBank, newProfileForm, toBody } from '../../composables/profileForm';
import { useToast } from '../../composables/toast';

const route = useRoute();
const router = useRouter();
const toast = useToast();

const id = computed(() => (route.params.id === 'new' ? null : String(route.params.id)));
const profile = ref<BusinessProfileView | null>(null);
const loading = ref(true);
const saving = ref(false);
const errors = ref<Record<string, string>>({});
const form = newProfileForm();
/** Bank details are only fetched (and the view audited) when you choose to edit them. */
const bankOpen = ref(false);
const bankLoading = ref(false);
const confirmArchive = ref(false);
const archiving = ref(false);
const makingDefault = ref(false);

onMounted(async () => {
  if (!id.value) {
    Object.assign(form, newProfileForm(null), { label: '' });
    bankOpen.value = true;
    loading.value = false;
    return;
  }
  try {
    profile.value = await api<BusinessProfileView>(`/business-profiles/${id.value}`);
    Object.assign(form, newProfileForm(profile.value));
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : "Couldn't load this profile");
  } finally {
    loading.value = false;
  }
});

async function openBank() {
  if (!profile.value?.hasBankDetails) {
    bankOpen.value = true;
    return;
  }
  bankLoading.value = true;
  try {
    const res = await api<{ bankDetails: BankDetails | null }>(
      `/business-profiles/${profile.value.id}/bank-details`,
    );
    fillBank(form, res.bankDetails);
    bankOpen.value = true;
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : "Couldn't load the bank details");
  } finally {
    bankLoading.value = false;
  }
}

async function removeBank() {
  if (!profile.value) return;
  const previous = bankIsEmpty(form) ? null : { ...form.bank, branch: form.bank.branch || null };
  try {
    profile.value = await api<BusinessProfileView>(`/business-profiles/${profile.value.id}`, {
      method: 'PATCH',
      json: { bankDetails: null },
    });
    fillBank(form, null);
    bankOpen.value = false;
    toast.success(
      'Bank details removed',
      previous
        ? async () => {
            profile.value = await api<BusinessProfileView>(
              `/business-profiles/${profile.value!.id}`,
              {
                method: 'PATCH',
                json: { bankDetails: previous },
              },
            );
            fillBank(form, previous);
            toast.success('Bank details restored');
          }
        : undefined,
    );
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : "Couldn't remove the bank details");
  }
}

async function save() {
  errors.value = {};
  saving.value = true;
  try {
    const body = toBody(
      form,
      bankOpen.value ? ['business', 'bank', 'signing'] : ['business', 'signing'],
    );
    if (profile.value) {
      profile.value = await api<BusinessProfileView>(`/business-profiles/${profile.value.id}`, {
        method: 'PATCH',
        json: body,
      });
      toast.success('Saved');
    } else {
      const created = await api<BusinessProfileView>('/business-profiles', {
        method: 'POST',
        json: body,
      });
      toast.success('Profile created');
      await router.replace(`/settings/profiles/${created.id}`);
      profile.value = created;
    }
    bankOpen.value = false;
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

async function makeDefault() {
  if (!profile.value) return;
  makingDefault.value = true;
  try {
    const previous = (await api<BusinessProfileView[]>('/business-profiles')).find(
      (p) => p.isDefault,
    );
    profile.value = await api<BusinessProfileView>(
      `/business-profiles/${profile.value.id}/default`,
      { method: 'POST' },
    );
    toast.success(
      `${profile.value.label} is now the default`,
      previous
        ? async () => {
            await api(`/business-profiles/${previous.id}/default`, { method: 'POST' });
            profile.value = await api<BusinessProfileView>(
              `/business-profiles/${profile.value!.id}`,
            );
            toast.success(`${previous.label} is the default again`);
          }
        : undefined,
    );
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : "Couldn't change the default");
  } finally {
    makingDefault.value = false;
  }
}

async function archive() {
  if (!profile.value) return;
  archiving.value = true;
  try {
    await api(`/business-profiles/${profile.value.id}/archive`, { method: 'POST' });
    toast.success(`${profile.value.label} archived`);
    await router.replace('/settings/profiles');
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : "Couldn't archive this profile");
  } finally {
    archiving.value = false;
    confirmArchive.value = false;
  }
}
</script>

<template>
  <div>
    <RouterLink to="/settings/profiles" class="d-inline-block mb-2">‹ Business profiles</RouterLink>
    <SjSkeleton v-if="loading" :lines="8" height="2.5rem" />
    <form v-else novalidate @submit.prevent="save">
      <div class="d-flex align-items-center gap-2 flex-wrap mb-3">
        <h1 class="page-title mb-0">{{ profile ? profile.label : 'New business profile' }}</h1>
        <span v-if="profile?.isDefault" class="sj-badge sj-badge--gold">★ Default</span>
      </div>

      <div v-if="profile && profile.readiness.warnings.length" class="alert alert-warning">
        <div class="fw-bold mb-1">
          Documents from this profile will show a warning until these are filled in:
        </div>
        <ul class="sj-warning-list mb-0">
          <li v-for="w in profile.readiness.warnings" :key="w">{{ w }}</li>
        </ul>
        <div v-if="!profile.readiness.canIssueInvoice" class="mt-2 small">
          Invoices can't be issued yet: {{ profile.readiness.invoiceBlockers.join('; ') }}.
        </div>
      </div>

      <div class="card mb-3">
        <div class="card-body">
          <h2 class="h3">Business</h2>
          <BusinessFields v-model:form="form" :errors="errors" show-label />
        </div>
      </div>

      <div class="card mb-3">
        <div class="card-body">
          <h2 class="h3">Bank details</h2>
          <BankFields v-if="bankOpen" v-model:form="form" :errors="errors" />
          <div v-else class="d-flex align-items-center gap-2 flex-wrap">
            <span class="flex-fill">{{ profile?.bankHint ?? 'Not added yet' }}</span>
            <SjButton
              variant="secondary"
              size="sm"
              :loading="bankLoading"
              loading-label="Opening…"
              @click="openBank"
            >
              {{ profile?.hasBankDetails ? 'Change' : 'Add bank details' }}
            </SjButton>
            <SjButton v-if="profile?.hasBankDetails" variant="ghost" size="sm" @click="removeBank"
              >Remove</SjButton
            >
          </div>
        </div>
      </div>

      <div class="card mb-3">
        <div class="card-body">
          <h2 class="h3">Signing and invoices</h2>
          <SigningFields v-model:form="form" :errors="errors" />
          <p class="text-secondary small mb-0">
            Logo upload arrives with file storage; until then PDFs use the ShubhJets wordmark.
          </p>
        </div>
      </div>

      <div v-if="profile" class="card mb-3">
        <div class="card-body d-flex gap-2 flex-wrap">
          <SjButton
            variant="secondary"
            :loading="makingDefault"
            loading-label="Switching…"
            :disabled-reason="profile.isDefault ? 'This is already the default profile' : null"
            @click="makeDefault"
          >
            Make default
          </SjButton>
          <SjButton
            variant="ghost"
            :disabled-reason="
              profile.isDefault
                ? 'Make another profile the default before archiving this one'
                : null
            "
            @click="confirmArchive = true"
          >
            Archive profile
          </SjButton>
        </div>
      </div>

      <div class="sj-actionbar">
        <SjButton type="submit" block :loading="saving" loading-label="Saving…">
          {{ profile ? 'Save changes' : 'Create profile' }}
        </SjButton>
      </div>
    </form>

    <SjConfirm
      :open="confirmArchive"
      :title="`Archive ${profile?.label}?`"
      body="It stays on past weddings and invoices, but can't be used for new ones. There's no undo for this yet."
      confirm-label="Archive"
      :busy="archiving"
      @confirm="archive"
      @cancel="confirmArchive = false"
    />
  </div>
</template>
