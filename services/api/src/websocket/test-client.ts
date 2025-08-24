/**
 * WebSocket Client Test - Week 2 Day 3
 * Test client for trade WebSocket functionality
 */

import WebSocket from 'ws';

interface WebSocketMessage {
  type: string;
  data?: any;
  tradeId?: string;
  timestamp?: number;
}

class TradeWebSocketClient {
  private ws: WebSocket | null = null;
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  constructor(
    private url: string,
    private token: string
  ) {}

  /**
   * Connect to WebSocket server
   */
  async connect(): Promise<void> {
    try {
      const wsUrl = `${this.url}?token=${encodeURIComponent(this.token)}`;
      console.log(`🔗 Connecting to: ${wsUrl}`);

      this.ws = new WebSocket(wsUrl);

      this.ws.on('open', () => {
        console.log('✅ WebSocket connected');
        this.isConnected = true;
        this.reconnectAttempts = 0;
      });

      this.ws.on('message', (data: Buffer) => {
        try {
          const message: WebSocketMessage = JSON.parse(data.toString());
          this.handleMessage(message);
        } catch (error) {
          console.error('❌ Failed to parse message:', error);
        }
      });

      this.ws.on('close', (code: number, reason: Buffer) => {
        console.log(`❌ WebSocket closed: ${code} - ${reason.toString()}`);
        this.isConnected = false;
        this.attemptReconnect();
      });

      this.ws.on('error', (error: Error) => {
        console.error('❌ WebSocket error:', error);
      });

    } catch (error) {
      console.error('❌ Connection error:', error);
    }
  }

  /**
   * Handle incoming messages
   */
  private handleMessage(message: WebSocketMessage): void {
    console.log(`📨 Received: ${message.type}`);

    switch (message.type) {
      case 'connected':
        console.log('✅ Connection confirmed:', message.data);
        break;
      case 'subscribed':
        console.log(`📺 Subscribed to trade: ${message.tradeId}`);
        break;
      case 'trade_update':
        console.log(`📊 Trade update for ${message.tradeId}:`, message.data);
        break;
      case 'blockchain_event':
        console.log(`⛓️ Blockchain event:`, message.data);
        break;
      case 'pong':
        console.log('🏓 Pong received');
        break;
      default:
        console.log('🔍 Unknown message type:', message);
    }
  }

  /**
   * Subscribe to trade updates
   */
  subscribeToTrade(tradeId: string): void {
    if (!this.isConnected || !this.ws) {
      console.error('❌ Not connected to WebSocket');
      return;
    }

    const message: WebSocketMessage = {
      type: 'subscribe',
      tradeId,
      timestamp: Date.now()
    };

    this.ws.send(JSON.stringify(message));
    console.log(`📺 Subscribing to trade: ${tradeId}`);
  }

  /**
   * Unsubscribe from trade updates
   */
  unsubscribeFromTrade(tradeId: string): void {
    if (!this.isConnected || !this.ws) {
      console.error('❌ Not connected to WebSocket');
      return;
    }

    const message: WebSocketMessage = {
      type: 'unsubscribe',
      tradeId,
      timestamp: Date.now()
    };

    this.ws.send(JSON.stringify(message));
    console.log(`📺 Unsubscribing from trade: ${tradeId}`);
  }

  /**
   * Send ping
   */
  ping(): void {
    if (!this.isConnected || !this.ws) {
      console.error('❌ Not connected to WebSocket');
      return;
    }

    const message: WebSocketMessage = {
      type: 'ping',
      timestamp: Date.now()
    };

    this.ws.send(JSON.stringify(message));
    console.log('🏓 Ping sent');
  }

  /**
   * Attempt to reconnect
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('❌ Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.pow(2, this.reconnectAttempts) * 1000; // Exponential backoff

    console.log(`🔄 Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }
}

/**
 * Test WebSocket functionality
 */
async function testWebSocket() {
  // You would get this token from login endpoint
  const testToken = 'your-jwt-token-here';
  const wsUrl = 'ws://localhost:3000/trades-ws';

  const client = new TradeWebSocketClient(wsUrl, testToken);

  try {
    await client.connect();

    // Wait for connection
    setTimeout(() => {
      // Test subscription
      client.subscribeToTrade('test-trade-123');

      // Test ping
      setTimeout(() => {
        client.ping();
      }, 2000);

      // Test unsubscription
      setTimeout(() => {
        client.unsubscribeFromTrade('test-trade-123');
      }, 4000);

      // Disconnect after 10 seconds
      setTimeout(() => {
        console.log('🔌 Disconnecting...');
        client.disconnect();
        process.exit(0);
      }, 10000);
    }, 1000);

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Export for use in other files
export { TradeWebSocketClient };

// Run test if this file is executed directly
if (require.main === module) {
  console.log('🧪 Starting WebSocket client test...');
  testWebSocket();
}
