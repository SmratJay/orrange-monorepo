// API Test Component for development
'use client';

import { useState } from 'react';
import { useAuth } from '../../lib/hooks/useAuth';
import { useOrders } from '../../lib/hooks/useOrders';
import { apiClient } from '../../lib/api/client';

export default function ApiTestPage() {
  const { user, isAuthenticated, connectWallet, logout, loading: authLoading } = useAuth();
  const { orders, loading: ordersLoading, error: ordersError, refresh } = useOrders({ autoRefresh: false });
  const [testResult, setTestResult] = useState<string>('');

  const testHealthCheck = async () => {
    try {
      const response = await apiClient.getHealthCheck();
      setTestResult(`Health Check: ${JSON.stringify(response, null, 2)}`);
    } catch (error) {
      setTestResult(`Health Check Error: ${error}`);
    }
  };

  const testWalletConnect = async () => {
    try {
      // Mock wallet connection for testing
      const mockAddress = '0x1234567890123456789012345678901234567890';
      const mockSignature = 'mock_signature_for_testing';
      const mockMessage = 'Welcome to Orrange P2P!';
      
      await connectWallet(mockAddress, mockSignature, mockMessage);
      setTestResult('Wallet connected successfully!');
    } catch (error) {
      setTestResult(`Wallet Connection Error: ${error}`);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-8 space-y-8">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h1 className="text-3xl font-bold mb-6">Orrange P2P API Test Dashboard</h1>
        
        {/* API Health Test */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4">API Health Check</h2>
          <button
            onClick={testHealthCheck}
            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
          >
            Test API Health
          </button>
        </div>

        {/* Authentication Test */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4">Authentication</h2>
          {authLoading ? (
            <div>Loading authentication...</div>
          ) : isAuthenticated ? (
            <div>
              <div className="mb-4 p-4 bg-green-100 rounded">
                <h3 className="font-semibold">Authenticated as:</h3>
                <p>Wallet: {user?.walletAddress}</p>
                <p>Reputation: {user?.reputationScore}</p>
                <p>Trade Count: {user?.tradeCount}</p>
              </div>
              <button
                onClick={logout}
                className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded"
              >
                Logout
              </button>
            </div>
          ) : (
            <button
              onClick={testWalletConnect}
              className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
            >
              Test Wallet Connect
            </button>
          )}
        </div>

        {/* Orders Test */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4">Orders</h2>
          <div className="space-x-4">
            <button
              onClick={refresh}
              disabled={ordersLoading}
              className="bg-purple-500 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
            >
              {ordersLoading ? 'Loading...' : 'Fetch Orders'}
            </button>
          </div>
          
          {ordersError && (
            <div className="mt-4 p-4 bg-red-100 text-red-700 rounded">
              Error: {ordersError}
            </div>
          )}
          
          {orders.length > 0 && (
            <div className="mt-4">
              <h3 className="font-semibold mb-2">Orders ({orders.length}):</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full table-auto">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-4 py-2 text-left">ID</th>
                      <th className="px-4 py-2 text-left">Type</th>
                      <th className="px-4 py-2 text-left">Asset</th>
                      <th className="px-4 py-2 text-left">Amount</th>
                      <th className="px-4 py-2 text-left">Price</th>
                      <th className="px-4 py-2 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.slice(0, 5).map((order) => (
                      <tr key={order.id} className="border-b">
                        <td className="px-4 py-2 font-mono text-sm">{order.id?.substring(0, 8)}...</td>
                        <td className="px-4 py-2">{order.side}</td>
                        <td className="px-4 py-2">{order.asset}</td>
                        <td className="px-4 py-2">{order.amount}</td>
                        <td className="px-4 py-2">{order.price}</td>
                        <td className="px-4 py-2">
                          <span className={`px-2 py-1 rounded text-xs ${
                            order.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                          }`}>
                            {order.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Test Results */}
        {testResult && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4">Test Result</h2>
            <pre className="bg-gray-100 p-4 rounded text-sm overflow-x-auto">
              {testResult}
            </pre>
          </div>
        )}

        {/* API Status */}
        <div className="border-t pt-6">
          <h2 className="text-xl font-semibold mb-4">API Configuration</h2>
          <div className="bg-gray-50 p-4 rounded">
            <p><strong>API Base URL:</strong> http://localhost:8080/api/v1</p>
            <p><strong>Frontend URL:</strong> http://localhost:3001</p>
            <p><strong>Authenticated:</strong> {isAuthenticated ? 'Yes' : 'No'}</p>
            <p><strong>User ID:</strong> {user?.id || 'Not authenticated'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
