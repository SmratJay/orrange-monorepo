// Wallet integration hooks for Orrange P2P
'use client';

import { useState, useCallback } from 'react';
import { useAccount, useConnect, useDisconnect, useSignMessage } from 'wagmi';
import { useWalletAuth } from '@orrange/auth/wallet';
import { apiClient } from '../api/client';
import { useAuthStore } from '../store/auth';
import { toast } from 'sonner';

export function useWallet() {
  const { address, isConnected, isConnecting } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { signMessageAsync } = useSignMessage();
  
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const { login, logout } = useAuthStore();
  const walletAuth = useWalletAuth();

  const connectWallet = useCallback(async (connectorId?: string) => {
    try {
      const connector = connectors.find(c => c.id === connectorId) || connectors[0];
      if (connector) {
        connect({ connector });
      }
    } catch (error) {
      console.error('Wallet connection failed:', error);
      toast.error('Failed to connect wallet');
    }
  }, [connect, connectors]);

  const authenticateWithWallet = useCallback(async () => {
    if (!address || !isConnected) {
      toast.error('Please connect your wallet first');
      return false;
    }

    setIsAuthenticating(true);

    try {
      // Generate authentication challenge
      const challenge = await walletAuth.generateChallenge(
        address,
        window.location.hostname,
        1 // Ethereum mainnet
      );

      if (!challenge) {
        toast.error('Failed to generate authentication challenge');
        return false;
      }

      // Sign the message
      const signature = await signMessageAsync({
        message: challenge.message,
      });

      // Verify the signature locally first
      const verificationResult = await walletAuth.verifySignature(
        signature,
        challenge.message,
        challenge.nonce,
        1 // Expected chain ID
      );

      if (!verificationResult.success) {
        toast.error('Signature verification failed');
        return false;
      }

      // Verify with backend
      const response = await apiClient.walletConnect(
        signature,
        challenge.message,
        address,
        challenge.nonce
      );

      if (response.success) {
        // Store auth tokens
        login({
          user: response.data.user,
          accessToken: response.data.accessToken,
          refreshToken: response.data.refreshToken,
        });

        // Set API client token
        apiClient.setAuthToken(response.data.accessToken);

        toast.success('Wallet authenticated successfully!');
        return true;
      } else {
        throw new Error(response.message || 'Authentication failed');
      }
    } catch (error: any) {
      console.error('Wallet authentication failed:', error);
      toast.error(error.message || 'Failed to authenticate wallet');
      return false;
    } finally {
      setIsAuthenticating(false);
    }
  }, [address, isConnected, signMessageAsync, walletAuth, login]);

  const disconnectWallet = useCallback(async () => {
    try {
      disconnect();
      logout();
      apiClient.clearAuthToken();
      toast.success('Wallet disconnected');
    } catch (error) {
      console.error('Disconnect failed:', error);
    }
  }, [disconnect, logout]);

  return {
    // Wallet state
    address,
    isConnected,
    isConnecting,
    isAuthenticating,
    
    // Wallet actions
    connectWallet,
    disconnectWallet,
    authenticateWithWallet,
    
    // Available connectors
    connectors: connectors.map(connector => ({
      id: connector.id,
      name: connector.name,
      icon: connector.icon,
    })),
  };
}

export function useWalletBalance() {
  const { address } = useAccount();
  const [balances, setBalances] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);

  const fetchBalances = useCallback(async () => {
    if (!address) return;

    setIsLoading(true);
    try {
      // This would integrate with our chains package
      // For now, we'll use a placeholder
      const mockBalances = {
        ETH: '1.234',
        USDT: '1000.50',
        USDC: '750.25',
        BTC: '0.05432',
      };
      setBalances(mockBalances);
    } catch (error) {
      console.error('Failed to fetch balances:', error);
    } finally {
      setIsLoading(false);
    }
  }, [address]);

  return {
    balances,
    isLoading,
    fetchBalances,
    refetch: fetchBalances,
  };
}

export function useWalletTransactions() {
  const { address } = useAccount();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchTransactions = useCallback(async () => {
    if (!address) return;

    setIsLoading(true);
    try {
      // This would integrate with blockchain explorers
      // For now, we'll use placeholder data
      const mockTransactions = [
        {
          id: '0x123...',
          type: 'send',
          asset: 'USDT',
          amount: '100.00',
          to: '0xabc...',
          timestamp: new Date(),
          status: 'confirmed',
        },
        {
          id: '0x456...',
          type: 'receive',
          asset: 'ETH',
          amount: '0.5',
          from: '0xdef...',
          timestamp: new Date(Date.now() - 3600000),
          status: 'confirmed',
        },
      ];
      setTransactions(mockTransactions);
    } catch (error) {
      console.error('Failed to fetch transactions:', error);
    } finally {
      setIsLoading(false);
    }
  }, [address]);

  return {
    transactions,
    isLoading,
    fetchTransactions,
    refetch: fetchTransactions,
  };
}

// Hook for managing wallet connection state
export function useWalletConnection() {
  const { isConnected, address } = useAccount();
  const { user } = useAuthStore();
  
  const isAuthenticated = !!user && !!address;
  const needsAuthentication = isConnected && !isAuthenticated;

  return {
    isConnected,
    isAuthenticated,
    needsAuthentication,
    address,
    user,
  };
}
