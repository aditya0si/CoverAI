'use client';

/**
 * Central client state store (zustand). Holds the current user, global toast
 * UI state, and the sidebar toggle so any page can reach them.
 */
import { create } from 'zustand';
import type { UserRole } from '@coverai/shared-types';

export interface DecodedUser {
  id: string;
  email: string;
  role: UserRole;
  full_name: string;
  avatar_url?: string | null;
  phone?: string | null;
  is_active?: boolean;
  is_verified?: boolean;
}

export type ToastType = 'success' | 'error' | 'info';

export interface ToastState {
  message: string;
  type: ToastType;
}

interface AppState {
  user: DecodedUser | null;
  toast: ToastState;
  sidebarOpen: boolean;
  setUser: (user: DecodedUser | null) => void;
  syncUser: () => void;
  showToast: (message: string, type?: ToastType) => void;
  hideToast: () => void;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  user: null,
  toast: { message: '', type: 'success' },
  sidebarOpen: false,

  setUser: (user) => {
    set({ user });
    if (typeof window !== 'undefined') {
      if (user) {
        localStorage.setItem('user_data', JSON.stringify(user));
      } else {
        localStorage.removeItem('user_data');
      }
    }
  },

  // Restore the persisted user (e.g. on app shell mount / tab sync).
  syncUser: () => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem('user_data');
      if (!raw) {
        set({ user: null });
        return;
      }
      const parsed = JSON.parse(raw) as DecodedUser;
      if (parsed && parsed.id) {
        set({ user: parsed });
      } else {
        set({ user: null });
      }
    } catch {
      set({ user: null });
    }
  },

  showToast: (message, type = 'success') => {
    set({ toast: { message, type } });
    setTimeout(() => get().hideToast(), 4000);
  },

  hideToast: () => set({ toast: { message: '', type: 'success' } }),

  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
}));
