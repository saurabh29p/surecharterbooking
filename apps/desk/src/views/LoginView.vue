<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ApiError } from '../api/client';
import SjButton from '../components/SjButton.vue';
import SjField from '../components/SjField.vue';
import { useAuth } from '../composables/auth';

const auth = useAuth();
const router = useRouter();
const route = useRoute();

const email = ref('');
const password = ref('');
const showPassword = ref(false);
const busy = ref(false);
const error = ref<string | null>(null);
const fields = ref<Record<string, string>>({});

async function submit() {
  if (busy.value) return;
  error.value = null;
  fields.value = {};
  if (!email.value.trim() || !password.value) {
    fields.value = {
      ...(email.value.trim() ? {} : { email: 'Enter your email' }),
      ...(password.value ? {} : { password: 'Enter your password' }),
    };
    return;
  }
  busy.value = true;
  try {
    const session = await auth.login(email.value.trim(), password.value);
    const next =
      typeof route.query.next === 'string' && route.query.next.startsWith('/')
        ? route.query.next
        : '/';
    await router.replace(session.user.setupCompleted ? next : '/setup');
  } catch (e) {
    if (e instanceof ApiError) {
      error.value = Object.keys(e.fields).length ? null : e.message;
      fields.value = e.fields;
    } else {
      error.value = 'Something went wrong. Please try again.';
    }
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="sj-login">
    <div class="sj-login__card">
      <div class="text-center mb-4">
        <div class="sj-wordmark fs-1">ShubhJets</div>
        <div class="text-secondary">Wedding Charter Desk</div>
      </div>
      <form novalidate @submit.prevent="submit">
        <SjField
          v-model="email"
          label="Email"
          type="email"
          inputmode="email"
          autocomplete="username"
          :server-error="fields.email"
        />
        <div class="position-relative">
          <SjField
            v-model="password"
            label="Password"
            :type="showPassword ? 'text' : 'password'"
            autocomplete="current-password"
            :server-error="fields.password"
          />
          <button
            type="button"
            class="sj-login__peek"
            :aria-label="showPassword ? 'Hide password' : 'Show password'"
            :aria-pressed="showPassword"
            @click="showPassword = !showPassword"
          >
            {{ showPassword ? 'Hide' : 'Show' }}
          </button>
        </div>
        <div v-if="error" class="alert alert-danger py-2" role="alert">{{ error }}</div>
        <SjButton type="submit" block :loading="busy" loading-label="Logging in…">Log in</SjButton>
        <p class="text-secondary small text-center mt-3 mb-0">
          You'll stay logged in on this device for 30 days.
        </p>
      </form>
    </div>
  </div>
</template>

<style scoped>
.sj-login {
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: 16px;
  background: radial-gradient(ellipse at top, #18214a 0%, var(--sj-midnight) 60%);
}
.sj-login__card {
  width: 100%;
  max-width: 400px;
  background: #fff;
  border-radius: 16px;
  padding: 28px 20px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
}
.sj-login__peek {
  position: absolute;
  right: 4px;
  top: 30px;
  min-height: 40px;
  min-width: 56px;
  border: 0;
  background: none;
  color: var(--sj-midnight);
  font-weight: 700;
  font-size: 0.85rem;
  cursor: pointer;
  border-radius: 8px;
}
.sj-login__peek:hover {
  background: #eef0f4;
}
</style>
