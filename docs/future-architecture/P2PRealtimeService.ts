/**
 * Real-Time P2P Trading WebSocket Service
 * MIT-Level Engineering - Pure P2P Crypto Platform
 * 
 * Features:
 * - Real-time order book streaming
 * - Live trade execution notifications  
 * - Order status updates
 * - Price alerts and notifications
 * - Market data broadcasting
 * - User-specific trade channels
 * - Reputation-based priority streaming
 */

import { EventEmitter } from 'events';
import { WebSocketServer, WebSocket } from 'ws';
import { Redis } from 'ioredis';
import { PrismaClient } from '@prisma/client';
import P2PMatchingEngine, { P2POrder, P2PTrade, P2POrderBook } from './P2PMatchingEngine.js';
import { SecurityService } from './SecurityService.js';
import { AuditService } from './AuditService.js';

// ===========================
// WEBSOCKET MESSAGE TYPES
// ===========================

export enum WSMessageType {
  // Client -> Server
  SUBSCRIBE_ORDERBOOK = 'subscribe_orderbook',
  UNSUBSCRIBE_ORDERBOOK = 'unsubscribe_orderbook',
  SUBSCRIBE_TRADES = 'subscribe_trades',
  UNSUBSCRIBE_TRADES = 'unsubscribe_trades',
  SUBSCRIBE_USER_ORDERS = 'subscribe_user_orders',
  PING = 'ping',
  AUTHENTICATE = 'authenticate',

  // Server -> Client
  ORDERBOOK_UPDATE = 'orderbook_update',
  ORDERBOOK_SNAPSHOT = 'orderbook_snapshot',
  TRADE_EXECUTED = 'trade_executed',
  ORDER_STATUS_UPDATE = 'order_status_update',
  PRICE_ALERT = 'price_alert',
  MARKET_STATS_UPDATE = 'market_stats_update',
  USER_ORDER_UPDATE = 'user_order_update',
  PONG = 'pong',
  ERROR = 'error',
  AUTHENTICATION_SUCCESS = 'authentication_success',
  AUTHENTICATION_FAILED = 'authentication_failed'
}

export interface WSMessage {
  type: WSMessageType;
  data?: any;
  timestamp?: string;
  requestId?: string;
}

export interface WSClient {
  id: string;
  websocket: WebSocket;
  userId?: string;
  isAuthenticated: boolean;
  subscriptions: Set<string>;
  lastPing: Date;
  reputation: number;
  metadata: {
    userAgent?: string;
    ipAddress?: string;
    connectionTime: Date;
    totalMessages: number;
    isVIP: boolean;
  };
}

export interface OrderBookSubscription {
  symbol: string;
  depth: number; // How many levels to stream
  frequency: 'realtime' | 'throttled'; // Throttled = max 10 updates/sec
}

/**
 * Real-Time P2P Trading WebSocket Service
 */
export class P2PRealtimeService extends EventEmitter {
  private wsServer: WebSocketServer;
  private clients: Map<string, WSClient>;
  private p2pEngine: P2PMatchingEngine;
  private securityService: SecurityService;
  private auditService: AuditService;
  private redis: Redis;
  private prisma: PrismaClient;
  
  // Subscription management
  private orderbookSubscriptions: Map<string, Set<string>>; // symbol -> client IDs
  private tradeSubscriptions: Map<string, Set<string>>; // symbol -> client IDs
  private userOrderSubscriptions: Set<string>; // client IDs subscribed to their orders
  
  // Performance optimization
  private orderbookCache: Map<string, P2POrderBook>;
  private broadcastThrottles: Map<string, NodeJS.Timeout>;
  private messageRateLimits: Map<string, { count: number; resetTime: number }>;
  
  // Configuration
  private readonly MAX_CONNECTIONS = 10000;
  private readonly MAX_MESSAGES_PER_MINUTE = 300;
  private readonly ORDERBOOK_THROTTLE_MS = 100; // Max 10 updates/sec
  private readonly PING_INTERVAL_MS = 30000; // 30 seconds

