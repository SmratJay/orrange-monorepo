// Real-time WebSocket Server for Orrange P2P
import { FastifyInstance } from 'fastify';
import { WebSocketServer, WebSocket } from 'ws';
import { EventEmitter } from 'events';
import Redis from 'ioredis';

interface WebSocketClient {
  id: string;
  socket: WebSocket;
  subscriptions: Set<string>;
  userId?: string;
  lastPing: number;
  isAlive: boolean;
}

interface WebSocketMessage {
  type: 'subscribe' | 'unsubscribe' | 'ping' | 'pong' | 'auth';
  data: any;
  timestamp: number;
}

interface BroadcastMessage {
  type: 'orderbook_update' | 'trade_executed' | 'price_update' | 'order_status';
  channel: string;
  data: any;
  timestamp: number;
}

export class WebSocketManager extends EventEmitter {
  private wss: WebSocketServer;
  private redis: Redis;
  private clients = new Map<string, WebSocketClient>();
  private channelSubscriptions = new Map<string, Set<string>>(); // channel -> client IDs
  private isRunning = false;

  // Performance metrics
  private metrics = {
    totalConnections: 0,
    activeConnections: 0,
    messagesSent: 0,
    messagesReceived: 0,
    subscriptions: 0,
    averageLatency: 0,
  };

  constructor(server: any, redis: Redis) {
    super();
    
    this.redis = redis;
    this.wss = new WebSocketServer({ 
      server,
      path: '/ws',
      clientTracking: true,
    });

    this.setupWebSocketServer();
    this.setupRedisSubscriptions();
    this.startHealthCheck();
  }

  private setupWebSocketServer() {
    this.wss.on('connection', (socket: WebSocket, request) => {
      const clientId = this.generateClientId();
      const client: WebSocketClient = {
        id: clientId,
        socket,
        subscriptions: new Set(),
        lastPing: Date.now(),
        isAlive: true,
      };

      this.clients.set(clientId, client);
      this.metrics.totalConnections++;
      this.metrics.activeConnections++;

      console.log(`📡 WebSocket client connected: ${clientId} (${this.metrics.activeConnections} active)`);

      // Set up ping/pong for connection health
      socket.on('pong', () => {
        client.isAlive = true;
        client.lastPing = Date.now();
      });

      // Handle incoming messages
      socket.on('message', (data) => {
        this.handleClientMessage(clientId, data);
      });

      // Handle client disconnection
      socket.on('close', () => {
        this.handleClientDisconnect(clientId);
      });

      socket.on('error', (error) => {
        console.error(`WebSocket error for client ${clientId}:`, error);
        this.handleClientDisconnect(clientId);
      });

      // Send welcome message
      this.sendToClient(clientId, {
        type: 'connected',
        data: {
          clientId,
          timestamp: Date.now(),
          availableChannels: this.getAvailableChannels(),
        },
        timestamp: Date.now(),
      });
    });
  }

  private setupRedisSubscriptions() {
    // Subscribe to all trading pair channels
    this.redis.psubscribe('orderbook:*');
    this.redis.psubscribe('trades:*');
    this.redis.psubscribe('prices:*');
    this.redis.psubscribe('order:status:*');

    this.redis.on('pmessage', (pattern, channel, message) => {
      try {
        const data = JSON.parse(message);
        const broadcastMessage: BroadcastMessage = {
          type: this.getMessageType(channel),
          channel: this.extractChannelName(channel),
          data,
          timestamp: Date.now(),
        };

        this.broadcastToChannel(broadcastMessage.channel, broadcastMessage);
      } catch (error) {
        console.error('Error processing Redis message:', error);
      }
    });
  }

  private handleClientMessage(clientId: string, data: Buffer) {
    try {
      this.metrics.messagesReceived++;
      const client = this.clients.get(clientId);
      if (!client) return;

      const message: WebSocketMessage = JSON.parse(data.toString());
      const startTime = Date.now();

      switch (message.type) {
        case 'subscribe':
          this.handleSubscribe(clientId, message.data);
          break;
        
        case 'unsubscribe':
          this.handleUnsubscribe(clientId, message.data);
          break;
        
        case 'ping':
          this.handlePing(clientId);
          break;
        
        case 'auth':
          this.handleAuth(clientId, message.data);
          break;
        
        default:
          console.warn(`Unknown message type: ${message.type}`);
      }

      // Update latency metrics
      const latency = Date.now() - startTime;
      this.metrics.averageLatency = (this.metrics.averageLatency * 0.9) + (latency * 0.1);

    } catch (error) {
      console.error(`Error handling message from client ${clientId}:`, error);
    }
  }

