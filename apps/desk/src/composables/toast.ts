import { reactive } from 'vue';

export type ToastTone = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
  /** Reversible actions offer Undo instead of an "Are you sure?" dialog (UX.md §2). */
  undo?: () => void | Promise<void>;
}

const toasts = reactive<Toast[]>([]);
let nextId = 1;
const AUTO_HIDE_MS = 4000;

function dismiss(id: number) {
  const i = toasts.findIndex((t) => t.id === id);
  if (i >= 0) toasts.splice(i, 1);
}

function show(t: Omit<Toast, 'id' | 'tone'> & { tone?: ToastTone }): number {
  const id = nextId++;
  toasts.push({ tone: 'success', ...t, id });
  setTimeout(() => dismiss(id), AUTO_HIDE_MS);
  return id;
}

export function useToast() {
  return {
    toasts,
    show,
    dismiss,
    success: (message: string, undo?: Toast['undo']) => show({ message, tone: 'success', undo }),
    error: (message: string) => show({ message, tone: 'error' }),
  };
}
