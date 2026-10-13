import { create } from 'zustand';
import { UserData, getUser } from './auth';

interface ToastState {
  message: string | null;
  type: 'success' | 'error' | 'info' | null;
}

interface AppStore {
  // Authentication State
  user: UserData | null;
  setUser: (user: UserData | null) => void;
  syncUser: () => void;

  // Sidebar Menu State
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;

  // Conversation context state
  activeConversationId: string | null;
  setActiveConversationId: (id: string | null) => void;

  // Global Toast State
  toast: ToastState;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  hideToast: () => void;
}

export const useAppStore = create<AppStore>((set) => ({
  // Authentication State
  user: typeof window !== 'undefined' ? getUser() : null,
  setUser: (user) => set({ user }),
  syncUser: () => set({ user: getUser() }),

  // Sidebar Menu State
  sidebarOpen: false,
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

  // Conversation context state
  activeConversationId: null,
  setActiveConversationId: (activeConversationId) => set({ activeConversationId }),

  // Global Toast State
  toast: { message: null, type: null },
  showToast: (message, type = 'success') => {
    set({ toast: { message, type } });
    
    // Auto-dismiss after 4 seconds
    setTimeout(() => {
      set((state) => {
        // Only clear if it hasn't been overwritten by another toast
        if (state.toast.message === message) {
          return { toast: { message: null, type: null } };
        }
        return {};
      });
    }, 4000);
  },
  hideToast: () => set({ toast: { message: null, type: null } }),
}));
