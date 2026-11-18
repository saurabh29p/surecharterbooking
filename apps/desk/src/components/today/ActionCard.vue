<script setup lang="ts">
import { URGENCY_LABELS, type TodayAction } from '@shubhjets/shared';
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import SjButton from '../SjButton.vue';

/**
 * One thing to do: what, why, and the one button that does it. Swipe left (or tap "Later") to
 * hide it until tomorrow morning (UX.md §4: swipe with a visible button alternative).
 */
const props = defineProps<{ action: TodayAction; busy: boolean }>();
const emit = defineEmits<{ later: []; flown: [legId: string] }>();
const router = useRouter();

const b = computed(() => props.action.button);
const primary = computed(() => props.action.urgency === 'NOW');

function press() {
  const btn = b.value;
  if (btn.type === 'OPEN') router.push(btn.to);
  else if (btn.type === 'MARK_FLOWN') emit('flown', btn.legId);
  else if (btn.href.startsWith('tel:')) window.location.href = btn.href;
  else window.open(btn.href, '_blank', 'noopener');
}

// Swipe left to "Later". Vertical scrolling wins until the finger clearly moves sideways.
const dx = ref(0);
let start: { x: number; y: number; id: number } | null = null;
let swiping = false;
const THRESHOLD = 96;

function down(e: PointerEvent) {
  if (e.pointerType === 'mouse') return;
  start = { x: e.clientX, y: e.clientY, id: e.pointerId };
  swiping = false;
}
function move(e: PointerEvent) {
  if (!start || e.pointerId !== start.id) return;
  const x = e.clientX - start.x;
  const y = e.clientY - start.y;
  if (!swiping) {
    if (Math.abs(y) > 10 && Math.abs(y) > Math.abs(x)) return void (start = null);
    if (x < -12) swiping = true;
    else return;
  }
  dx.value = Math.min(0, x);
}
function up() {
  if (swiping && dx.value <= -THRESHOLD) emit('later');
  start = null;
  swiping = false;
  dx.value = 0;
}
</script>

<template>
  <article
    class="sj-act"
    :class="`sj-act--${action.urgency.toLowerCase()}`"
    :aria-label="action.title"
    @pointerdown="down"
    @pointermove="move"
    @pointerup="up"
    @pointercancel="up"
  >
    <div
      class="sj-act__behind"
      aria-hidden="true"
      :style="{ opacity: Math.min(1, -dx / THRESHOLD) }"
    >
      Later
    </div>
    <div
      class="sj-act__body"
      :style="dx ? { transform: `translateX(${dx}px)`, transition: 'none' } : undefined"
    >
      <RouterLink :to="action.to" class="sj-act__main">
        <span class="sj-act__tag">{{ URGENCY_LABELS[action.urgency] }}</span>
        <span class="sj-act__title">{{ action.title }}</span>
        <span v-if="action.detail" class="sj-act__detail">{{ action.detail }}</span>
      </RouterLink>
      <div class="sj-act__buttons">
        <SjButton
          :variant="primary ? 'primary' : 'secondary'"
          size="sm"
          :loading="busy"
          loading-label="Saving…"
          @click="press"
        >
          {{ b.label }}
        </SjButton>
        <SjButton
          variant="ghost"
          size="sm"
          :aria-label="`Later: ${action.title}`"
          @click="emit('later')"
          >Later</SjButton
        >
      </div>
    </div>
  </article>
</template>

<style scoped>
.sj-act {
  position: relative;
  border-radius: 12px;
  overflow: hidden;
  touch-action: pan-y;
  background: #e9ebf0;
}
.sj-act__behind {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-right: 20px;
  font-weight: 700;
  color: #3d4250;
}
.sj-act__body {
  position: relative;
  background: #fff;
  border: 1px solid #e3e5ea;
  border-left: 4px solid #c9ccd4;
  border-radius: 12px;
  padding: 10px 12px 10px 12px;
  transition: transform 200ms var(--sj-ease-out);
}
.sj-act--now .sj-act__body {
  border-left-color: var(--sj-danger);
}
.sj-act--today .sj-act__body {
  border-left-color: var(--sj-gold);
}
.sj-act__main {
  display: block;
  color: inherit;
  text-decoration: none;
}
.sj-act__main:hover .sj-act__title {
  text-decoration: underline;
}
.sj-act__tag {
  display: inline-block;
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #5b606e;
  margin-bottom: 2px;
}
.sj-act--now .sj-act__tag {
  color: var(--sj-danger);
}
.sj-act--today .sj-act__tag {
  color: var(--sj-gold-dark);
}
.sj-act__title {
  display: block;
  font-weight: 700;
  line-height: 1.3;
}
.sj-act__detail {
  display: block;
  font-size: 0.85rem;
  color: #5b606e;
  margin-top: 2px;
}
.sj-act__buttons {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
.sj-act__buttons :deep(.sj-btn:first-child) {
  flex: 1;
}
@media (prefers-reduced-motion: reduce) {
  .sj-act__body {
    transition: none;
  }
}
</style>
