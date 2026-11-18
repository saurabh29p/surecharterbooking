<script setup lang="ts">
import { IMPORT_COLUMNS, type ImportAction, type ImportKind } from '@shubhjets/shared';
import { computed, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import { api, ApiError, download } from '../../api/client';
import SjButton from '../../components/SjButton.vue';
import { useToast } from '../../composables/toast';

interface PreviewRow {
  row: number;
  values: Record<string, string>;
  problems: string[];
  duplicates: { id: string; name: string; matchedOn: string[] }[];
  sameAsRow: number | null;
  suggested: ImportAction;
}
interface Preview {
  headers: string[];
  mapping: Record<string, number | null>;
  unmapped: string[];
  rows: PreviewRow[];
  summary: { total: number; ready: number; withProblems: number; duplicates: number };
}
interface Result {
  added: number;
  merged: number;
  skipped: number;
}

/**
 * Import partners or operators from your research lists (BRIEF.md §5.3):
 * template → upload → check columns → review lines (problems, duplicates) → choose add / merge / skip → import.
 */
const route = useRoute();
const toast = useToast();
const kind = ref<ImportKind>(route.query.kind === 'operators' ? 'operators' : 'partners');
const fileName = ref('');
const csv = ref('');
const preview = ref<Preview | null>(null);
const mapping = reactive<Record<string, number | null>>({});
const decisions = reactive<Record<number, ImportAction>>({});
const loading = ref(false);
const importing = ref(false);
const result = ref<Result | null>(null);
const showReady = ref(false);
const input = ref<HTMLInputElement | null>(null);

const columns = computed(() => IMPORT_COLUMNS[kind.value]);
const label = computed(() => (kind.value === 'partners' ? 'partners' : 'operators'));

function reset() {
  fileName.value = '';
  csv.value = '';
  preview.value = null;
  result.value = null;
  for (const k of Object.keys(mapping)) delete mapping[k];
  for (const k of Object.keys(decisions)) delete decisions[Number(k)];
  if (input.value) input.value.value = '';
}

function chooseKind(k: ImportKind) {
  if (k === kind.value) return;
  kind.value = k;
  reset();
}

async function runPreview(withMapping: boolean) {
  loading.value = true;
  try {
    const res = await api<Preview>(`/imports/${kind.value}/preview`, {
      method: 'POST',
      json: { csv: csv.value, mapping: withMapping ? { ...mapping } : undefined },
    });
    preview.value = res;
    Object.assign(mapping, res.mapping);
    for (const k of Object.keys(decisions)) delete decisions[Number(k)];
    for (const r of res.rows) decisions[r.row] = r.suggested;
  } catch (e) {
    preview.value = null;
    toast.error(e instanceof ApiError ? e.message : "Couldn't read that file");
  } finally {
    loading.value = false;
  }
}

async function onFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  result.value = null;
  if (file.size > 2 * 1024 * 1024) {
    toast.error('That file is bigger than 2 MB. Split it into smaller files.');
    return;
  }
  fileName.value = file.name;
  csv.value = await file.text();
  await runPreview(false);
}

const attention = computed(
  () =>
    preview.value?.rows.filter((r) => r.problems.length || r.duplicates.length || r.sameAsRow) ??
    [],
);
const ready = computed(
  () =>
    preview.value?.rows.filter((r) => !r.problems.length && !r.duplicates.length && !r.sameAsRow) ??
    [],
);
const counts = computed(() => {
  const c = { add: 0, merge: 0, skip: 0 };
  for (const r of preview.value?.rows ?? []) c[decisions[r.row] ?? r.suggested]++;
  return c;
});
const importBlocker = computed(() => {
  if (!preview.value) return 'Choose a file first';
  if (preview.value.unmapped.length)
    return `Choose a column for: ${preview.value.unmapped.join(', ')}`;
  if (counts.value.add + counts.value.merge === 0) return 'Every line is set to skip';
  return null;
});

function rowTitle(r: PreviewRow) {
  return (kind.value === 'partners' ? r.values.firm : r.values.legal_name) || '(no name)';
}

async function doImport() {
  importing.value = true;
  try {
    const res = await api<Result>(`/imports/${kind.value}/commit`, {
      method: 'POST',
      json: {
        csv: csv.value,
        mapping: { ...mapping },
        decisions: Object.fromEntries(Object.entries(decisions).map(([k, v]) => [k, v])),
      },
    });
    result.value = res;
    preview.value = null;
    toast.success(`Imported: ${res.added} added, ${res.merged} merged, ${res.skipped} skipped`);
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : 'The import failed. Nothing was saved.');
  } finally {
    importing.value = false;
  }
}

