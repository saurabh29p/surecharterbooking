import { watch } from 'vue';
import {
  createRouter,
  createWebHistory,
  type RouteRecordRaw,
  type RouterHistory,
} from 'vue-router';
import { restoreSession, useAuth } from './composables/auth';

export const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('./views/LoginView.vue'),
    meta: { public: true, bare: true },
  },
  {
    path: '/setup',
    name: 'setup',
    component: () => import('./views/SetupView.vue'),
    meta: { bare: true },
  },
  { path: '/', name: 'today', component: () => import('./views/TodayView.vue') },
  {
    path: '/partners',
    name: 'partners',
    component: () => import('./views/partners/PartnersView.vue'),
  },
  {
    path: '/partners/new',
    name: 'partner-new',
    component: () => import('./views/partners/PartnerNewView.vue'),
  },
  {
    path: '/partners/:id',
    name: 'partner',
    component: () => import('./views/partners/PartnerView.vue'),
  },
  { path: '/clients', name: 'clients', component: () => import('./views/clients/ClientsView.vue') },
  {
    path: '/clients/:id',
    name: 'client',
    component: () => import('./views/clients/ClientView.vue'),
  },
  {
    path: '/operators',
    name: 'operators',
    component: () => import('./views/operators/OperatorsView.vue'),
  },
  {
    path: '/operators/new',
    name: 'operator-new',
    component: () => import('./views/operators/OperatorNewView.vue'),
  },
  {
    path: '/operators/:id',
    name: 'operator',
    component: () => import('./views/operators/OperatorView.vue'),
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('./views/settings/SettingsView.vue'),
  },
  {
    path: '/settings/profiles',
    name: 'profiles',
    component: () => import('./views/settings/ProfilesView.vue'),
  },
  {
    path: '/settings/rules',
    name: 'rules',
    component: () => import('./views/settings/RulesView.vue'),
  },
  {
    path: '/settings/activity',
    name: 'activity',
    component: () => import('./views/settings/ActivityView.vue'),
  },
  {
    path: '/settings/security',
    name: 'security',
    component: () => import('./views/settings/SecurityView.vue'),
  },
  {
    path: '/settings/profiles/:id',
    name: 'profile',
    component: () => import('./views/settings/ProfileEditView.vue'),
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

declare module 'vue-router' {
  interface RouteMeta {
    /** Reachable without logging in. */
    public?: boolean;
    /** Full-screen page without the app's navigation. */
    bare?: boolean;
  }
}

export function makeRouter(history: RouterHistory = createWebHistory()) {
  const router = createRouter({ history, routes, scrollBehavior: () => ({ top: 0 }) });
  const auth = useAuth();

  router.beforeEach(async (to) => {
    await restoreSession();
    const user = auth.state.user;
    if (!user)
      return to.meta.public
        ? true
        : { name: 'login', query: to.fullPath === '/' ? {} : { next: to.fullPath } };
    if (to.name === 'login') return { name: user.setupCompleted ? 'today' : 'setup' };
    if (!user.setupCompleted && to.name !== 'setup') return { name: 'setup' };
    return true;
  });

  // Session ended (refresh failed, e.g. after "log out all devices" on another phone): go to the login screen.
  watch(
    () => auth.state.user,
    (user, before) => {
      if (before && !user && !router.currentRoute.value.meta.public)
        void router.replace({ name: 'login' });
    },
  );

  return router;
}