  private handleSubscribe(clientId: string, data: { channels: string[] }) {
    const client = this.clients.get(clientId);
    if (!client) return;

    for (const channel of data.channels) {
      // Validate channel
      if (!this.isValidChannel(channel)) {
        this.sendToClient(clientId, {
          type: 'error',
          data: { message: `Invalid channel: ${channel}` },
          timestamp: Date.now(),
        });
        continue;
      }

      // Add to client subscriptions
      client.subscriptions.add(channel);
      
      // Add to channel subscriptions
      if (!this.channelSubscriptions.has(channel)) {
        this.channelSubscriptions.set(channel, new Set());
      }
      this.channelSubscriptions.get(channel)!.add(clientId);
      
      this.metrics.subscriptions++;

      // Send current state for the channel
      this.sendCurrentChannelState(clientId, channel);

      console.log(`📡 Client ${clientId} subscribed to ${channel}`);
    }

    // Send confirmation
    this.sendToClient(clientId, {
      type: 'subscribed',
      data: {
        channels: data.channels,
        totalSubscriptions: client.subscriptions.size,
      },
      timestamp: Date.now(),
    });
  }

  private handleUnsubscribe(clientId: string, data: { channels: string[] }) {
    const client = this.clients.get(clientId);
    if (!client) return;

    for (const channel of data.channels) {
      client.subscriptions.delete(channel);
      
      const channelSubs = this.channelSubscriptions.get(channel);
      if (channelSubs) {
        channelSubs.delete(clientId);
        if (channelSubs.size === 0) {
          this.channelSubscriptions.delete(channel);
        }
      }
      
      this.metrics.subscriptions--;
      console.log(`📡 Client ${clientId} unsubscribed from ${channel}`);
    }

    this.sendToClient(clientId, {
      type: 'unsubscribed',
      data: {
        channels: data.channels,
        totalSubscriptions: client.subscriptions.size,
      },
      timestamp: Date.now(),
    });
  }

  private handlePing(clientId: string) {
    const client = this.clients.get(clientId);
    if (!client) return;

    client.lastPing = Date.now();
    this.sendToClient(clientId, {
      type: 'pong',
      data: { timestamp: Date.now() },
      timestamp: Date.now(),
    });
  }

  private handleAuth(clientId: string, data: { token: string }) {
    // TODO: Implement JWT token validation
    const client = this.clients.get(clientId);
    if (!client) return;

    // For now, just acknowledge auth
    this.sendToClient(clientId, {
      type: 'authenticated',
      data: { success: true },
      timestamp: Date.now(),
    });
  }

  private handleClientDisconnect(clientId: string) {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Remove from all channel subscriptions
    for (const channel of client.subscriptions) {
      const channelSubs = this.channelSubscriptions.get(channel);
      if (channelSubs) {
        channelSubs.delete(clientId);
        if (channelSubs.size === 0) {
          this.channelSubscriptions.delete(channel);
        }
      }
      this.metrics.subscriptions--;
    }

    // Remove client
    this.clients.delete(clientId);
    this.metrics.activeConnections--;

    console.log(`📡 WebSocket client disconnected: ${clientId} (${this.metrics.activeConnections} remaining)`);
  }

  private sendToClient(clientId: string, message: any) {
    const client = this.clients.get(clientId);
    if (!client || client.socket.readyState !== WebSocket.OPEN) return;

    try {
      client.socket.send(JSON.stringify(message));
      this.metrics.messagesSent++;
    } catch (error) {
      console.error(`Error sending message to client ${clientId}:`, error);
      this.handleClientDisconnect(clientId);
    }
  }

  private broadcastToChannel(channel: string, message: BroadcastMessage) {
    const subscribers = this.channelSubscriptions.get(channel);
    if (!subscribers || subscribers.size === 0) return;

    let sentCount = 0;
    for (const clientId of subscribers) {
      this.sendToClient(clientId, message);
      sentCount++;
    }

    if (sentCount > 0) {
      console.log(`📡 Broadcast to ${channel}: ${sentCount} clients`);
    }
  }

  private async sendCurrentChannelState(clientId: string, channel: string) {
    try {
      if (channel.startsWith('orderbook:')) {
        // Send current order book snapshot
        const pair = channel.replace('orderbook:', '');
        const orderBookData = await this.redis.get(`current_orderbook:${pair}`);
        
        if (orderBookData) {
          this.sendToClient(clientId, {
            type: 'orderbook_snapshot',
            channel,
            data: JSON.parse(orderBookData),
            timestamp: Date.now(),
          });
        }
      } else if (channel.startsWith('prices:')) {
        // Send current price
        const pair = channel.replace('prices:', '');
        const priceData = await this.redis.get(`current_price:${pair}`);
        
        if (priceData) {
          this.sendToClient(clientId, {
            type: 'price_snapshot',
            channel,
            data: JSON.parse(priceData),
            timestamp: Date.now(),
          });
        }
      }
    } catch (error) {
      console.error(`Error sending current state for ${channel}:`, error);
    }
  }