  constructor(
    port: number,
    p2pEngine: P2PMatchingEngine,
    securityService: SecurityService,
    auditService: AuditService,
    redis: Redis,
    prisma: PrismaClient
  ) {
    super();
    
    this.p2pEngine = p2pEngine;
    this.securityService = securityService;
    this.auditService = auditService;
    this.redis = redis;
    this.prisma = prisma;
    
    this.clients = new Map();
    this.orderbookSubscriptions = new Map();
    this.tradeSubscriptions = new Map();
    this.userOrderSubscriptions = new Set();
    this.orderbookCache = new Map();
    this.broadcastThrottles = new Map();
    this.messageRateLimits = new Map();

    // Initialize WebSocket server
    this.wsServer = new WebSocketServer({ 
      port,
      perMessageDeflate: {
        zlibDeflateOptions: {
          chunkSize: 1024
        }
      }
    });

    this.setupWebSocketHandlers();
    this.setupP2PEngineListeners();
    this.startPingPongService();
    this.startCleanupService();
  }

  /**
   * Initialize WebSocket server and connection handling
   */
  private setupWebSocketHandlers(): void {
    this.wsServer.on('connection', (ws: WebSocket, request) => {
      this.handleNewConnection(ws, request);
    });

    this.wsServer.on('error', (error) => {
      console.error('❌ P2P WebSocket server error:', error);
      this.emit('server:error', error);
    });

    console.log(`🌐 P2P Real-time WebSocket server started on port ${this.wsServer.options.port}`);
  }

  /**
   * Handle new WebSocket connection
   */
  private async handleNewConnection(ws: WebSocket, request: any): Promise<void> {
    try {
      // Check connection limits
      if (this.clients.size >= this.MAX_CONNECTIONS) {
        ws.close(1008, 'Server at capacity');
        return;
      }

      // Create client object
      const clientId = this.generateClientId();
      const client: WSClient = {
        id: clientId,
        websocket: ws,
        isAuthenticated: false,
        subscriptions: new Set(),
        lastPing: new Date(),
        reputation: 50, // Default neutral reputation
        metadata: {
          userAgent: request.headers['user-agent'],
          ipAddress: request.socket.remoteAddress,
          connectionTime: new Date(),
          totalMessages: 0,
          isVIP: false
        }
      };

      this.clients.set(clientId, client);

      // Setup message handler
      ws.on('message', (data) => this.handleClientMessage(client, data));
      
      // Setup disconnect handler
      ws.on('close', () => this.handleClientDisconnect(client));
      
      // Setup error handler
      ws.on('error', (error) => this.handleClientError(client, error));

      // Send welcome message
      this.sendToClient(client, {
        type: WSMessageType.PONG,
        data: {
          clientId,
          message: 'Connected to Orrange P2P Real-time Service',
          serverTime: new Date().toISOString(),
          features: ['orderbook_streaming', 'trade_notifications', 'order_updates']
        }
      });

      console.log(`🔌 P2P client connected: ${clientId} (${this.clients.size} total)`);

      // Audit log
      await this.auditService.logActivity({
        userId: 'SYSTEM',
        action: 'WEBSOCKET_CONNECTION',
        resourceType: 'P2P_REALTIME',
        resourceId: clientId,
        metadata: {
          ipAddress: client.metadata.ipAddress,
          userAgent: client.metadata.userAgent
        }
      });

    } catch (error) {
      console.error('❌ Error handling new P2P WebSocket connection:', error);
      ws.close(1011, 'Internal server error');
    }
  }

