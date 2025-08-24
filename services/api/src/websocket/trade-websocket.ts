/**
 * Trade WebSocket Handler - CLEAN IMPLEMENTATION
 * Week 2 Day 3: Real-time trade updates and blockchain event synchronization
 * 
 * Features:
 * - Real-time trade status updates
 * - Blockchain event notifications
 * - User-specific trade notifications
 */

import { FastifyInstance, FastifyRequest } from 'fastify';
import { WebSocket } from 'ws'; // Using standard WebSocket interface
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { SmartContractEscrowService, EscrowEvent, TradeState } from '../services/SmartContractEscrowService.js';

interface AuthenticatedConnection {
  socket: WebSocket;
  userId: string;
  isAlive: boolean;
}

interface WebSocketMessage {
  type: 'subscribe' | 'unsubscribe' | 'ping' | 'trade_update' | 'blockchain_event' | 'connected' | 'subscribed' | 'pong';
  data?: any;
  tradeId?: string;
  timestamp?: number;
}

export class TradeWebSocketHandler {
  private connections = new Map<string, AuthenticatedConnection>();
  private tradeSubscriptions = new Map<string, Set<string>>(); // tradeId -> Set of userIds
  private userSubscriptions = new Map<string, Set<string>>(); // userId -> Set of tradeIds

  constructor(
    private prisma: PrismaClient,
    private escrowService: SmartContractEscrowService,
    private jwtSecret: string
  ) {
    this.setupBlockchainEventListeners();
    this.startHeartbeat();
  }

  /**
   * Setup blockchain event listeners
   */
  private setupBlockchainEventListeners(): void {
    console.log('🎧 Setting up blockchain event listeners...');

    // Listen for trade creation events
    this.escrowService.on(EscrowEvent.TRADE_CREATED, (eventData) => {
      this.broadcastTradeEvent('trade_created', eventData);
    });

    // Listen for trade completion events
    this.escrowService.on(EscrowEvent.TRADE_COMPLETED, (eventData) => {
      this.broadcastTradeEvent('trade_completed', eventData);
    });

    // Listen for trade cancellation events
    this.escrowService.on(EscrowEvent.TRADE_CANCELLED, (eventData) => {
      this.broadcastTradeEvent('trade_cancelled', eventData);
    });

    // Listen for payment confirmation events
    this.escrowService.on(EscrowEvent.PAYMENT_CONFIRMED, (eventData) => {
      this.broadcastTradeEvent('payment_confirmed', eventData);
    });

    console.log('✅ Blockchain event listeners active');
  }

