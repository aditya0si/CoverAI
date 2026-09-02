'use client';

/**
 * Authentication flow helpers: login / logout / Google sign-in, plus a small
 * axios instance used by the register page.
 */
import { api } from './api-client';
import { useAppStore } from './store';
import type { DecodedUser } from './store';
import type { UserRole } from '@coverai/shared-types';

export type { DecodedUser };
export { api };

interface AuthResponseUser {
  id: string;
  email: string;
  role: UserRole;
  full_name: string;
  avatar_url?: string | null;
}

async function persistAuthUser(user: AuthResponseUser): Promise<void> {
  useAppStore.getState().setUser(user);
}

export async function login(email: string, password: string): Promise<AuthResponseUser> {
  const { data } = await api.post<{ token_type: string; user: AuthResponseUser }>('/auth/login', {
    email,
    password,
  });
  await persistAuthUser(data.user);
  return data.user;
}

export async function loginWithGoogle(credential: string): Promise<AuthResponseUser> {
  const { data } = await api.post<{ token_type: string; user: AuthResponseUser }>('/auth/google', {
    id_token: credential,
  });
  await persistAuthUser(data.user);
  return data.user;
}

export async function logout(): Promise<void> {
  try {
    await api.post('/auth/logout');
  } finally {
    useAppStore.getState().setUser(null);
  }
}

export function getUser(): DecodedUser | null {
  return useAppStore.getState().user;
}