  /**
   * Handle incoming client messages
   */
  private async handleClientMessage(client: WSClient, data: Buffer): Promise<void> {
    try {
      // Rate limiting
      if (!this.checkRateLimit(client)) {
        this.sendErrorToClient(client, 'Rate limit exceeded', 'RATE_LIMIT');
        return;
      }

      // Parse message
      const message: WSMessage = JSON.parse(data.toString());
      client.metadata.totalMessages++;

      // Handle different message types
      switch (message.type) {
        case WSMessageType.AUTHENTICATE:
          await this.handleAuthentication(client, message.data);
          break;

        case WSMessageType.SUBSCRIBE_ORDERBOOK:
          await this.handleOrderbookSubscription(client, message.data);
          break;

        case WSMessageType.UNSUBSCRIBE_ORDERBOOK:
          await this.handleOrderbookUnsubscription(client, message.data);
          break;

        case WSMessageType.SUBSCRIBE_TRADES:
          await this.handleTradeSubscription(client, message.data);
          break;

        case WSMessageType.UNSUBSCRIBE_TRADES:
          await this.handleTradeUnsubscription(client, message.data);
          break;

        case WSMessageType.SUBSCRIBE_USER_ORDERS:
          await this.handleUserOrderSubscription(client);
          break;

        case WSMessageType.PING:
          this.handlePing(client, message.data);
          break;

        default:
          this.sendErrorToClient(client, `Unknown message type: ${message.type}`, 'UNKNOWN_MESSAGE_TYPE');
      }

    } catch (error) {
      console.error(`❌ Error handling message from client ${client.id}:`, error);
      this.sendErrorToClient(client, 'Invalid message format', 'INVALID_MESSAGE');
    }
  }

  /**
   * Handle client authentication
   */
  private async handleAuthentication(client: WSClient, authData: any): Promise<void> {
    try {
      const { token } = authData;
      
      if (!token) {
        this.sendToClient(client, {
          type: WSMessageType.AUTHENTICATION_FAILED,
          data: { error: 'Token required' }
        });
        return;
      }

      // Verify JWT token (integrate with your auth system)
      // For now, mock authentication
      const userId = await this.verifyJWTToken(token);
      
      if (userId) {
        client.userId = userId;
        client.isAuthenticated = true;
        
        // Get user reputation
        client.reputation = await this.getUserReputation(userId);
        client.metadata.isVIP = client.reputation >= 90;

        this.sendToClient(client, {
          type: WSMessageType.AUTHENTICATION_SUCCESS,
          data: {
            userId,
            reputation: client.reputation,
            isVIP: client.metadata.isVIP
          }
        });

        // Audit log
        await this.auditService.logActivity({
          userId,
          action: 'WEBSOCKET_AUTHENTICATION',
          resourceType: 'P2P_REALTIME',
          resourceId: client.id,
          metadata: { reputation: client.reputation }
        });

        console.log(`🔐 Client ${client.id} authenticated as user ${userId}`);
      } else {
        this.sendToClient(client, {
          type: WSMessageType.AUTHENTICATION_FAILED,
          data: { error: 'Invalid token' }
        });
      }
    } catch (error) {
      console.error(`❌ Authentication error for client ${client.id}:`, error);
      this.sendErrorToClient(client, 'Authentication failed', 'AUTH_ERROR');
    }
  }

  /**
   * Handle orderbook subscription
   */
  private async handleOrderbookSubscription(client: WSClient, subscriptionData: any): Promise<void> {
    const { symbol, depth = 10, frequency = 'throttled' } = subscriptionData;
    
    if (!symbol) {
      this.sendErrorToClient(client, 'Symbol required for orderbook subscription', 'MISSING_SYMBOL');
      return;
    }

    // Add client to subscription set
    if (!this.orderbookSubscriptions.has(symbol)) {
      this.orderbookSubscriptions.set(symbol, new Set());
    }
    this.orderbookSubscriptions.get(symbol)!.add(client.id);
    client.subscriptions.add(`orderbook:${symbol}`);

    // Send current orderbook snapshot
    const orderbook = this.p2pEngine.getOrderBook(symbol);
    if (orderbook) {
      this.sendToClient(client, {
        type: WSMessageType.ORDERBOOK_SNAPSHOT,
        data: this.formatOrderbookForWS(orderbook, depth)
      });
    }

    console.log(`📊 Client ${client.id} subscribed to ${symbol} orderbook`);
  }