  /**
   * Handle new WebSocket connection
   */
  async handleConnection(connection: any, request: FastifyRequest): Promise<void> {
    try {
      const socket = connection.socket;
      
      // Extract JWT token from query or headers
      const token = this.extractToken(request);
      if (!token) {
        socket.close(1008, 'Authentication required');
        return;
      }

      // Verify JWT token
      const decoded = jwt.verify(token, this.jwtSecret) as { userId: string };
      const userId = decoded.userId;

      if (!userId) {
        socket.close(1008, 'Invalid token');
        return;
      }

      // Create authenticated connection
      const connRecord: AuthenticatedConnection = {
        socket,
        userId,
        isAlive: true
      };

      this.connections.set(userId, connRecord);
      console.log(`👤 WebSocket connected: ${userId}`);

      // Send connection confirmation
      this.sendMessage(socket, {
        type: 'connected',
        data: { userId, timestamp: Date.now() }
      });

      // Handle messages
      socket.on('message', (data: Buffer) => {
        this.handleMessage(userId, data);
      });

      // Handle disconnection
      socket.on('close', () => {
        this.handleDisconnection(userId);
      });

      // Handle pong responses
      socket.on('pong', () => {
        connRecord.isAlive = true;
      });

    } catch (error) {
      console.error('❌ WebSocket connection error:', error);
      connection.socket.close(1011, 'Server error');
    }
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(userId: string, data: Buffer): void {
    try {
      const message: WebSocketMessage = JSON.parse(data.toString());
      
      switch (message.type) {
        case 'subscribe':
          this.handleSubscribe(userId, message);
          break;
        case 'unsubscribe':
          this.handleUnsubscribe(userId, message);
          break;
        case 'ping':
          this.handlePing(userId);
          break;
        default:
          console.log(`🔍 Unknown message type: ${message.type}`);
      }

    } catch (error) {
      console.error('❌ Message handling error:', error);
    }
  }

  /**
   * Handle trade subscription
   */
  private handleSubscribe(userId: string, message: WebSocketMessage): void {
    if (!message.tradeId) {
      return;
    }

    const tradeId = message.tradeId;

    // Add to trade subscriptions
    if (!this.tradeSubscriptions.has(tradeId)) {
      this.tradeSubscriptions.set(tradeId, new Set());
    }
    this.tradeSubscriptions.get(tradeId)!.add(userId);

    // Add to user subscriptions
    if (!this.userSubscriptions.has(userId)) {
      this.userSubscriptions.set(userId, new Set());
    }
    this.userSubscriptions.get(userId)!.add(tradeId);

    console.log(`📺 User ${userId} subscribed to trade ${tradeId}`);

    // Send confirmation
    const connection = this.connections.get(userId);
    if (connection) {
      this.sendMessage(connection.socket, {
        type: 'subscribed',
        tradeId,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Handle trade unsubscription
   */
  private handleUnsubscribe(userId: string, message: WebSocketMessage): void {
    if (!message.tradeId) {
      return;
    }

    const tradeId = message.tradeId;

    // Remove from subscriptions
    this.tradeSubscriptions.get(tradeId)?.delete(userId);
    this.userSubscriptions.get(userId)?.delete(tradeId);

    console.log(`📺 User ${userId} unsubscribed from trade ${tradeId}`);
  }

  /**
   * Handle ping message
   */
  private handlePing(userId: string): void {
    const connection = this.connections.get(userId);
    if (connection) {
      this.sendMessage(connection.socket, {
        type: 'pong',
        timestamp: Date.now()
      });
    }
  }

  /**
   * Handle disconnection
   */
  private handleDisconnection(userId: string): void {
    console.log(`👤 WebSocket disconnected: ${userId}`);

    // Clean up subscriptions
    const userTrades = this.userSubscriptions.get(userId);
    if (userTrades) {
      userTrades.forEach(tradeId => {
        this.tradeSubscriptions.get(tradeId)?.delete(userId);
      });
    }

    this.connections.delete(userId);
    this.userSubscriptions.delete(userId);
  }

  /**
   * Broadcast trade event to subscribed users
   */
  private broadcastTradeEvent(eventType: string, eventData: any): void {
    const tradeId = eventData.tradeId;
    if (!tradeId) return;

    const subscribedUsers = this.tradeSubscriptions.get(tradeId);
    if (!subscribedUsers || subscribedUsers.size === 0) {
      return;
    }

    const message: WebSocketMessage = {
      type: 'blockchain_event',
      data: {
        eventType,
        tradeId,
        ...eventData,
        timestamp: Date.now()
      }
    };

    subscribedUsers.forEach(userId => {
      const connection = this.connections.get(userId);
      if (connection) {
        this.sendMessage(connection.socket, message);
      }
    });

    console.log(`📡 Broadcast ${eventType} for trade ${tradeId} to ${subscribedUsers.size} users`);
  }

  /**
   * Send trade update to specific user
   */
  async sendTradeUpdate(tradeId: string, userId: string, updateData: any): Promise<void> {
    const connection = this.connections.get(userId);
    if (!connection) return;

    this.sendMessage(connection.socket, {
      type: 'trade_update',
      tradeId,
      data: updateData,
      timestamp: Date.now()
    });
  }

  /**
   * Send message to WebSocket
   */
  private sendMessage(socket: WebSocket, message: WebSocketMessage): void {
    try {
      socket.send(JSON.stringify(message));
    } catch (error) {
      console.error('❌ Failed to send message:', error);
    }
  }

  /**
   * Extract JWT token from request
   */
  private extractToken(request: FastifyRequest): string | null {
    // Try query parameter first
    const query = request.query as any;
    if (query?.token) {
      return query.token;
    }

    // Try Authorization header
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    return null;
  }

  /**
   * Start heartbeat to keep connections alive
   */
  private startHeartbeat(): void {
    setInterval(() => {
      this.connections.forEach((connection, userId) => {
        if (!connection.isAlive) {
          console.log(`💔 Terminating dead connection: ${userId}`);
          connection.socket.terminate();
          this.handleDisconnection(userId);
          return;
        }

        connection.isAlive = false;
        connection.socket.ping();
      });
    }, 30000); // 30 seconds
  }

  /**
   * Get connection statistics
   */
  getStats() {
    return {
      totalConnections: this.connections.size,
      totalTradeSubscriptions: Array.from(this.tradeSubscriptions.values()).reduce((sum, set) => sum + set.size, 0),
      activeUsers: Array.from(this.connections.keys())
    };
  }
}

/**
 * Register WebSocket routes with Fastify
 */
export async function registerTradeWebSocket(
  fastify: FastifyInstance,
  escrowService: SmartContractEscrowService,
  prisma: PrismaClient
): Promise<void> {
  const jwtSecret = process.env.JWT_SECRET || 'fallback-secret-for-development';
  const wsHandler = new TradeWebSocketHandler(prisma, escrowService, jwtSecret);

  // Trade WebSocket endpoint
  fastify.get('/trades-ws', { websocket: true }, async (connection, request) => {
    await wsHandler.handleConnection(connection, request);
  });

  // WebSocket statistics endpoint
  fastify.get('/ws-stats', async (request, reply) => {
    return wsHandler.getStats();
  });

  console.log('✅ Trade WebSocket routes registered');
}
