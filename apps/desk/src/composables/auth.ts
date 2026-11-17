import { reactive, readonly } from 'vue';
import * as client from '../api/client';
import type { SessionUser } from '../api/client';

const state = reactive({
  user: null as SessionUser | null,
  /** False until the first silent refresh has finished, so the router can wait for it. */
  ready: false,
});

client.onSessionChange((session) => {
  state.user = session?.user ?? null;
});

let restoring: Promise<void> | null = null;

/** On app start, use the 30-day refresh cookie to log straight back in. */
export function restoreSession(): Promise<void> {
  restoring ??= client.refreshSession().then(() => {
    state.ready = true;
  });
  return restoring;
}

export function useAuth() {
  return {
    state: readonly(state),
    login: client.login,
    logout: client.logout,
    logoutAllDevices: client.logoutAllDevices,
    markSetupDone(user: SessionUser) {
      state.user = user;
    },
  };
}
