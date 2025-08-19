import { ethers } from 'ethers';
import { SiweMessage } from 'siwe';
import { generateNonce } from 'siwe';
import { useState, useCallback } from 'react';

export interface WalletAuthChallenge {
  nonce: string;
  message: string;
  expiresAt: Date;
  chainId?: number;
}

export interface WalletSignature {
  signature: string;
  message: string;
  address: string;
}

export interface WalletAuthResult {
  success: boolean;
  address?: string;
  error?: string;
  userData?: {
    address: string;
    chainId: number;
    issuedAt: string;
    expirationTime?: string;
  };
}

export class WalletAuth {
  private challenges = new Map<string, WalletAuthChallenge>();
  private readonly challengeExpiryMs: number;

  constructor(challengeExpiryMs: number = 300000) { // 5 minutes
    this.challengeExpiryMs = challengeExpiryMs;
    
    // Clean up expired challenges every minute
    setInterval(() => this.cleanupExpiredChallenges(), 60000);
  }

  /**
   * Generate SIWE (Sign-In with Ethereum) challenge
   */
  generateChallenge(
    address: string, 
    domain: string, 
    chainId: number = 1
  ): WalletAuthChallenge {
    const nonce = generateNonce();
    const issuedAt = new Date().toISOString();
    const expirationTime = new Date(Date.now() + this.challengeExpiryMs).toISOString();

    const siweMessage = new SiweMessage({
      domain,
      address,
      statement: 'Sign in to Orrange P2P Trading Platform',
      uri: `https://${domain}`,
      version: '1',
      chainId,
      nonce,
      issuedAt,
      expirationTime,
      resources: [
        'https://orrange.io/terms',
        'https://orrange.io/privacy'
      ]
    });

    const challenge: WalletAuthChallenge = {
      nonce,
      message: siweMessage.prepareMessage(),
      expiresAt: new Date(Date.now() + this.challengeExpiryMs),
      chainId
    };

    // Store challenge for verification
    this.challenges.set(nonce, challenge);

    return challenge;
  }

  /**
   * Verify wallet signature against challenge
   */
  async verifySignature(
    signature: string, 
    message: string, 
    nonce: string
  ): Promise<WalletAuthResult> {
    try {
      // Get stored challenge
      const challenge = this.challenges.get(nonce);
      if (!challenge) {
        return { success: false, error: 'Challenge not found or expired' };
      }

      // Check if challenge is expired
      if (new Date() > challenge.expiresAt) {
        this.challenges.delete(nonce);
        return { success: false, error: 'Challenge expired' };
      }

      // Verify message matches challenge
      if (message !== challenge.message) {
        return { success: false, error: 'Message mismatch' };
      }

      // Parse and verify SIWE message
      const siweMessage = new SiweMessage(message);
      const verificationResult = await siweMessage.verify({ signature });

      if (!verificationResult.success) {
        return { success: false, error: 'Signature verification failed' };
      }

      // Clean up used challenge
      this.challenges.delete(nonce);

      return {
        success: true,
        address: siweMessage.address,
        userData: {
          address: siweMessage.address,
          chainId: siweMessage.chainId,
          issuedAt: siweMessage.issuedAt!,
          expirationTime: siweMessage.expirationTime
        }
      };

    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Verification failed' 
      };
    }
  }

  /**
   * Verify Ethereum personal message signature (fallback method)
   */
  async verifyPersonalMessage(
    message: string, 
    signature: string, 
    expectedAddress: string
  ): Promise<WalletAuthResult> {
    try {
      const recoveredAddress = ethers.verifyMessage(message, signature);
      
      if (recoveredAddress.toLowerCase() !== expectedAddress.toLowerCase()) {
        return { success: false, error: 'Address mismatch' };
      }

      return {
        success: true,
        address: recoveredAddress,
        userData: {
          address: recoveredAddress,
          chainId: 1, // Default to Ethereum
          issuedAt: new Date().toISOString()
        }
      };

    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Signature verification failed' 
      };
    }
  }

  /**
   * Generate a simple authentication message
   */
  generateSimpleMessage(address: string, timestamp: number): string {
    return `Sign this message to authenticate with Orrange P2P:\n\nAddress: ${address}\nTimestamp: ${timestamp}\n\nThis request will not trigger a blockchain transaction or cost any gas fees.`;
  }

  /**
   * Validate wallet address format
   */
  isValidAddress(address: string, type: 'ethereum' | 'bitcoin' = 'ethereum'): boolean {
    if (type === 'ethereum') {
      return ethers.isAddress(address);
    }
    
    if (type === 'bitcoin') {
      // Basic Bitcoin address validation
      const btcRegex = /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$|^bc1[a-z0-9]{39,59}$/;
      return btcRegex.test(address);
    }

    return false;
  }

  /**
   * Get challenge by nonce
   */
  getChallenge(nonce: string): WalletAuthChallenge | undefined {
    return this.challenges.get(nonce);
  }

  /**
   * Clean up expired challenges
   */
  private cleanupExpiredChallenges(): void {
    const now = new Date();
    for (const [nonce, challenge] of this.challenges.entries()) {
      if (now > challenge.expiresAt) {
        this.challenges.delete(nonce);
      }
    }
  }

  /**
   * Clear all challenges (for testing)
   */
  clearChallenges(): void {
    this.challenges.clear();
  }
}

