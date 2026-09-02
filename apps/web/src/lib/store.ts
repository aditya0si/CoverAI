'use client';

import { create } from 'zustand';
import { getUser, DecodedUser } from '@/lib/auth';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastState {
  message: string;
  type: ToastType;
}

interface AppState {
  user: DecodedUser | null;
  sidebarOpen: boolean;
  toast: ToastState | null;
  setUser: (user: DecodedUser | null) => void;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  syncUser: () => void;
  showToast: (message: string, type?: ToastType) => void;
  hideToast: () => void;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useAppStore = create<AppState>((set, get) => ({
  user: null,
  sidebarOpen: false,
  toast: null,

  setUser: (user) => set({ user }),

  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

  syncUser: () => {
    const current = getUser();
    if (current?.id !== get().user?.id) {
      set({ user: current });
    }
  },

  showToast: (message, type = 'info') => {
    if (toastTimer) {
      clearTimeout(toastTimer);
    }
    set({ toast: { message, type } });
    toastTimer = setTimeout(() => {
      set({ toast: null });
    }, 4000);
  },

  hideToast: () => {
    if (toastTimer) {
      clearTimeout(toastTimer);
    }
    set({ toast: null });
  },
}));
