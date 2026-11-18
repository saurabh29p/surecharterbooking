<script setup lang="ts">
import {
  COMMISSION_BASIS_LABELS,
  GST_KEYS,
  SETTING_DEFS,
  SETTING_GROUPS,
  formatDateTime,
  formatINR,
  validateSetting,
  type SettingDef,
  type SettingGroup,
} from '@shubhjets/shared';
import { computed, onMounted, reactive, ref } from 'vue';
import { api, ApiError } from '../../api/client';
import SjButton from '../../components/SjButton.vue';
import SjSkeleton from '../../components/SjSkeleton.vue';
import {
  fromDraft,
  sameDraft,
  toDraft,
  useSettings,
  type Draft,
  type SettingsResponse,
} from '../../composables/settings';
import { useToast } from '../../composables/toast';

const settings = useSettings();
const toast = useToast();

const loading = ref(true);
const drafts = reactive<Record<string, Draft>>({});
const saved = reactive<Record<string, Draft>>({});
const errors = reactive<Record<string, string>>({});
const saving = ref<SettingGroup | null>(null);
const gstConfirmed = ref(false);

// Cancellation charges get their own editor in the quote step.
const defsFor = (g: SettingGroup) =>
  SETTING_DEFS.filter((d) => d.group === g && d.kind !== 'schedule');
const gstSavedConfirmed = computed(() => settings.row('gst.rate_bps')?.confirmed === true);
/** Most recent change to any setting in the group. */
function lastChanged(g: SettingGroup): string | null {
  const times = defsFor(g)
    .map((d) => settings.row(d.key)?.updatedAt)
    .filter((x): x is string => !!x)
    .map((x) => new Date(x).getTime());
  return times.length ? formatDateTime(new Date(Math.max(...times))) : null;
}

function syncFromStore() {
  for (const def of SETTING_DEFS) {
    const row = settings.row(def.key);
    if (!row) continue;
    drafts[def.key] = toDraft(def, row.value);
    saved[def.key] = toDraft(def, row.value);
  }
  gstConfirmed.value = gstSavedConfirmed.value;
}

onMounted(async () => {
  try {
    await settings.load(true);
    syncFromStore();
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : "Couldn't load settings");
  } finally {
    loading.value = false;
  }
});

const gstEdited = computed(() =>
  GST_KEYS.some((k) => drafts[k] !== undefined && !sameDraft(drafts[k]!, saved[k]!)),
);
const dirty = (g: SettingGroup) =>
  defsFor(g).some(
    (d) => drafts[d.key] !== undefined && !sameDraft(drafts[d.key]!, saved[d.key]!),
  ) ||
  (g === 'tax' && gstConfirmed.value !== gstSavedConfirmed.value);

/** Editing the GST values means the CA's confirmation no longer applies (same rule as the API). */
function onGstInput() {
  if (gstEdited.value) gstConfirmed.value = false;
}

function check(def: SettingDef): unknown {
  try {
    const value = fromDraft(def, drafts[def.key]!);
    const problem = validateSetting(def, value);
    if (problem) throw new Error(problem);
    delete errors[def.key];
    return value;
  } catch (e) {
    errors[def.key] = (e as Error).message;
    return undefined;
  }
}

async function send(values: Record<string, unknown>, confirmGst?: boolean) {
  const res = await api<SettingsResponse>('/settings', {
    method: 'PATCH',
    json: { values, confirmGst },
  });
  settings.apply(res);
  syncFromStore();
}

async function save(g: SettingGroup) {
  const changed = defsFor(g).filter((d) => !sameDraft(drafts[d.key]!, saved[d.key]!));
  const values: Record<string, unknown> = {};
  const previous: Record<string, unknown> = {};
  for (const def of changed) {
    const v = check(def);
    if (v === undefined) continue;
    values[def.key] = v;
    previous[def.key] = settings.row(def.key)?.value;
  }
  if (changed.some((d) => errors[d.key])) {
    toast.error('Please fix the highlighted fields');
    return;
  }
  const confirmGst = g === 'tax' ? gstConfirmed.value : undefined;
  const previousConfirmed = gstSavedConfirmed.value;
  saving.value = g;
  try {
    await send(values, confirmGst);
    toast.success('Saved', async () => {
      await send(previous, g === 'tax' ? previousConfirmed : undefined);
      toast.success('Change undone');
    });
  } catch (e) {
    if (e instanceof ApiError && Object.keys(e.fields).length) {
      Object.assign(errors, e.fields);
      toast.error('Please fix the highlighted fields');
    } else {
      toast.error(e instanceof ApiError ? e.message : "Couldn't save. Please try again.");
    }
  } finally {
    saving.value = null;
  }
}

function moneyHint(def: SettingDef): string | undefined {
  try {
    return formatINR(fromDraft(def, drafts[def.key]!) as number, { paise: 'never' });
  } catch {
    return undefined;
  }
}
</script>