  /**
   * Handle orderbook unsubscription
   */
  private async handleOrderbookUnsubscription(client: WSClient, data: any): Promise<void> {
    const { symbol } = data;
    
    if (this.orderbookSubscriptions.has(symbol)) {
      this.orderbookSubscriptions.get(symbol)!.delete(client.id);
      client.subscriptions.delete(`orderbook:${symbol}`);
    }

    console.log(`📊 Client ${client.id} unsubscribed from ${symbol} orderbook`);
  }

  /**
   * Setup P2P engine event listeners
   */
  private setupP2PEngineListeners(): void {
    // Orderbook updates
    this.p2pEngine.on('orderbook:updated', (data: { symbol: string; orderBook: P2POrderBook }) => {
      this.broadcastOrderbookUpdate(data.symbol, data.orderBook);
    });

    // Trade executions
    this.p2pEngine.on('trade:executed', (trade: P2PTrade) => {
      this.broadcastTradeExecution(trade);
    });

    // Order updates
    this.p2pEngine.on('order:submitted', (order: P2POrder) => {
      this.broadcastOrderUpdate(order, 'SUBMITTED');
    });

    this.p2pEngine.on('order:cancelled', (order: P2POrder) => {
      this.broadcastOrderUpdate(order, 'CANCELLED');
    });

    this.p2pEngine.on('order:filled', (order: P2POrder) => {
      this.broadcastOrderUpdate(order, 'FILLED');
    });
  }

  /**
   * Broadcast orderbook updates with throttling
   */
  private broadcastOrderbookUpdate(symbol: string, orderbook: P2POrderBook): void {
    // Throttle broadcasts to prevent spam
    const throttleKey = `orderbook:${symbol}`;
    if (this.broadcastThrottles.has(throttleKey)) {
      return; // Already throttled
    }

    this.broadcastThrottles.set(throttleKey, setTimeout(() => {
      this.broadcastThrottles.delete(throttleKey);
    }, this.ORDERBOOK_THROTTLE_MS));

    // Cache updated orderbook
    this.orderbookCache.set(symbol, orderbook);

    // Broadcast to subscribed clients
    const subscribers = this.orderbookSubscriptions.get(symbol);
    if (subscribers) {
      const message: WSMessage = {
        type: WSMessageType.ORDERBOOK_UPDATE,
        data: this.formatOrderbookForWS(orderbook, 10),
        timestamp: new Date().toISOString()
      };

      for (const clientId of subscribers) {
        const client = this.clients.get(clientId);
        if (client && client.websocket.readyState === WebSocket.OPEN) {
          this.sendToClient(client, message);
        }
      }
    }
  }

  /**
   * Broadcast trade execution to interested clients
   */
  private broadcastTradeExecution(trade: P2PTrade): void {
    const subscribers = this.tradeSubscriptions.get(trade.symbol) || new Set();
    
    const message: WSMessage = {
      type: WSMessageType.TRADE_EXECUTED,
      data: {
        id: trade.id,
        symbol: trade.symbol,
        price: trade.price.toString(),
        quantity: trade.quantity.toString(),
        side: 'UNKNOWN', // Determined by client perspective
        timestamp: trade.executedAt.toISOString()
      },
      timestamp: new Date().toISOString()
    };

    for (const clientId of subscribers) {
      const client = this.clients.get(clientId);
      if (client && client.websocket.readyState === WebSocket.OPEN) {
        // Customize message for client perspective
        const customMessage = { ...message };
        if (client.userId === trade.buyerId) {
          customMessage.data.side = 'BUY';
        } else if (client.userId === trade.sellerId) {
          customMessage.data.side = 'SELL';
        }
        
        this.sendToClient(client, customMessage);
      }
    }
  }

