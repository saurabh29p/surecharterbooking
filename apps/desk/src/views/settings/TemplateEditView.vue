<script setup lang="ts">
import {
  AGREEMENT_LABELS,
  formatDate,
  formatDateTime,
  templateProblems,
  toIstDate,
  type AgreementKind,
  type PlaceholderDef,
} from '@shubhjets/shared';
import { computed, onMounted, ref } from 'vue';
import { onBeforeRouteLeave, useRoute } from 'vue-router';
import { ApiError, api, fetchFile } from '../../api/client';
import SjButton from '../../components/SjButton.vue';
import SjSheet from '../../components/SjSheet.vue';
import SjSkeleton from '../../components/SjSkeleton.vue';
import { useToast } from '../../composables/toast';

interface TemplateDetail {
  kind: AgreementKind;
  name: string;
  current: {
    id: string;
    version: number;
    bodyMd: string;
    lawyerApproved: boolean;
    approvedOn: string | null;
    createdAt: string;
  };
  versions: {
    id: string;
    version: number;
    lawyerApproved: boolean;
    approvedOn: string | null;
    createdAt: string;
  }[];
  placeholders: PlaceholderDef[];
}

const route = useRoute();
const toast = useToast();
const kind = String(route.params.kind).toUpperCase().replace(/-/g, '_') as AgreementKind;
const t = ref<TemplateDetail | null>(null);
const body = ref('');
const busy = ref<string | null>(null);
const editor = ref<HTMLTextAreaElement | null>(null);

async function load() {
  try {
    t.value = await api<TemplateDetail>(`/templates/${route.params.kind}`);
    body.value = t.value.current.bodyMd;
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : "Couldn't load the template");
  }
}
onMounted(load);

const dirty = computed(() => !!t.value && body.value !== t.value.current.bodyMd);
const problems = computed(() => (t.value ? templateProblems(kind, body.value) : []));
onBeforeRouteLeave(() =>
  dirty.value ? window.confirm('Leave without saving your changes to the template?') : true,
);

/** Puts a placeholder where the cursor is. */
function insert(p: PlaceholderDef) {
  const el = editor.value;
  const token = p.block ? `\n\n{{${p.key}}}\n\n` : `{{${p.key}}}`;
  if (!el) {
    body.value += token;
    return;
  }
  const start = el.selectionStart ?? body.value.length;
  const end = el.selectionEnd ?? start;
  body.value = body.value.slice(0, start) + token + body.value.slice(end);
  requestAnimationFrame(() => {
    el.focus();
    el.selectionStart = el.selectionEnd = start + token.length;
  });
}

async function save() {
  busy.value = 'save';
  try {
    t.value = await api<TemplateDetail>(`/templates/${route.params.kind}/versions`, {
      method: 'POST',
      json: { bodyMd: body.value },
    });
    body.value = t.value.current.bodyMd;
    toast.success(`Saved as version ${t.value.current.version}. Ask your lawyer to approve it.`);
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : "Couldn't save the template");
  } finally {
    busy.value = null;
  }
}

/** A PDF of the template as it is in the editor, filled with clearly fake sample data. */
async function previewPdf() {
  const tab = window.open('', '_blank');
  busy.value = 'preview';
  try {
    const { blob } = await fetchFile(`/templates/${route.params.kind}/preview`, 'preview.pdf', {
      method: 'POST',
      json: { bodyMd: body.value },
    });
    const url = URL.createObjectURL(blob);
    if (tab) tab.location.href = url;
    else window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e) {
    tab?.close();
    toast.error(e instanceof ApiError ? e.message : "Couldn't make the preview");
  } finally {
    busy.value = null;
  }
}

const approveOpen = ref(false);
const approvedOn = ref(toIstDate(new Date()));
async function approve() {
  if (!t.value) return;
  busy.value = 'approve';
  try {
    t.value = await api<TemplateDetail>(
      `/templates/${route.params.kind}/versions/${t.value.current.id}/approve`,
      { method: 'POST', json: { approvedOn: approvedOn.value } },
    );
    approveOpen.value = false;
    toast.success(
      `Version ${t.value.current.version} marked lawyer-approved. New agreements no longer say DRAFT.`,
    );
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : "Couldn't record the approval");
  } finally {
    busy.value = null;
  }
}
const today = toIstDate(new Date());
const PH_HINT = '{{placeholders}}';
</script>

