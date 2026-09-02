import axios from 'axios';
import type { UserRole } from '@coverai/shared-types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
const USER_DATA_KEY = 'user_data';

export interface DecodedUser {
  id: string;
  email: string;
  role?: UserRole;
  full_name?: string | null;
  avatar_url?: string | null;
  phone?: string | null;
}

export interface AuthResponse {
  token_type: string;
  user: DecodedUser;
}

// Cookie-based auth: the backend sets HttpOnly access/refresh tokens.
export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

function persistUser(user: DecodedUser) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(USER_DATA_KEY, JSON.stringify(user));
}

export function getUser(): DecodedUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(USER_DATA_KEY);
    return raw ? (JSON.parse(raw) as DecodedUser) : null;
  } catch {
    return null;
  }
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>('/auth/login', { email, password });
  persistUser(data.user);
  return data;
}

export async function loginWithGoogle(idToken: string): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>('/auth/google', { id_token: idToken });
  persistUser(data.user);
  return data;
}

export async function logout(): Promise<void> {
  try {
    await api.post('/auth/logout');
  } finally {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(USER_DATA_KEY);
    }
  }
}
