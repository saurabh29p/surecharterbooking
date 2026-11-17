import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import TodayView from './views/TodayView.vue';

export const routes: RouteRecordRaw[] = [{ path: '/', name: 'today', component: TodayView }];

export function makeRouter(history = createWebHistory()) {
  return createRouter({ history, routes });
}