<template>
  <div>
    <RouterLink to="/settings/templates" class="small">‹ Agreement templates</RouterLink>
    <SjSkeleton v-if="!t" :lines="6" height="3rem" class="mt-2" />
    <template v-else>
      <h1 class="page-title mt-1 mb-1">{{ AGREEMENT_LABELS[kind] }}</h1>
      <p class="small mb-3">
        Version {{ t.current.version }} ·
        <span v-if="t.current.lawyerApproved" class="text-success fw-bold"
          >✓ Lawyer-approved on {{ formatDate(t.current.approvedOn!) }}</span
        >
        <span v-else class="text-warning-emphasis fw-bold"
          >⚠ Draft: agreements made from it say “DRAFT – NOT FOR SIGNATURE”</span
        >
      </p>

      <section class="card mb-3">
        <div class="card-body">
          <label class="form-label" for="tpl-body">Template text (Markdown)</label>
          <p class="small text-secondary mb-2">
            <b>## Heading</b>, <b>**bold**</b>, lists with “- ”, and <b v-text="PH_HINT" /> that are
            filled in from your records. Saving makes a new version that needs approval again.
          </p>
          <textarea
            id="tpl-body"
            ref="editor"
            v-model="body"
            class="form-control sj-md"
            spellcheck="true"
            :class="{ 'is-invalid': problems.length }"
          />
          <div v-if="problems.length" class="invalid-feedback d-block" role="alert">
            {{ problems.join('. ') }}
          </div>
        </div>
      </section>

      <section class="card mb-3" aria-labelledby="ph-h">
        <div class="card-body">
          <h2 id="ph-h" class="h4">Insert a placeholder</h2>
          <div class="d-flex flex-wrap gap-1">
            <button
              v-for="p in t.placeholders"
              :key="p.key"
              type="button"
              class="sj-chip"
              :title="`{{${p.key}}}`"
              @click="insert(p)"
            >
              {{ p.label }}
            </button>
          </div>
        </div>
      </section>

      <section class="card mb-3" aria-labelledby="ver-h">
        <div class="card-body">
          <h2 id="ver-h" class="h4">Versions</h2>
          <div
            v-for="v in t.versions"
            :key="v.id"
            class="d-flex justify-content-between small py-1 border-top"
          >
            <span>Version {{ v.version }} · {{ formatDateTime(new Date(v.createdAt)) }}</span>
            <span :class="v.lawyerApproved ? 'text-success' : 'text-secondary'">
              {{ v.lawyerApproved ? `Approved ${formatDate(v.approvedOn!)}` : 'Draft' }}
            </span>
          </div>
        </div>
      </section>

      <p v-if="!t.current.lawyerApproved && !dirty" class="text-center mb-3">
        <SjButton variant="ghost" size="sm" @click="approveOpen = true"
          >My lawyer approved this version</SjButton
        >
      </p>

      <div class="sj-actionbar">
        <SjButton
          variant="secondary"
          class="flex-fill"
          :loading="busy === 'preview'"
          loading-label="Making…"
          :disabled-reason="problems.length ? 'Fix the template first' : null"
          @click="previewPdf"
        >
          Preview PDF
        </SjButton>
        <SjButton
          class="flex-fill"
          :loading="busy === 'save'"
          loading-label="Saving…"
          :disabled-reason="!dirty ? 'No changes yet' : problems.length ? problems[0] : null"
          @click="save"
        >
          Save new version
        </SjButton>
      </div>
    </template>

    <SjSheet :open="approveOpen" title="Mark as lawyer-approved" @close="approveOpen = false">
      <p class="small">
        Confirm your lawyer reviewed and approved <b>version {{ t?.current.version }}</b> exactly as
        it is now. Agreements made from it will no longer carry the DRAFT watermark and can be
        signed. Any later edit needs approval again.
      </p>
      <label class="form-label" for="appr-on">Approved on</label>
      <input id="appr-on" v-model="approvedOn" type="date" class="form-control mb-3" :max="today" />
      <SjButton
        block
        :loading="busy === 'approve'"
        loading-label="Saving…"
        :disabled-reason="approvedOn ? null : 'Choose the date'"
        @click="approve"
      >
        Mark version {{ t?.current.version }} approved
      </SjButton>
    </SjSheet>
  </div>
</template>

<style scoped>
.sj-md {
  min-height: 55vh;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
  line-height: 1.5;
}
.sj-chip {
  border: 1px solid #d6d9e0;
  background: #fff;
  border-radius: 999px;
  padding: 6px 12px;
  min-height: 36px;
  font-size: 0.8125rem;
  transition:
    border-color var(--sj-fast),
    background-color var(--sj-fast);
}
.sj-chip:hover {
  border-color: var(--sj-gold);
  background: #fbf6ea;
}
.sj-chip:active {
  transform: scale(0.97);
}
</style>
