// Authentication hook for Orrange P2P
import { useState, useCallback, useEffect } from 'react';
import { apiClient } from '../api/client';
import { User } from '../types/api';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Check if user is authenticated on mount
  useEffect(() => {
    const initAuth = async () => {
      if (apiClient.isAuthenticated()) {
        try {
          const response = await apiClient.getProfile();
          if (response.success && response.data) {
            setUser(response.data);
          }
        } catch (err) {
          console.warn('Failed to load user profile:', err);
          apiClient.clearAuthToken();
        }
      }
      setLoading(false);
    };

    initAuth();
  }, []);

  const connectWallet = useCallback(async (walletAddress: string, signature: string, message: string) => {
    try {
      setLoading(true);
      setError(null);

      const response = await apiClient.connectWallet({
        address: walletAddress,
        signature,
        message,
      });

      if (response.success && response.data) {
        apiClient.setAuthToken(response.data.accessToken);
        setUser(response.data.user);
        return response.data;
      } else {
        throw new Error(response.error || 'Wallet connection failed');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiClient.logout();
    } catch (err) {
      console.warn('Logout error:', err);
    } finally {
      apiClient.clearAuthToken();
      setUser(null);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!apiClient.isAuthenticated()) {
      return;
    }

    try {
      const response = await apiClient.getProfile();
      if (response.success && response.data) {
        setUser(response.data);
      }
    } catch (err) {
      console.warn('Failed to refresh profile:', err);
    }
  }, []);

  return {
    user,
    loading,
    error,
    isAuthenticated: !!user,
    connectWallet,
    logout,
    refreshProfile,
  };
}
