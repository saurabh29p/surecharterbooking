<script setup lang="ts">
/** Partners | Clients switch at the top of the Partners tab. */
defineProps<{ active: 'partners' | 'clients' }>();
</script>

<template>
  <nav class="sj-segment mb-3" aria-label="Partners or clients">
    <RouterLink
      to="/partners"
      :class="{ 'is-active': active === 'partners' }"
      :aria-current="active === 'partners' ? 'page' : undefined"
    >
      Partners
    </RouterLink>
    <RouterLink
      to="/clients"
      :class="{ 'is-active': active === 'clients' }"
      :aria-current="active === 'clients' ? 'page' : undefined"
    >
      Clients
    </RouterLink>
  </nav>
</template>

<style scoped>
.sj-segment {
  display: flex;
  background: #e6e8ee;
  border-radius: 12px;
  padding: 4px;
  gap: 4px;
}
.sj-segment a {
  flex: 1;
  text-align: center;
  min-height: 44px;
  display: grid;
  place-items: center;
  border-radius: 9px;
  font-weight: 700;
  color: #3d4250;
  text-decoration: none;
  transition:
    background-color var(--sj-fast),
    box-shadow var(--sj-fast);
}
.sj-segment a.is-active {
  background: #fff;
  color: var(--sj-midnight);
  box-shadow: 0 1px 4px rgba(11, 16, 32, 0.12);
}
</style>