/**
 * Multi-chain wallet support
 */
export class MultiChainWalletAuth {
  private walletAuth: WalletAuth;
  private supportedChains: Map<number, string>;

  constructor(challengeExpiryMs?: number) {
    this.walletAuth = new WalletAuth(challengeExpiryMs);
    this.supportedChains = new Map([
      [1, 'Ethereum Mainnet'],
      [137, 'Polygon'],
      [56, 'BSC'],
      [43114, 'Avalanche'],
      [250, 'Fantom']
    ]);
  }

  /**
   * Generate challenge for specific chain
   */
  generateChainChallenge(
    address: string, 
    domain: string, 
    chainId: number
  ): WalletAuthChallenge | null {
    if (!this.supportedChains.has(chainId)) {
      return null;
    }

    return this.walletAuth.generateChallenge(address, domain, chainId);
  }

  /**
   * Verify signature with chain validation
   */
  async verifyChainSignature(
    signature: string, 
    message: string, 
    nonce: string,
    expectedChainId: number
  ): Promise<WalletAuthResult> {
    const challenge = this.walletAuth.getChallenge(nonce);
    
    if (!challenge || challenge.chainId !== expectedChainId) {
      return { success: false, error: 'Chain ID mismatch' };
    }

    return this.walletAuth.verifySignature(signature, message, nonce);
  }

  /**
   * Add supported chain
   */
  addSupportedChain(chainId: number, name: string): void {
    this.supportedChains.set(chainId, name);
  }

  /**
   * Get supported chains
   */
  getSupportedChains(): Array<{ chainId: number; name: string }> {
    return Array.from(this.supportedChains.entries()).map(([chainId, name]) => ({
      chainId,
      name
    }));
  }
}

// React hook for wallet authentication
export function useWalletAuth() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [walletAuth] = useState(() => new MultiChainWalletAuth());

  const generateChallenge = useCallback(async (address: string, domain: string, chainId: number = 1) => {
    setIsLoading(true);
    setError(null);
    try {
      const challenge = walletAuth.generateChainChallenge(address, domain, chainId);
      return challenge;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate challenge';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [walletAuth]);

  const verifySignature = useCallback(async (signature: string, message: string, nonce: string, expectedChainId: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await walletAuth.verifyChainSignature(signature, message, nonce, expectedChainId);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to verify signature';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [walletAuth]);

  return {
    generateChallenge,
    verifySignature,
    isLoading,
    error,
    getSupportedChains: walletAuth.getSupportedChains.bind(walletAuth),
    addSupportedChain: walletAuth.addSupportedChain.bind(walletAuth)
  };
}
