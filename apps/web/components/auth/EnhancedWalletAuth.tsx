'use client';

import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useWallet } from '@/lib/hooks/useWallet';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, Smartphone, CheckCircle, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

interface User2FASetup {
  qrCode: string;
  secret: string;
  backupCodes: string[];
}

interface EnhancedAuthStatus {
  isAuthenticated: boolean;
  user?: {
    id: string;
    walletAddress: string;
    reputationScore: number;
    riskLevel: string;
    kycStatus: string;
    twoFactorEnabled: boolean;
  };
  requires2FA?: boolean;
}

export function EnhancedWalletAuth() {
  const { address, isConnected, connect, disconnect } = useWallet();
  const [authStatus, setAuthStatus] = useState<EnhancedAuthStatus>({ isAuthenticated: false });
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [twoFASetup, setTwoFASetup] = useState<User2FASetup | null>(null);
  const [twoFACode, setTwoFACode] = useState('');
  const [showBackupCodes, setShowBackupCodes] = useState(false);

  /**
   * Enhanced wallet authentication with our new backend
   */
  const authenticateWallet = async () => {
    if (!isConnected || !address) {
      toast.error('Please connect your wallet first');
      return;
    }

    setIsAuthenticating(true);
    try {
      // Step 1: Get signing message from backend
      const messageResponse = await fetch(`/api/auth/message?walletAddress=${address}`);
      const messageData = await messageResponse.json();

      if (!messageData.success) {
        throw new Error(messageData.error);
      }

      // Step 2: Sign message with wallet
      const provider = new ethers.providers.Web3Provider((window as any).ethereum);
      const signer = provider.getSigner();
      const signature = await signer.signMessage(messageData.message);

      // Step 3: Authenticate with backend
      const authResponse = await fetch('/api/auth/connect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          walletAddress: address,
          signature,
          message: messageData.message,
          chainId: await provider.getNetwork().then(n => n.chainId),
          timestamp: messageData.timestamp,
          deviceInfo: {
            userAgent: navigator.userAgent,
            fingerprint: await generateDeviceFingerprint(),
          },
        }),
      });

      const authData = await authResponse.json();

      if (!authData.success) {
        throw new Error(authData.error);
      }

      // Update auth status
      setAuthStatus({
        isAuthenticated: true,
        user: authData.user,
        requires2FA: authData.requires2FA,
      });

      // Store tokens if provided
      if (authData.tokens) {
        localStorage.setItem('accessToken', authData.tokens.accessToken);
        toast.success('Wallet authenticated successfully!');
      } else if (authData.requires2FA) {
        toast.info('2FA verification required');
      }

    } catch (error: any) {
      console.error('Authentication failed:', error);
      toast.error(error.message || 'Authentication failed');
    } finally {
      setIsAuthenticating(false);
    }
  };

  /**
   * Setup 2FA for enhanced security
   */
  const setup2FA = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        throw new Error('Authentication required');
      }

      const response = await fetch('/api/auth/setup-2fa', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error);
      }

      setTwoFASetup({
        qrCode: data.qrCode,
        secret: data.secret,
        backupCodes: data.backupCodes,
      });

      toast.success('2FA setup initiated. Scan the QR code with your authenticator app.');

    } catch (error: any) {
      console.error('2FA setup failed:', error);
      toast.error(error.message || '2FA setup failed');
    }
  };

  /**
   * Verify 2FA code
   */
  const verify2FA = async () => {
    if (!twoFACode.trim() || twoFACode.length !== 6) {
      toast.error('Please enter a valid 6-digit code');
      return;
    }

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/auth/verify-2fa', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({
          token: twoFACode,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error);
      }

      // Update tokens if provided (completing login)
      if (data.tokens) {
        localStorage.setItem('accessToken', data.tokens.accessToken);
      }

      // Update auth status
      setAuthStatus(prev => ({
        ...prev,
        user: data.user || prev.user,
        requires2FA: false,
      }));

      setTwoFASetup(null);
      setTwoFACode('');
      toast.success('2FA enabled successfully!');

    } catch (error: any) {
      console.error('2FA verification failed:', error);
      toast.error(error.message || '2FA verification failed');
    }
  };

  /**
   * Logout and clear tokens
   */
  const logout = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      if (token) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      }

      localStorage.removeItem('accessToken');
      setAuthStatus({ isAuthenticated: false });
      disconnect();
      toast.success('Logged out successfully');

    } catch (error: any) {
      console.error('Logout error:', error);
      // Clear local state anyway
      localStorage.removeItem('accessToken');
      setAuthStatus({ isAuthenticated: false });
    }
  };

  /**
   * Generate device fingerprint for security
   */
  const generateDeviceFingerprint = async (): Promise<string> => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx?.fillText('Orrange P2P', 10, 10);
    
    const fingerprint = {
      screen: `${screen.width}x${screen.height}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      language: navigator.language,
      platform: navigator.platform,
      canvas: canvas.toDataURL(),
    };

    return btoa(JSON.stringify(fingerprint)).slice(0, 32);
  };

  /**
   * Get risk level color
   */
  const getRiskLevelColor = (riskLevel: string) => {
    switch (riskLevel) {
      case 'LOW': return 'bg-green-100 text-green-800';
      case 'MEDIUM': return 'bg-yellow-100 text-yellow-800';
      case 'HIGH': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  /**
   * Get KYC status color
   */
  const getKYCStatusColor = (status: string) => {
    switch (status) {
      case 'VERIFIED': return 'bg-green-100 text-green-800';
      case 'PENDING': return 'bg-yellow-100 text-yellow-800';
      case 'REJECTED': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Check auth status on component mount
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (token && address) {
      // Verify token is still valid
      fetch('/api/auth/status', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
        .then(res => res.json())
        .then(data => {
          if (data.success && data.authenticated) {
            setAuthStatus({
              isAuthenticated: true,
              user: data.user,
            });
          } else {
            localStorage.removeItem('accessToken');
          }
        })
        .catch(() => {
          localStorage.removeItem('accessToken');
        });
    }
  }, [address]);

  return (
    <div className="space-y-6">
      {/* Wallet Connection Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Enhanced Wallet Authentication
          </CardTitle>
          <CardDescription>
            Secure wallet-based authentication with 2FA protection
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isConnected ? (
            <div>
              <p className="text-sm text-muted-foreground mb-3">
                Connect your wallet to access Orrange P2P trading platform
              </p>
              <Button onClick={connect} className="w-full">
                Connect Wallet
              </Button>
            </div>
          ) : !authStatus.isAuthenticated ? (
            <div>
              <p className="text-sm text-muted-foreground mb-3">
                Wallet connected: {address?.slice(0, 6)}...{address?.slice(-4)}
              </p>
              <Button 
                onClick={authenticateWallet} 
                disabled={isAuthenticating}
                className="w-full"
              >
                {isAuthenticating ? 'Authenticating...' : 'Sign Message to Login'}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Status:</span>
                <Badge variant="outline" className="bg-green-50 text-green-700">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Authenticated
                </Badge>
              </div>
              
              {authStatus.user && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Reputation:</span>
                    <span className="text-sm">
                      {authStatus.user.reputationScore.toFixed(1)}/5.0
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Risk Level:</span>
                    <Badge className={getRiskLevelColor(authStatus.user.riskLevel)}>
                      {authStatus.user.riskLevel}
                    </Badge>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">KYC Status:</span>
                    <Badge className={getKYCStatusColor(authStatus.user.kycStatus)}>
                      {authStatus.user.kycStatus}
                    </Badge>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">2FA:</span>
                    <Badge variant={authStatus.user.twoFactorEnabled ? "default" : "outline"}>
                      {authStatus.user.twoFactorEnabled ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </div>
                </>
              )}
              
              <Button onClick={logout} variant="outline" className="w-full mt-4">
                Logout
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2FA Setup */}
      {authStatus.isAuthenticated && authStatus.user && !authStatus.user.twoFactorEnabled && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5" />
              Enable Two-Factor Authentication
            </CardTitle>
            <CardDescription>
              Add an extra layer of security to your account
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!twoFASetup ? (
              <div>
                <Alert className="mb-4">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    2FA is highly recommended for trading operations involving large amounts.
                  </AlertDescription>
                </Alert>
                <Button onClick={setup2FA} className="w-full">
                  Setup 2FA
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium mb-2">1. Scan QR Code</h4>
                  <div className="bg-white p-4 rounded border inline-block">
                    <img src={twoFASetup.qrCode} alt="2FA QR Code" className="w-48 h-48" />
                  </div>
                </div>
                
                <div>
                  <h4 className="font-medium mb-2">2. Enter 6-digit code</h4>
                  <input
                    type="text"
                    value={twoFACode}
                    onChange={(e) => setTwoFACode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    className="w-full px-3 py-2 border rounded-md text-center tracking-widest font-mono"
                    maxLength={6}
                  />
                </div>
                
                <Button 
                  onClick={verify2FA} 
                  disabled={twoFACode.length !== 6}
                  className="w-full"
                >
                  Verify & Enable 2FA
                </Button>
                
                {twoFASetup.backupCodes && (
                  <div>
                    <Button 
                      onClick={() => setShowBackupCodes(!showBackupCodes)}
                      variant="outline"
                      size="sm"
                    >
                      {showBackupCodes ? 'Hide' : 'Show'} Backup Codes
                    </Button>
                    
                    {showBackupCodes && (
                      <div className="mt-2 p-3 bg-gray-50 rounded text-xs font-mono">
                        <p className="font-normal mb-2">Save these backup codes:</p>
                        <div className="grid grid-cols-2 gap-1">
                          {twoFASetup.backupCodes.map((code, i) => (
                            <div key={i}>{code}</div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 2FA Required for Login */}
      {authStatus.requires2FA && (
        <Card>
          <CardHeader>
            <CardTitle>Two-Factor Authentication Required</CardTitle>
            <CardDescription>
              Enter your 6-digit authenticator code to complete login
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <input
              type="text"
              value={twoFACode}
              onChange={(e) => setTwoFACode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              className="w-full px-3 py-2 border rounded-md text-center tracking-widest font-mono"
              maxLength={6}
            />
            <Button 
              onClick={verify2FA} 
              disabled={twoFACode.length !== 6}
              className="w-full"
            >
              Verify Code
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
