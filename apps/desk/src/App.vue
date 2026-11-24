<script setup lang="ts">
import logoOnDark from './assets/logo-on-dark.svg?url';
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router';
import SjBanner from './components/SjBanner.vue';
import SjToasts from './components/SjToasts.vue';

const route = useRoute();
const tabs: { to: string; label: string; also?: string[] }[] = [
  { to: '/', label: 'Today' },
  { to: '/weddings', label: 'Weddings' },
  { to: '/operators', label: 'Operators' },
  { to: '/partners', label: 'Partners', also: ['/clients'] },
  { to: '/settings', label: 'Settings' },
];

// Start loading a screen's code the moment a finger touches its tab (about 100 ms before the tap ends).
const router = useRouter();
function warm(to: string) {
  for (const m of router.resolve(to).matched) {
    const c = m.components?.default;
    if (typeof c === 'function') void (c as () => Promise<unknown>)();
  }
}
/** A tab stays highlighted on its sub-pages (e.g. Settings → a business profile). */
const isActive = (to: string) => {
  if (to === '/') return route.path === '/';
  const tab = tabs.find((t) => t.to === to);
  return [to, ...(tab?.also ?? [])].some((p) => route.path === p || route.path.startsWith(`${p}/`));
};
</script>

<template>
  <a href="#main" class="visually-hidden-focusable">Skip to content</a>
  <!-- Nothing until the router has resolved the first route (avoids a flash of the app shell on /login). -->
  <template v-if="!route.matched.length" />
  <template v-else-if="route.meta.bare">
    <main id="main" tabindex="-1">
      <RouterView />
    </main>
  </template>
  <template v-else>
    <header class="sj-topbar">
      <div class="container-xl sj-topbar__inner">
        <RouterLink to="/" class="sj-brand text-decoration-none" aria-label="Vaanika, go to Today"
          ><img :src="logoOnDark" alt="" width="150" height="42"
        /></RouterLink>
        <nav class="sj-topnav d-none d-md-flex gap-1" aria-label="Main">
          <RouterLink
            v-for="t in tabs"
            :key="t.to"
            :to="t.to"
            active-class=""
            exact-active-class=""
            :class="{ 'router-link-active': isActive(t.to) }"
            :aria-current="isActive(t.to) ? 'page' : undefined"
          >
            {{ t.label }}
          </RouterLink>
        </nav>
      </div>
    </header>
    <SjBanner />
    <main id="main" class="sj-main">
      <div class="container-xl py-3">
        <RouterView />
      </div>
    </main>
    <nav class="sj-tabbar d-md-none" aria-label="Main">
      <RouterLink
        v-for="t in tabs"
        :key="t.to"
        :to="t.to"
        active-class=""
        exact-active-class=""
        :class="{ 'router-link-active': isActive(t.to) }"
        :aria-current="isActive(t.to) ? 'page' : undefined"
        @pointerdown="warm(t.to)"
      >
        <span class="sj-tabbar__icon" aria-hidden="true" />
        {{ t.label }}
      </RouterLink>
    </nav>
  </template>
  <SjToasts />
</template>
