// P2P WebSocket Handler for Real-time Features
import { WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { P2PService } from '../services/p2p-service';

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  isAlive?: boolean;
}

interface WebSocketMessage {
  type: string;
  data?: any;
  tradeId?: string;
  adId?: string;
}

export class P2PWebSocketHandler {
  private prisma: PrismaClient;
  private p2pService: P2PService;
  private clients: Map<string, AuthenticatedWebSocket> = new Map();
  private tradeRooms: Map<string, Set<string>> = new Map(); // tradeId -> Set of userIds
  private userTrades: Map<string, Set<string>> = new Map(); // userId -> Set of tradeIds

  constructor() {
    this.prisma = new PrismaClient();
    this.p2pService = new P2PService(this.prisma);
    this.startHeartbeat();
  }

  async handleConnection(ws: AuthenticatedWebSocket, request: IncomingMessage) {
    try {
      // Extract token from query params or headers
      const url = new URL(request.url!, `http://${request.headers.host}`);
      const token = url.searchParams.get('token') || 
                   request.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        ws.close(1008, 'Authentication required');
        return;
      }

      // Verify JWT token
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
      const userId = decoded.id || decoded.userId;

      if (!userId) {
        ws.close(1008, 'Invalid token');
        return;
      }

      // Check if user exists and is active
      const user = await this.prisma.user.findUnique({
        where: { id: userId }
      });

      if (!user || !user.isActive) {
        ws.close(1008, 'User not found or inactive');
        return;
      }

      // Set up WebSocket
      ws.userId = userId;
      ws.isAlive = true;
      this.clients.set(userId, ws);

      // Register with P2P service
      this.p2pService.addWebSocketConnection(userId, ws);

      // Update user online status
      await this.updateUserOnlineStatus(userId, true);

      // Load user's active trades into rooms
      await this.joinUserTradeRooms(userId);

      // Send connection confirmation
      this.sendToUser(userId, {
        type: 'CONNECTION_ESTABLISHED',
        data: {
          userId,
          timestamp: new Date().toISOString()
        }
      });

      // Set up message handler
      ws.on('message', (data) => this.handleMessage(ws, data));

      // Handle disconnect
      ws.on('close', () => this.handleDisconnect(userId));
      ws.on('error', (error) => {
        console.error(`WebSocket error for user ${userId}:`, error);
        this.handleDisconnect(userId);
      });

      // Heartbeat
      ws.on('pong', () => {
        ws.isAlive = true;
      });

      console.log(`P2P WebSocket connected: ${userId}`);
    } catch (error) {
      console.error('WebSocket authentication error:', error);
      ws.close(1008, 'Authentication failed');
    }
  }

  private async handleMessage(ws: AuthenticatedWebSocket, data: Buffer) {
    try {
      const message: WebSocketMessage = JSON.parse(data.toString());
      const userId = ws.userId!;

      switch (message.type) {
        case 'JOIN_TRADE':
          await this.handleJoinTrade(userId, message.tradeId!);
          break;

        case 'LEAVE_TRADE':
          this.handleLeaveTrade(userId, message.tradeId!);
          break;

        case 'SEND_MESSAGE':
          await this.handleSendMessage(userId, message);
          break;

        case 'TYPING_START':
          this.handleTyping(userId, message.tradeId!, true);
          break;

        case 'TYPING_STOP':
          this.handleTyping(userId, message.tradeId!, false);
          break;

        case 'TRADE_ACTION':
          await this.handleTradeAction(userId, message);
          break;

        case 'SUBSCRIBE_ADS':
          await this.handleSubscribeAds(userId, message.data);
          break;

        case 'PING':
          this.sendToUser(userId, { type: 'PONG' });
          break;

        default:
          console.warn(`Unknown message type: ${message.type}`);
      }
    } catch (error) {
      console.error('Error handling WebSocket message:', error);
      this.sendToUser(ws.userId!, {
        type: 'ERROR',
        data: { message: 'Invalid message format' }
      });
    }
  }

  private async handleJoinTrade(userId: string, tradeId: string) {
    try {
      // Verify user is part of this trade
      const trade = await this.prisma.p2PTrade.findUnique({
        where: { id: tradeId }
      });

      if (!trade || (trade.sellerId !== userId && trade.buyerId !== userId)) {
        this.sendToUser(userId, {
          type: 'ERROR',
          data: { message: 'Not authorized to join this trade' }
        });
        return;
      }

      // Add to trade room
      if (!this.tradeRooms.has(tradeId)) {
        this.tradeRooms.set(tradeId, new Set());
      }
      this.tradeRooms.get(tradeId)!.add(userId);

      // Add to user's trades
      if (!this.userTrades.has(userId)) {
        this.userTrades.set(userId, new Set());
      }
      this.userTrades.get(userId)!.add(tradeId);

      // Confirm join
      this.sendToUser(userId, {
        type: 'TRADE_JOINED',
        tradeId,
        data: { timestamp: new Date().toISOString() }
      });

      // Notify other participant
      const otherUserId = trade.sellerId === userId ? trade.buyerId : trade.sellerId;
      this.sendToUser(otherUserId, {
        type: 'USER_JOINED_TRADE',
        tradeId,
        data: { userId }
      });
    } catch (error) {
      console.error('Error joining trade:', error);
    }
  }

  private handleLeaveTrade(userId: string, tradeId: string) {
    // Remove from trade room
    const tradeRoom = this.tradeRooms.get(tradeId);
    if (tradeRoom) {
      tradeRoom.delete(userId);
      if (tradeRoom.size === 0) {
        this.tradeRooms.delete(tradeId);
      }
    }

    // Remove from user trades
    const userTrades = this.userTrades.get(userId);
    if (userTrades) {
      userTrades.delete(tradeId);
    }

    this.sendToUser(userId, {
      type: 'TRADE_LEFT',
      tradeId
    });
  }

  private async handleSendMessage(userId: string, message: WebSocketMessage) {
    try {
      if (!message.tradeId || !message.data?.content) {
        throw new Error('Trade ID and message content required');
      }

      const chatMessage = await this.p2pService.sendTradeMessage(
        userId,
        message.tradeId,
        message.data.content,
        message.data.messageType || 'TEXT'
      );

      // Broadcast to trade room
      this.broadcastToTrade(message.tradeId, {
        type: 'NEW_MESSAGE',
        tradeId: message.tradeId,
        data: {
          ...chatMessage,
          content: message.data.content // Send decrypted content
        }
      }, userId);
    } catch (error: any) {
      this.sendToUser(userId, {
        type: 'MESSAGE_ERROR',
        data: { message: error.message }
      });
    }
  }

  private handleTyping(userId: string, tradeId: string, isTyping: boolean) {
    this.broadcastToTrade(tradeId, {
      type: isTyping ? 'USER_TYPING' : 'USER_STOPPED_TYPING',
      tradeId,
      data: { userId }
    }, userId);
  }

  private async handleTradeAction(userId: string, message: WebSocketMessage) {
    try {
      const { action, tradeId, data } = message.data;

      let result;
      switch (action) {
        case 'ACCEPT_TRADE':
          result = await this.p2pService.acceptTrade(userId, tradeId);
          break;

        case 'MARK_PAYMENT_SENT':
          result = await this.p2pService.markPaymentSent(userId, tradeId, data?.paymentProof);
          break;

        case 'CONFIRM_PAYMENT':
          result = await this.p2pService.confirmPaymentReceived(userId, tradeId);
          break;

        case 'CREATE_DISPUTE':
          result = await this.p2pService.createDispute(userId, tradeId, data);
          break;

        default:
          throw new Error(`Unknown trade action: ${action}`);
      }

      // Broadcast trade update to participants
      this.broadcastToTrade(tradeId, {
        type: 'TRADE_UPDATED',
        tradeId,
        data: result
      });

    } catch (error: any) {
      this.sendToUser(userId, {
        type: 'TRADE_ACTION_ERROR',
        data: { message: error.message }
      });
    }
  }

  private async handleSubscribeAds(userId: string, filters: any) {
    // Store user's ad subscription filters
    // In a real implementation, you'd want to persist this
    this.sendToUser(userId, {
      type: 'ADS_SUBSCRIBED',
      data: { filters }
    });
  }

  private async handleDisconnect(userId: string) {
    try {
      // Remove from all trade rooms
      const userTrades = this.userTrades.get(userId);
      if (userTrades) {
        for (const tradeId of userTrades) {
          this.handleLeaveTrade(userId, tradeId);
        }
      }

      // Update user online status
      await this.updateUserOnlineStatus(userId, false);

      // Clean up
      this.clients.delete(userId);
      this.userTrades.delete(userId);
      this.p2pService.removeWebSocketConnection(userId);

      console.log(`P2P WebSocket disconnected: ${userId}`);
    } catch (error) {
      console.error('Error handling disconnect:', error);
    }
  }

  private async joinUserTradeRooms(userId: string) {
    try {
      const activeTrades = await this.prisma.p2PTrade.findMany({
        where: {
          OR: [
            { sellerId: userId },
            { buyerId: userId }
          ],
          status: {
            in: ['PENDING', 'ACCEPTED', 'ESCROW_FUNDED', 'PAYMENT_PENDING', 'PAYMENT_SENT', 'DISPUTED']
          }
        },
        select: { id: true }
      });

      for (const trade of activeTrades) {
        await this.handleJoinTrade(userId, trade.id);
      }
    } catch (error) {
      console.error('Error joining user trade rooms:', error);
    }
  }

  private async updateUserOnlineStatus(userId: string, isOnline: boolean) {
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          lastActivity: new Date(),
          ...(isOnline ? {} : { lastSeenAt: new Date() })
        }
      });
    } catch (error) {
      console.error('Error updating user online status:', error);
    }
  }

  private sendToUser(userId: string, message: any) {
    const ws = this.clients.get(userId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private broadcastToTrade(tradeId: string, message: any, excludeUserId?: string) {
    const tradeRoom = this.tradeRooms.get(tradeId);
    if (!tradeRoom) return;

    for (const userId of tradeRoom) {
      if (excludeUserId && userId === excludeUserId) continue;
      this.sendToUser(userId, message);
    }
  }

  private broadcastToAll(message: any) {
    for (const [userId, ws] of this.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    }
  }

  // Heartbeat to detect dead connections
  private startHeartbeat() {
    setInterval(() => {
      for (const [userId, ws] of this.clients) {
        if (ws.isAlive === false) {
          console.log(`Terminating dead connection: ${userId}`);
          ws.terminate();
          this.handleDisconnect(userId);
          continue;
        }

        ws.isAlive = false;
        ws.ping();
      }
    }, 30000); // Check every 30 seconds
  }

  // Public methods for external notifications
  notifyAdUpdate(eventType: string, ad: any) {
    this.broadcastToAll({
      type: eventType,
      data: ad
    });
  }

  notifyTradeUpdate(tradeId: string, eventType: string, data: any) {
    this.broadcastToTrade(tradeId, {
      type: eventType,
      tradeId,
      data
    });
  }

  notifyUserUpdate(userId: string, eventType: string, data: any) {
    this.sendToUser(userId, {
      type: eventType,
      data
    });
  }

  // Cleanup
  async shutdown() {
    console.log('Shutting down P2P WebSocket handler...');
    
    for (const [userId, ws] of this.clients) {
      ws.close(1001, 'Server shutdown');
      await this.updateUserOnlineStatus(userId, false);
    }

    this.clients.clear();
    this.tradeRooms.clear();
    this.userTrades.clear();
    
    await this.prisma.$disconnect();
  }

  // Get connection count for monitoring
  getConnectionCount(): number {
    return this.clients.size;
  }
}