  private startHealthCheck() {
    // Ping all clients every 30 seconds to check connection health
    setInterval(() => {
      const now = Date.now();
      const staleClients: string[] = [];

      for (const [clientId, client] of this.clients) {
        if (now - client.lastPing > 60000) { // 60 seconds timeout
          staleClients.push(clientId);
        } else if (client.socket.readyState === WebSocket.OPEN) {
          // Send ping
          client.isAlive = false;
          client.socket.ping();
          
          setTimeout(() => {
            if (!client.isAlive) {
              staleClients.push(clientId);
            }
          }, 5000); // 5 second response timeout
        }
      }

      // Clean up stale connections
      for (const clientId of staleClients) {
        console.log(`🧹 Cleaning up stale client: ${clientId}`);
        this.handleClientDisconnect(clientId);
      }

      // Log metrics every 5 minutes
      if (now % 300000 < 30000) { // Every 5 minutes
        console.log('📊 WebSocket Metrics:', {
          activeConnections: this.metrics.activeConnections,
          totalConnections: this.metrics.totalConnections,
          subscriptions: this.metrics.subscriptions,
          messagesSent: this.metrics.messagesSent,
          messagesReceived: this.metrics.messagesReceived,
          avgLatency: `${this.metrics.averageLatency.toFixed(2)}ms`,
        });
      }
    }, 30000);
  }

  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getMessageType(channel: string): BroadcastMessage['type'] {
    if (channel.startsWith('orderbook:')) return 'orderbook_update';
    if (channel.startsWith('trades:')) return 'trade_executed';
    if (channel.startsWith('prices:')) return 'price_update';
    if (channel.startsWith('order:status:')) return 'order_status';
    return 'orderbook_update';
  }

  private extractChannelName(channel: string): string {
    // Remove Redis key prefixes to get clean channel names
    return channel.replace(/^(orderbook|trades|prices|order:status):/, '');
  }

  private isValidChannel(channel: string): boolean {
    // Basic channel validation - in production, validate against available trading pairs
    const validPatterns = [
      /^orderbook:[A-Z]+-[A-Z]+$/,
      /^trades:[A-Z]+-[A-Z]+$/,
      /^prices:[A-Z]+-[A-Z]+$/,
      /^orders:user:\w+$/,
    ];

    return validPatterns.some(pattern => pattern.test(channel));
  }

  private getAvailableChannels(): string[] {
    // In production, get this from active trading pairs
    return [
      'orderbook:BTC-USD',
      'orderbook:ETH-USD',
      'trades:BTC-USD', 
      'trades:ETH-USD',
      'prices:BTC-USD',
      'prices:ETH-USD',
    ];
  }

  async start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log('🚀 WebSocket server started');
    this.emit('started');
  }

  async stop() {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    
    // Close all client connections
    for (const [clientId, client] of this.clients) {
      client.socket.close();
    }
    
    // Close WebSocket server
    this.wss.close();
    
    console.log('⏹️ WebSocket server stopped');
    this.emit('stopped');
  }

  getMetrics() {
    return { ...this.metrics };
  }

  // Public API for other services
  async broadcastOrderBookUpdate(pair: string, orderBook: any) {
    await this.redis.set(`current_orderbook:${pair}`, JSON.stringify(orderBook));
    
    const message: BroadcastMessage = {
      type: 'orderbook_update',
      channel: `orderbook:${pair}`,
      data: orderBook,
      timestamp: Date.now(),
    };

    this.broadcastToChannel(`orderbook:${pair}`, message);
  }

  async broadcastTradeExecuted(pair: string, trade: any) {
    const message: BroadcastMessage = {
      type: 'trade_executed',
      channel: `trades:${pair}`,
      data: trade,
      timestamp: Date.now(),
    };

    this.broadcastToChannel(`trades:${pair}`, message);
  }

  async broadcastPriceUpdate(pair: string, price: any) {
    await this.redis.set(`current_price:${pair}`, JSON.stringify(price));
    
    const message: BroadcastMessage = {
      type: 'price_update',
      channel: `prices:${pair}`,
      data: price,
      timestamp: Date.now(),
    };

    this.broadcastToChannel(`prices:${pair}`, message);
  }
}

export default WebSocketManager;