<template>
  <div>
    <RouterLink to="/settings" class="d-inline-block mb-2">‹ Settings</RouterLink>
    <h1 class="page-title mb-3">Pricing and rules</h1>
    <SjSkeleton v-if="loading" :lines="8" height="3rem" />

    <form
      v-for="g in SETTING_GROUPS"
      v-else
      :id="g.key"
      :key="g.key"
      class="card mb-3"
      novalidate
      @submit.prevent="save(g.key)"
    >
      <div class="card-body">
        <div class="d-flex align-items-center gap-2 flex-wrap mb-1">
          <h2 class="h3 mb-0">{{ g.title }}</h2>
          <template v-if="g.key === 'tax'">
            <span v-if="gstSavedConfirmed" class="sj-badge sj-badge--gold"
              >✓ Confirmed by your CA</span
            >
            <span v-else class="sj-badge sj-badge--warn">⚠ Not confirmed yet</span>
          </template>
        </div>
        <p class="text-secondary small">{{ g.intro }}</p>

        <div v-for="def in defsFor(g.key)" :key="def.key" class="mb-3">
          <label :for="def.key" class="form-label">{{ def.label }}</label>

          <div
            v-if="def.kind === 'commission' && typeof drafts[def.key] === 'object'"
            class="d-flex gap-2 flex-wrap"
          >
            <select
              :id="def.key"
              v-model="(drafts[def.key] as { basis: string }).basis"
              class="form-select"
              style="max-width: 260px"
            >
              <option v-for="(label, value) in COMMISSION_BASIS_LABELS" :key="value" :value="value">
                {{ label }}
              </option>
            </select>
            <div class="input-group" style="max-width: 140px">
              <input
                v-model="(drafts[def.key] as { pct: string }).pct"
                class="form-control"
                inputmode="decimal"
                :aria-label="`${def.label} percentage`"
                :class="{ 'is-invalid': errors[def.key] }"
                @blur="check(def)"
              />
              <span class="input-group-text">%</span>
            </div>
          </div>

          <div
            v-else-if="def.kind === 'enum'"
            class="d-grid gap-2"
            role="radiogroup"
            :aria-label="def.label"
          >
            <label
              v-for="o in def.options"
              :key="o.value"
              class="sj-choice"
              :class="{ 'is-selected': drafts[def.key] === o.value }"
            >
              <input v-model="drafts[def.key]" type="radio" :name="def.key" :value="o.value" />
              <span>{{ o.label }}</span>
            </label>
          </div>

          <textarea
            v-else-if="def.multiline"
            :id="def.key"
            v-model="drafts[def.key] as string"
            class="form-control"
            rows="4"
            :maxlength="def.maxLength"
            :class="{ 'is-invalid': errors[def.key] }"
            @blur="check(def)"
          />

          <div
            v-else
            class="input-group"
            :style="{ maxWidth: def.kind === 'text' ? '240px' : '260px' }"
          >
            <span v-if="def.kind === 'money'" class="input-group-text">₹</span>
            <input
              :id="def.key"
              v-model="drafts[def.key] as string"
              class="form-control"
              :inputmode="
                def.kind === 'percent'
                  ? 'decimal'
                  : def.kind === 'text' && !def.pattern
                    ? 'text'
                    : 'numeric'
              "
              :maxlength="def.maxLength"
              :class="{ 'is-invalid': errors[def.key] }"
              @input="def.group === 'tax' && onGstInput()"
              @blur="check(def)"
            />
            <span v-if="def.kind === 'percent'" class="input-group-text">%</span>
            <span v-else-if="def.unit" class="input-group-text">{{ def.unit }}</span>
          </div>

          <div v-if="errors[def.key]" class="invalid-feedback d-block">{{ errors[def.key] }}</div>
          <div v-else-if="def.kind === 'money' && moneyHint(def)" class="form-hint">
            {{ moneyHint(def) }}
          </div>
          <div v-else-if="def.help" class="form-hint">{{ def.help }}</div>
        </div>

        <label v-if="g.key === 'tax'" class="form-check mb-3">
          <input v-model="gstConfirmed" class="form-check-input" type="checkbox" />
          <span class="form-check-label">My CA has confirmed this GST rate and SAC code</span>
          <span class="form-hint d-block"
            >Until then, quotes and invoices carry a warning. Changing either value un-ticks
            this.</span
          >
        </label>

        <div class="d-flex align-items-center gap-2">
          <SjButton
            type="submit"
            :loading="saving === g.key"
            loading-label="Saving…"
            :disabled-reason="dirty(g.key) ? null : 'Nothing has changed yet'"
          >
            Save changes
          </SjButton>
          <span v-if="lastChanged(g.key)" class="text-secondary small"
            >Last changed {{ lastChanged(g.key) }}</span
          >
        </div>
      </div>
    </form>
  </div>
</template>

<style scoped>
.sj-choice {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 12px;
  border: 1px solid #d6d9e0;
  border-radius: 10px;
  cursor: pointer;
  min-height: 44px;
  transition:
    border-color var(--sj-fast),
    background-color var(--sj-fast);
}
.sj-choice:hover {
  border-color: var(--sj-gold);
}
.sj-choice.is-selected {
  border-color: var(--sj-gold);
  background: #fbf6ea;
}
.sj-choice input {
  margin-top: 4px;
}
</style>
