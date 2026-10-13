import axios from 'axios';

// Resolve backend API URL from Next environment or default to local FastAPI dev port
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true, // Always send cookies (access_token HttpOnly cookie)
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Response interceptor.
 *
 * IMPORTANT: We do NOT automatically redirect on 401 here.
 * Doing so caused an infinite redirect loop:
 *   - access_token cookie expires (15 min) but refresh_token indicator stays for 7 days
 *   - middleware sees refresh_token → thinks user is logged in → redirects away from /login
 *   - 401 interceptor fires → sends to /login
 *   - middleware immediately redirects away again → loop
 *
 * Instead, individual pages/components handle 401 responses themselves (e.g. by
 * calling logout() or showing an error). The Next.js middleware is the authoritative
 * gatekeeper for protected routes.
 */
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Clear stale user data on auth failure, but do NOT navigate
    if (error.response?.status === 401) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('user_data');
      }
    }
    return Promise.reject(error);
  }
);

export interface UserData {
  id: string;
  email: string;
  role: string;
  full_name: string;
  avatar_url?: string | null;
}

/**
 * Sends a login request with email/password credentials.
 * The backend sets the HttpOnly access_token cookie automatically.
 * We also persist user data in localStorage and a 'user_role' cookie
 * so the Next.js edge middleware can read the role for role-based redirects.
 */
export async function login(email: string, password: string) {
  const response = await api.post('/auth/login', { email, password });
  const user: UserData = response.data.user;

  if (typeof window !== 'undefined' && user) {
    localStorage.setItem('user_data', JSON.stringify(user));
    // Set a plain (non-HttpOnly) cookie so the Next.js edge middleware
    // can read the role for role-based redirects without accessing localStorage.
    document.cookie = `user_role=${user.role}; path=/; SameSite=Lax`;
  }

  return { user };
}

/**
 * Authenticates a user via Google Sign-In.
 * Accepts the Google ID token from the Google Identity Services callback.
 * The backend verifies it, creates/updates the user, and sets auth cookies.
 */
export async function loginWithGoogle(idToken: string) {
  const response = await api.post('/auth/google', { id_token: idToken });
  const user: UserData = response.data.user;

  if (typeof window !== 'undefined' && user) {
    localStorage.setItem('user_data', JSON.stringify(user));
    document.cookie = `user_role=${user.role}; path=/; SameSite=Lax`;
  }

  return { user };
}

/**
 * Logs out the user.
 * Always clears local state and cookies regardless of API response,
 * so users can never get stuck in an authenticated-but-broken state.
 */
export async function logout() {
  try {
    await api.post('/auth/logout');
  } catch (error) {
    // Ignore API errors — we always want to clear local state
    console.error('Logout API call failed (ignoring):', error);
  } finally {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('user_data');
      // Clear both cookies client-side as a safety net
      document.cookie = 'user_role=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
      document.cookie = 'refresh_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
      window.location.href = '/login';
    }
  }
}

/**
 * Gets the current user from localStorage (populated during login).
 * Returns null if not authenticated or if localStorage is unavailable (SSR).
 */
export function getUser(): UserData | null {
  if (typeof window === 'undefined') return null;

  const userData = localStorage.getItem('user_data');
  if (!userData) return null;

  try {
    return JSON.parse(userData);
  } catch {
    return null;
  }
}

// Export for backwards compatibility with existing code
export type DecodedUser = UserData;
