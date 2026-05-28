'use client';

import { useState, useEffect } from 'react';
import { getUser, logout as authLogout, DecodedUser } from '@/lib/auth';

/**
 * A custom React hook that extracts and provides the current authenticated user's
 * profile details from localStorage.
 * 
 * Automatically synchronizes changes across tabs using storage event listeners.
 */
export function useUser() {
  const [user, setUser] = useState<DecodedUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Read and set user from localStorage
  const fetchUser = () => {
    try {
      const currentUser = getUser();
      setUser(currentUser);
    } catch (error) {
      console.error('Error loading user inside useUser hook:', error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Initial fetch
    fetchUser();

    // Event listener to synchronize auth status across tabs/windows in real time
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'user_data') {
        fetchUser();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  /**
   * Logs out the user by calling the API and flushing local states.
   */
  const handleLogout = async () => {
    setLoading(true);
    try {
      await authLogout();
    } finally {
      setUser(null);
      setLoading(false);
    }
  };

  return {
    user,
    isAuthenticated: !!user,
    loading,
    logout: handleLogout,
    refreshUser: fetchUser,
  };
}