const downloading = ref<string | null>(null);
async function save(path: string, name: string) {
  downloading.value = path;
  try {
    await download(path, name);
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : "Couldn't download the file");
  } finally {
    downloading.value = null;
  }
}
</script>

<template>
  <div>
    <RouterLink to="/settings" class="d-inline-block mb-2">‹ Settings</RouterLink>
    <h1 class="page-title mb-1">Import and export</h1>
    <p class="text-secondary">
      Bring in your research lists from a spreadsheet, or download your data.
    </p>

    <section class="card mb-3" aria-labelledby="imp-h">
      <div class="card-body">
        <h2 id="imp-h" class="h3">Import</h2>
        <div class="d-flex gap-2 mb-3" role="radiogroup" aria-label="What are you importing?">
          <button
            v-for="k in ['partners', 'operators'] as const"
            :key="k"
            type="button"
            role="radio"
            class="sj-chip"
            :class="{ 'is-active': kind === k }"
            :aria-checked="kind === k"
            @click="chooseKind(k)"
          >
            {{ k === 'partners' ? 'Partners' : 'Operators' }}
          </button>
        </div>

        <ol class="small text-secondary ps-3 mb-3">
          <li>
            Download the
            <button
              type="button"
              class="btn btn-link p-0 align-baseline text-decoration-underline"
              @click="save(`/imports/templates/${kind}.csv`, `${kind}-template.csv`)"
            >
              {{ label }} template
            </button>
            (exact columns and one example row), or use your own sheet: columns are matched by name.
          </li>
          <li>Save it as CSV and choose it below.</li>
          <li>Check the lines, choose add, merge or skip, then import.</li>
        </ol>

        <details class="small mb-3">
          <summary class="fw-bold">Columns for {{ label }}</summary>
          <ul class="mb-0 mt-2 ps-3">
            <li v-for="c in columns" :key="c.key">
              <code>{{ c.key }}</code><span v-if="c.required" class="text-danger"> (required)</span
              ><template v-if="c.help"> · {{ c.help }}</template>
            </li>
          </ul>
        </details>

        <input
          ref="input"
          type="file"
          tabindex="-1"
          aria-label="Choose the CSV file"
          accept=".csv,text/csv"
          class="visually-hidden"
          @change="onFile"
        />
        <SjButton :loading="loading" loading-label="Reading…" @click="input?.click()">{{
          fileName ? 'Choose another file' : 'Choose CSV file'
        }}</SjButton>
        <span v-if="fileName" class="ms-2 small text-secondary">{{ fileName }}</span>
      </div>
    </section>

    <!-- Result -->
    <section v-if="result" class="card mb-3">
      <div class="card-body text-center">
        <div class="sj-check mb-2" aria-hidden="true">✓</div>
        <h2 class="h3">Import done</h2>
        <p class="mb-3">
          {{ result.added }} added · {{ result.merged }} merged · {{ result.skipped }} skipped
        </p>
        <RouterLink
          :to="kind === 'partners' ? '/partners' : '/operators'"
          class="sj-btn sj-btn--primary text-decoration-none"
        >
          Open {{ label }}
        </RouterLink>
        <p v-if="kind === 'operators'" class="small text-secondary mt-2 mb-0">
          Imported operators start as not verified. Upload and verify their documents before
          quoting.
        </p>
      </div>
    </section>

    <template v-if="preview">
      <!-- Column matching -->
      <section class="card mb-3" aria-labelledby="map-h">
        <div class="card-body">
          <h2 id="map-h" class="h3">Columns</h2>
          <p class="small text-secondary">
            Matched from your file's header row. Change any that are wrong.
          </p>
          <div class="sj-map">
            <template v-for="c in columns" :key="c.key">
              <label :for="`map-${c.key}`" class="small fw-bold"
                >{{ c.label }}<span v-if="c.required" class="text-danger">*</span></label
              >
              <select
                :id="`map-${c.key}`"
                v-model="mapping[c.key]"
                class="form-select form-select-sm"
                :class="{ 'is-invalid': c.required && mapping[c.key] === null }"
                @change="runPreview(true)"
              >
                <option :value="null">— not in the file —</option>
                <option v-for="(h, i) in preview.headers" :key="i" :value="i">
                  {{ h || `Column ${i + 1}` }}
                </option>
              </select>
            </template>
          </div>
        </div>
      </section>

      <!-- Lines -->
      <section class="card mb-3" aria-labelledby="rows-h">
        <div class="card-body">
          <h2 id="rows-h" class="h3">Lines</h2>
          <div class="d-flex gap-2 flex-wrap mb-3">
            <span class="sj-badge sj-badge--muted">{{ preview.summary.total }} lines</span>
            <span class="sj-badge" style="background: #dcf2e4; color: #145c36"
              >✓ {{ ready.length }} ready</span
            >
            <span
              v-if="preview.summary.withProblems"
              class="sj-badge"
              style="background: #fde2df; color: #8a1c12"
              >✗ {{ preview.summary.withProblems }} with problems</span
            >
            <span v-if="preview.summary.duplicates" class="sj-badge sj-badge--warn"
              >⚠ {{ preview.summary.duplicates }} possible duplicate{{
                preview.summary.duplicates === 1 ? '' : 's'
              }}</span
            >
          </div>

          <div v-for="r in attention" :key="r.row" class="sj-line">
            <div class="d-flex justify-content-between gap-2 align-items-start">
              <div>
                <div class="fw-bold">Line {{ r.row }} · {{ rowTitle(r) }}</div>
                <ul v-if="r.problems.length" class="small text-danger mb-1 ps-3">
                  <li v-for="p in r.problems" :key="p">{{ p }}</li>
                </ul>
                <div v-for="d in r.duplicates" :key="d.id" class="small text-warning-emphasis">
                  ⚠ Same {{ d.matchedOn.join(' and ') }} as {{ d.name }}
                </div>
                <div v-if="r.sameAsRow" class="small text-warning-emphasis">
                  ⚠ Same as line {{ r.sameAsRow }} in this file
                </div>
              </div>
              <select
                v-model="decisions[r.row]"
                class="form-select form-select-sm sj-action"
                :aria-label="`What to do with line ${r.row}`"
              >
                <option value="add" :disabled="r.problems.length > 0">Add</option>
                <option value="merge" :disabled="r.problems.length > 0 || !r.duplicates.length">
                  Merge
                </option>
                <option value="skip">Skip</option>
              </select>
            </div>
          </div>

          <button
            v-if="ready.length"
            type="button"
            class="btn btn-link px-0"
            :aria-expanded="showReady"
            @click="showReady = !showReady"
          >
            {{ showReady ? 'Hide' : 'Show' }} {{ ready.length }} line{{
              ready.length === 1 ? '' : 's'
            }}
            ready to add
          </button>
          <template v-if="showReady">
            <div
              v-for="r in ready"
              :key="r.row"
              class="sj-line d-flex justify-content-between gap-2 align-items-center"
            >
              <span class="small"
                ><span class="fw-bold">Line {{ r.row }}</span> · {{ rowTitle(r) }}</span
              >
              <select
                v-model="decisions[r.row]"
                class="form-select form-select-sm sj-action"
                :aria-label="`What to do with line ${r.row}`"
              >
                <option value="add">Add</option>
                <option value="skip">Skip</option>
              </select>
            </div>
          </template>
        </div>
      </section>

      <div class="sj-actionbar">
        <SjButton
          block
          :loading="importing"
          loading-label="Importing…"
          :disabled-reason="importBlocker"
          @click="doImport"
        >
          Import: {{ counts.add }} add · {{ counts.merge }} merge · {{ counts.skip }} skip
        </SjButton>
      </div>
    </template>

    <section class="card mb-3" aria-labelledby="exp-h">
      <div class="card-body">
        <h2 id="exp-h" class="h3">Export</h2>
        <p class="small text-secondary">
          CSV files that open correctly in Excel and Google Sheets.
        </p>
        <div class="d-flex gap-2 flex-wrap">
          <SjButton
            variant="secondary"
            :loading="downloading === '/exports/partners.csv'"
            loading-label="Preparing…"
            @click="save('/exports/partners.csv', 'partners.csv')"
          >
            Download partners
          </SjButton>
          <SjButton
            variant="secondary"
            :loading="downloading === '/exports/weddings.csv'"
            loading-label="Preparing…"
            @click="save('/exports/weddings.csv', 'weddings.csv')"
          >
            Download weddings
          </SjButton>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.sj-map {
  display: grid;
  grid-template-columns: minmax(110px, 40%) 1fr;
  gap: 8px 12px;
  align-items: center;
}
.sj-line {
  padding: 10px 0;
  border-top: 1px solid #eceef2;
}
.sj-action {
  width: 110px;
  flex: none;
  min-height: 40px;
}
</style>
