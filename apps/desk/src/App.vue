<script setup lang="ts">
import { RouterLink, RouterView, useRoute } from 'vue-router';
import SjToasts from './components/SjToasts.vue';

const route = useRoute();
const tabs = [
  { to: '/', label: 'Today' },
  { to: '/settings', label: 'Settings' },
];
/** A tab stays highlighted on its sub-pages (e.g. Settings → a business profile). */
const isActive = (to: string) =>
  to === '/' ? route.path === '/' : route.path === to || route.path.startsWith(`${to}/`);
</script>

<template>
  <a href="#main" class="visually-hidden-focusable">Skip to content</a>
  <template v-if="route.meta.bare">
    <RouterView />
  </template>
  <template v-else>
    <header class="sj-topbar">
      <div class="container-xl sj-topbar__inner">
        <RouterLink
          to="/"
          class="sj-wordmark fs-2 text-decoration-none"
          aria-label="ShubhJets, go to Today"
          >ShubhJets</RouterLink
        >
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
      >
        <span class="sj-tabbar__icon" aria-hidden="true" />
        {{ t.label }}
      </RouterLink>
    </nav>
  </template>
  <SjToasts />
</template>
