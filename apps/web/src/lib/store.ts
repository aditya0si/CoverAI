'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { getUser, type DecodedUser } from './auth';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastState {
  message: string;
  type: ToastType;
}

interface AppState {
  user: DecodedUser | null;
  sidebarOpen: boolean;
  toast: ToastState;
}

const EMPTY_TOAST: ToastState = { message: '', type: 'info' };

let state: AppState = {
  user: null,
  sidebarOpen: false,
  toast: EMPTY_TOAST,
};

// Server-side snapshot: stays empty so prerendered HTML is stable.
const serverSnapshot: AppState = {
  user: null,
  sidebarOpen: false,
  toast: EMPTY_TOAST,
};

const listeners = new Set<() => void>();
let toastTimer: ReturnType<typeof setTimeout> | null = null;

function setState(patch: Partial<AppState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return state;
}

export function showToast(message: string, type: ToastType = 'info') {
  setState({ toast: { message, type } });
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => setState({ toast: EMPTY_TOAST }), 4000);
}

export function hideToast() {
  if (toastTimer) clearTimeout(toastTimer);
  setState({ toast: EMPTY_TOAST });
}

export function syncUser() {
  setState({ user: getUser() });
}

export function setSidebarOpen(open: boolean) {
  setState({ sidebarOpen: open });
}

export function toggleSidebar() {
  setState({ sidebarOpen: !state.sidebarOpen });
}

export function useAppStore() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => serverSnapshot);

  const show = useCallback((message: string, type: ToastType = 'info') => {
    showToast(message, type);
  }, []);
  const hide = useCallback(() => hideToast(), []);
  const sync = useCallback(() => syncUser(), []);
  const setOpen = useCallback((open: boolean) => setSidebarOpen(open), []);
  const toggle = useCallback(() => toggleSidebar(), []);

  return {
    user: snapshot.user,
    sidebarOpen: snapshot.sidebarOpen,
    toast: snapshot.toast,
    showToast: show,
    hideToast: hide,
    syncUser: sync,
    setSidebarOpen: setOpen,
    toggleSidebar: toggle,
  };
}