  /**
   * Broadcast order status updates to order owners
   */
  private broadcastOrderUpdate(order: P2POrder, updateType: string): void {
    const message: WSMessage = {
      type: WSMessageType.ORDER_STATUS_UPDATE,
      data: {
        orderId: order.id,
        symbol: order.symbol,
        status: order.status,
        updateType,
        remainingQuantity: order.remainingQuantity.toString(),
        fillQuantity: order.fillQuantity.toString(),
        timestamp: order.updatedAt.toISOString()
      },
      timestamp: new Date().toISOString()
    };

    // Find client for this user
    for (const client of this.clients.values()) {
      if (client.userId === order.userId && 
          client.websocket.readyState === WebSocket.OPEN &&
          this.userOrderSubscriptions.has(client.id)) {
        this.sendToClient(client, message);
      }
    }
  }

  // ===========================
  // UTILITY METHODS
  // ===========================

  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private async verifyJWTToken(token: string): Promise<string | null> {
    try {
      // Mock JWT verification - integrate with your auth system
      // In production, use proper JWT verification
      if (token === 'mock_valid_token') {
        return 'user_123';
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  private async getUserReputation(userId: string): Promise<number> {
    try {
      // Mock reputation lookup - integrate with your user system
      return Math.floor(Math.random() * 50) + 50; // Random 50-100
    } catch (error) {
      return 50; // Default neutral reputation
    }
  }

  private checkRateLimit(client: WSClient): boolean {
    const now = Date.now();
    const key = client.id;
    
    if (!this.messageRateLimits.has(key)) {
      this.messageRateLimits.set(key, { count: 1, resetTime: now + 60000 });
      return true;
    }

    const limit = this.messageRateLimits.get(key)!;
    
    if (now > limit.resetTime) {
      limit.count = 1;
      limit.resetTime = now + 60000;
      return true;
    }

    if (limit.count >= this.MAX_MESSAGES_PER_MINUTE) {
      return false;
    }

    limit.count++;
    return true;
  }

  private formatOrderbookForWS(orderbook: P2POrderBook, depth: number): any {
    return {
      symbol: orderbook.symbol,
      bids: orderbook.bids.slice(0, depth).map(entry => ({
        price: entry.price.toString(),
        quantity: entry.quantity.toString(),
        orderCount: entry.orderCount,
        reputation: entry.averageReputation
      })),
      asks: orderbook.asks.slice(0, depth).map(entry => ({
        price: entry.price.toString(),
        quantity: entry.quantity.toString(),
        orderCount: entry.orderCount,
        reputation: entry.averageReputation
      })),
      spread: orderbook.spread.toString(),
      timestamp: orderbook.timestamp.toISOString()
    };
  }

  private sendToClient(client: WSClient, message: WSMessage): void {
    if (client.websocket.readyState === WebSocket.OPEN) {
      try {
        client.websocket.send(JSON.stringify(message));
      } catch (error) {
        console.error(`❌ Error sending message to client ${client.id}:`, error);
      }
    }
  }

  private sendErrorToClient(client: WSClient, message: string, code: string): void {
    this.sendToClient(client, {
      type: WSMessageType.ERROR,
      data: { message, code },
      timestamp: new Date().toISOString()
    });
  }

  private handlePing(client: WSClient, data: any): void {
    client.lastPing = new Date();
    this.sendToClient(client, {
      type: WSMessageType.PONG,
      data: { serverTime: new Date().toISOString() }
    });
  }

  private handleClientDisconnect(client: WSClient): void {
    // Remove from all subscriptions
    for (const subscriptions of this.orderbookSubscriptions.values()) {
      subscriptions.delete(client.id);
    }
    for (const subscriptions of this.tradeSubscriptions.values()) {
      subscriptions.delete(client.id);
    }
    this.userOrderSubscriptions.delete(client.id);
    
    // Remove rate limit entry
    this.messageRateLimits.delete(client.id);
    
    // Remove client
    this.clients.delete(client.id);
    
    console.log(`🔌 P2P client disconnected: ${client.id} (${this.clients.size} remaining)`);
  }

  private handleClientError(client: WSClient, error: Error): void {
    console.error(`❌ WebSocket error for client ${client.id}:`, error);
  }

  // ===========================
  // SERVICE MANAGEMENT
  // ===========================

  private startPingPongService(): void {
    setInterval(() => {
      const now = new Date();
      for (const client of this.clients.values()) {
        // Check if client is still responsive
        const timeSinceLastPing = now.getTime() - client.lastPing.getTime();
        if (timeSinceLastPing > this.PING_INTERVAL_MS * 2) {
          // Client appears dead, disconnect
          client.websocket.terminate();
          this.handleClientDisconnect(client);
        }
      }
    }, this.PING_INTERVAL_MS);
  }

  private startCleanupService(): void {
    // Clean up empty subscription sets
    setInterval(() => {
      for (const [symbol, subscribers] of this.orderbookSubscriptions.entries()) {
        if (subscribers.size === 0) {
          this.orderbookSubscriptions.delete(symbol);
        }
      }
      for (const [symbol, subscribers] of this.tradeSubscriptions.entries()) {
        if (subscribers.size === 0) {
          this.tradeSubscriptions.delete(symbol);
        }
      }
    }, 60000); // Every minute
  }

  private async handleTradeSubscription(client: WSClient, subscriptionData: any): Promise<void> {
    const { symbol } = subscriptionData;
    
    if (!symbol) {
      this.sendErrorToClient(client, 'Symbol required for trade subscription', 'MISSING_SYMBOL');
      return;
    }

    if (!this.tradeSubscriptions.has(symbol)) {
      this.tradeSubscriptions.set(symbol, new Set());
    }
    this.tradeSubscriptions.get(symbol)!.add(client.id);
    client.subscriptions.add(`trades:${symbol}`);

    console.log(`💱 Client ${client.id} subscribed to ${symbol} trades`);
  }

  private async handleTradeUnsubscription(client: WSClient, data: any): Promise<void> {
    const { symbol } = data;
    
    if (this.tradeSubscriptions.has(symbol)) {
      this.tradeSubscriptions.get(symbol)!.delete(client.id);
      client.subscriptions.delete(`trades:${symbol}`);
    }

    console.log(`💱 Client ${client.id} unsubscribed from ${symbol} trades`);
  }

  private async handleUserOrderSubscription(client: WSClient): Promise<void> {
    if (!client.isAuthenticated) {
      this.sendErrorToClient(client, 'Authentication required for order updates', 'AUTH_REQUIRED');
      return;
    }

    this.userOrderSubscriptions.add(client.id);
    console.log(`📝 Client ${client.id} subscribed to user order updates`);
  }

  /**
   * Gracefully shutdown the service
   */
  async shutdown(): Promise<void> {
    console.log('🛑 Shutting down P2P Real-time Service...');
    
    // Close all client connections
    for (const client of this.clients.values()) {
      client.websocket.close(1001, 'Server shutting down');
    }
    
    // Close WebSocket server
    this.wsServer.close();
    
    // Clear all data structures
    this.clients.clear();
    this.orderbookSubscriptions.clear();
    this.tradeSubscriptions.clear();
    this.userOrderSubscriptions.clear();
    this.orderbookCache.clear();
    this.broadcastThrottles.clear();
    this.messageRateLimits.clear();
    
    console.log('✅ P2P Real-time Service shutdown complete');
  }

  /**
   * Get service statistics
   */
  getStats(): any {
    return {
      totalConnections: this.clients.size,
      authenticatedClients: Array.from(this.clients.values()).filter(c => c.isAuthenticated).length,
      totalSubscriptions: Array.from(this.orderbookSubscriptions.values()).reduce((sum, set) => sum + set.size, 0) +
                         Array.from(this.tradeSubscriptions.values()).reduce((sum, set) => sum + set.size, 0),
      orderbookSubscriptions: this.orderbookSubscriptions.size,
      tradeSubscriptions: this.tradeSubscriptions.size,
      userOrderSubscriptions: this.userOrderSubscriptions.size,
      uptime: process.uptime()
    };
  }
}

console.log('🔗 P2P Real-time Service module loaded');
export default P2PRealtimeService;
