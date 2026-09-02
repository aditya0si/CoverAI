'use client';

import axios from 'axios';

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

export const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

export interface DecodedUser {
  id: string;
  email: string;
  role: string;
  full_name: string;
  avatar_url?: string | null;
  phone?: string | null;
  is_active?: boolean;
  is_verified?: boolean;
}

const USER_STORAGE_KEY = 'user_data';

export interface AuthResponse {
  token_type: 'bearer';
  user: DecodedUser;
}

function persistUser(user: DecodedUser | null): void {
  if (user) {
    try {
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    } catch {
      // localStorage unavailable (private mode) — session still works via HttpOnly cookie
    }
  } else {
    try {
      localStorage.removeItem(USER_STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}

export async function login(email: string, password: string): Promise<DecodedUser> {
  const { data } = await api.post<AuthResponse>('/auth/login', { email, password });
  persistUser(data.user);
  return data.user;
}

export async function loginWithGoogle(credential: string): Promise<DecodedUser> {
  const { data } = await api.post<AuthResponse>('/auth/google', { id_token: credential });
  persistUser(data.user);
  return data.user;
}

export async function logout(): Promise<void> {
  try {
    await api.post('/auth/logout');
  } catch {
    // Logout must always complete locally even if the API is unreachable.
  } finally {
    persistUser(null);
  }
}

export function getUser(): DecodedUser | null {
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DecodedUser;
    return parsed && typeof parsed === 'object' && typeof parsed.role === 'string' ? parsed : null;
  } catch {
    return null;
  }
}
