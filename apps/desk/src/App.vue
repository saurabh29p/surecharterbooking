<script setup lang="ts">
import { RouterView } from 'vue-router';
</script>

<template>
  <div class="page">
    <header class="navbar navbar-dark" style="background: var(--sj-midnight)">
      <div class="container-xl">
        <span class="navbar-brand sj-wordmark fs-2">ShubhJets</span>
      </div>
    </header>
    <main class="page-wrapper">
      <div class="container-xl py-4">
        <RouterView />
      </div>
    </main>
  </div>
</template>
