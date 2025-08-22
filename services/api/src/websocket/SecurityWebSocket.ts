/**
 * WebSocket Security Events - Phase 3C Implementation  
 * Real-time Security Event Broadcasting System
 * 
 * Features:
 * - Real-time threat notifications
 * - Security alert broadcasting
 * - Fraud detection alerts
 * - System health monitoring
 * - Compliance notifications
 * - User session monitoring
 * - Admin alert dashboard
 */

import { WebSocketServer, WebSocket, RawData } from 'ws';
import { EventEmitter } from 'events';
import crypto from 'crypto';
import { SecurityDashboardService, ThreatEvent, SecurityMetrics } from './SecurityDashboardService.js';
import { AuditService, AuditEventType, AuditSeverity } from './AuditService.js';
import { SecurityService } from './SecurityService.js';

/**
 * WebSocket Message Types
 */
export enum WSMessageType {
  // Authentication
  AUTHENTICATE = 'authenticate',
  AUTHENTICATION_SUCCESS = 'auth_success',
  AUTHENTICATION_FAILED = 'auth_failed',
  
  // Subscription Management
  SUBSCRIBE = 'subscribe',
  UNSUBSCRIBE = 'unsubscribe',
  SUBSCRIPTION_CONFIRMED = 'subscription_confirmed',
  
  // Security Events
  THREAT_DETECTED = 'threat_detected',
  THREAT_UPDATED = 'threat_updated',
  SECURITY_ALERT = 'security_alert',
  FRAUD_ALERT = 'fraud_alert',
  
  // System Monitoring
  METRICS_UPDATE = 'metrics_update',
  HEALTH_UPDATE = 'health_update',
  COMPLIANCE_ALERT = 'compliance_alert',
  
  // Session Events
  SESSION_EXPIRED = 'session_expired',
  FORCED_LOGOUT = 'forced_logout',
  
  // System Messages
  PING = 'ping',
  PONG = 'pong',
  ERROR = 'error',
  HEARTBEAT = 'heartbeat'
}

/**
 * Subscription Channels
 */
export enum WSChannel {
  SECURITY_ALERTS = 'security_alerts',
  FRAUD_DETECTION = 'fraud_detection',
  SYSTEM_HEALTH = 'system_health',
  COMPLIANCE = 'compliance',
  USER_SESSIONS = 'user_sessions',
  ADMIN_DASHBOARD = 'admin_dashboard'
}

/**
 * WebSocket Client Interface
 */
interface WSClient {
  id: string;
  socket: WebSocket;
  userId?: string;
  role?: string;
  subscriptions: Set<WSChannel>;
  lastActivity: Date;
  ipAddress: string;
  userAgent?: string;
  authenticated: boolean;
}

/**
 * WebSocket Message Interface
 */
interface WSMessage {
  type: WSMessageType;
  channel?: WSChannel;
  data?: any;
  timestamp?: string;
  clientId?: string;
}

/**
 * WebSocket Security Events Service
 */
export class WebSocketSecurityService extends EventEmitter {
  private server?: WebSocketServer;
  private clients: Map<string, WSClient> = new Map();
  private heartbeatInterval?: NodeJS.Timeout;
  private cleanupInterval?: NodeJS.Timeout;
  private isRunning = false;

  // Security settings
  private readonly MAX_CONNECTIONS_PER_IP = 5;
  private readonly MAX_MESSAGE_SIZE = 1024 * 64; // 64KB
  private readonly HEARTBEAT_INTERVAL = 30000; // 30 seconds
  private readonly CLIENT_TIMEOUT = 300000; // 5 minutes
  private readonly AUTH_TIMEOUT = 10000; // 10 seconds

  constructor(
    private securityDashboard: SecurityDashboardService,
    private auditService: AuditService,
    private securityService: SecurityService,
    private port: number = 8080
  ) {
    super();
    console.log('🔌 Initializing WebSocket Security Service...');
    this.setupDashboardListeners();
  }

  /**
   * Start WebSocket server
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('WebSocket server already running');
      return;
    }

    console.log(`🚀 Starting WebSocket Security Server on port ${this.port}...`);

    this.server = new WebSocketServer({
      port: this.port,
      maxPayload: this.MAX_MESSAGE_SIZE,
      perMessageDeflate: true,
      clientTracking: true
    });

    this.server.on('connection', this.handleConnection.bind(this));
    this.server.on('error', this.handleServerError.bind(this));

    this.startHeartbeat();
    this.startCleanup();
    this.isRunning = true;

    console.log(`✅ WebSocket Security Server started on port ${this.port}`);
    this.emit('serverStarted');
  }

  /**
   * Stop WebSocket server
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    console.log('🛑 Stopping WebSocket Security Server...');

    // Stop intervals
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Close all client connections
    for (const client of this.clients.values()) {
      this.closeClient(client.id, 'Server shutdown');
    }

    // Close server
    if (this.server) {
      this.server.close();
    }

    this.isRunning = false;
    console.log('✅ WebSocket Security Server stopped');
    this.emit('serverStopped');
  }

  /**
   * Broadcast security alert to subscribed clients
   */
  broadcastSecurityAlert(alert: ThreatEvent): void {
    const message: WSMessage = {
      type: WSMessageType.SECURITY_ALERT,
      channel: WSChannel.SECURITY_ALERTS,
      data: alert,
      timestamp: new Date().toISOString()
    };

    this.broadcastToChannel(WSChannel.SECURITY_ALERTS, message);
  }

  /**
   * Broadcast fraud detection alert
   */
  broadcastFraudAlert(data: any): void {
    const message: WSMessage = {
      type: WSMessageType.FRAUD_ALERT,
      channel: WSChannel.FRAUD_DETECTION,
      data,
      timestamp: new Date().toISOString()
    };

    this.broadcastToChannel(WSChannel.FRAUD_DETECTION, message);
  }

  /**
   * Broadcast system metrics update
   */
  broadcastMetricsUpdate(metrics: SecurityMetrics): void {
    const message: WSMessage = {
      type: WSMessageType.METRICS_UPDATE,
      channel: WSChannel.SYSTEM_HEALTH,
      data: metrics,
      timestamp: new Date().toISOString()
    };

    this.broadcastToChannel(WSChannel.SYSTEM_HEALTH, message);
    this.broadcastToChannel(WSChannel.ADMIN_DASHBOARD, message);
  }

  /**
   * Force user logout via WebSocket
   */
  forceUserLogout(userId: string, reason: string): void {
    const userClients = Array.from(this.clients.values())
      .filter(client => client.userId === userId);

    for (const client of userClients) {
      this.sendMessage(client.id, {
        type: WSMessageType.FORCED_LOGOUT,
        data: { reason },
        timestamp: new Date().toISOString()
      });

      setTimeout(() => {
        this.closeClient(client.id, reason);
      }, 5000); // Give client 5 seconds to handle logout
    }
  }

  /**
   * Notify session expiration
   */
  notifySessionExpiration(userId: string, sessionId: string): void {
    const userClients = Array.from(this.clients.values())
      .filter(client => client.userId === userId);

    for (const client of userClients) {
      this.sendMessage(client.id, {
        type: WSMessageType.SESSION_EXPIRED,
        data: { sessionId },
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Get connection statistics
   */
  getConnectionStats(): {
    totalConnections: number;
    authenticatedConnections: number;
    subscriptionStats: Record<string, number>;
    clientsByRole: Record<string, number>;
  } {
    const clients = Array.from(this.clients.values());
    
    const subscriptionStats: Record<string, number> = {};
    const clientsByRole: Record<string, number> = {};

    for (const client of clients) {
      // Count subscriptions
      for (const subscription of client.subscriptions) {
        subscriptionStats[subscription] = (subscriptionStats[subscription] || 0) + 1;
      }

      // Count by role
      const role = client.role || 'guest';
      clientsByRole[role] = (clientsByRole[role] || 0) + 1;
    }

    return {
      totalConnections: clients.length,
      authenticatedConnections: clients.filter(c => c.authenticated).length,
      subscriptionStats,
      clientsByRole
    };
  }

  // ===================
  // PRIVATE METHODS
  // ===================

  private handleConnection(socket: WebSocket, request: any): void {
    const clientId = this.generateClientId();
    const ipAddress = request.socket.remoteAddress || 'unknown';
    
    console.log(`🔌 New WebSocket connection: ${clientId} from ${ipAddress}`);

    // Check IP connection limit
    const existingConnections = Array.from(this.clients.values())
      .filter(client => client.ipAddress === ipAddress).length;

    if (existingConnections >= this.MAX_CONNECTIONS_PER_IP) {
      console.log(`❌ Connection limit exceeded for IP: ${ipAddress}`);
      socket.close(1008, 'Connection limit exceeded');
      return;
    }

    const client: WSClient = {
      id: clientId,
      socket,
      subscriptions: new Set(),
      lastActivity: new Date(),
      ipAddress,
      userAgent: request.headers['user-agent'],
      authenticated: false
    };

    this.clients.set(clientId, client);

    // Set up socket event handlers
    socket.on('message', (data: RawData) => this.handleMessage(clientId, data));
    socket.on('close', (code: number, reason: Buffer) => this.handleDisconnection(clientId, code, reason));
    socket.on('error', (error: Error) => this.handleClientError(clientId, error));
    socket.on('ping', () => this.handlePing(clientId));
    socket.on('pong', () => this.handlePong(clientId));

    // Set authentication timeout
    setTimeout(() => {
      const currentClient = this.clients.get(clientId);
      if (currentClient && !currentClient.authenticated) {
        console.log(`🔒 Authentication timeout for client: ${clientId}`);
        this.closeClient(clientId, 'Authentication timeout');
      }
    }, this.AUTH_TIMEOUT);

    this.emit('clientConnected', client);
  }

  private handleMessage(clientId: string, data: RawData): void {
    const client = this.clients.get(clientId);
    if (!client) {
      return;
    }

    client.lastActivity = new Date();

    try {
      const message: WSMessage = JSON.parse(data.toString());
      
      switch (message.type) {
        case WSMessageType.AUTHENTICATE:
          this.handleAuthentication(clientId, message);
          break;

        case WSMessageType.SUBSCRIBE:
          this.handleSubscription(clientId, message);
          break;

        case WSMessageType.UNSUBSCRIBE:
          this.handleUnsubscription(clientId, message);
          break;

        case WSMessageType.PING:
          this.handlePing(clientId);
          break;

        default:
          console.log(`Unknown message type: ${message.type} from client: ${clientId}`);
      }

    } catch (error) {
      console.error(`Invalid message from client ${clientId}:`, error);
      this.sendError(clientId, 'Invalid message format');
    }
  }

  private async handleAuthentication(clientId: string, message: WSMessage): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client) {
      return;
    }

    try {
      const { token } = message.data;
      
      if (!token) {
        this.sendMessage(clientId, {
          type: WSMessageType.AUTHENTICATION_FAILED,
          data: { error: 'Token required' }
        });
        return;
      }

      // Validate JWT token (simplified - would use actual JWT validation)
      const payload = this.validateJWTToken(token);
      
      if (!payload) {
        this.sendMessage(clientId, {
          type: WSMessageType.AUTHENTICATION_FAILED,
          data: { error: 'Invalid token' }
        });
        
        await this.auditService.logAuditEvent({
          eventType: AuditEventType.USER_LOGIN_FAILED,
          severity: AuditSeverity.WARNING,
          userId: undefined,
          sessionId: clientId,
          ipAddress: client.ipAddress,
          userAgent: client.userAgent,
          resource: 'websocket-auth',
          action: 'authentication-failed',
          details: { reason: 'Invalid token' }
        });
        return;
      }

      // Update client with user info
      client.userId = payload.userId;
      client.role = payload.role;
      client.authenticated = true;

      this.sendMessage(clientId, {
        type: WSMessageType.AUTHENTICATION_SUCCESS,
        data: { 
          userId: payload.userId,
          role: payload.role 
        }
      });

      console.log(`✅ Client authenticated: ${clientId} (${payload.userId})`);

      await this.auditService.logAuditEvent({
        eventType: AuditEventType.WEBSOCKET_CONNECTED,
        severity: AuditSeverity.INFO,
        userId: payload.userId,
        sessionId: clientId,
        ipAddress: client.ipAddress,
        userAgent: client.userAgent,
        resource: 'websocket-auth',
        action: 'authentication-success',
        details: { role: payload.role }
      });

    } catch (error) {
      console.error(`Authentication error for client ${clientId}:`, error);
      this.sendMessage(clientId, {
        type: WSMessageType.AUTHENTICATION_FAILED,
        data: { error: 'Authentication failed' }
      });
    }
  }

  private handleSubscription(clientId: string, message: WSMessage): void {
    const client = this.clients.get(clientId);
    if (!client || !client.authenticated) {
      this.sendError(clientId, 'Authentication required');
      return;
    }

    const { channel } = message;
    if (!channel || !Object.values(WSChannel).includes(channel as WSChannel)) {
      this.sendError(clientId, 'Invalid channel');
      return;
    }

    // Check permissions
    if (!this.hasChannelPermission(client, channel as WSChannel)) {
      this.sendError(clientId, 'Insufficient permissions');
      return;
    }

    client.subscriptions.add(channel as WSChannel);

    this.sendMessage(clientId, {
      type: WSMessageType.SUBSCRIPTION_CONFIRMED,
      channel: channel as WSChannel,
      data: { subscribed: true }
    });

    console.log(`📡 Client ${clientId} subscribed to ${channel}`);
  }

  private handleUnsubscription(clientId: string, message: WSMessage): void {
    const client = this.clients.get(clientId);
    if (!client) {
      return;
    }

    const { channel } = message;
    if (channel) {
      client.subscriptions.delete(channel as WSChannel);
      console.log(`📡 Client ${clientId} unsubscribed from ${channel}`);
    }
  }

  private handlePing(clientId: string): void {
    this.sendMessage(clientId, {
      type: WSMessageType.PONG,
      timestamp: new Date().toISOString()
    });
  }

  private handlePong(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.lastActivity = new Date();
    }
  }

  private handleDisconnection(clientId: string, code: number, reason: Buffer): void {
    console.log(`🔌 Client disconnected: ${clientId} (${code}: ${reason.toString()})`);
    
    const client = this.clients.get(clientId);
    if (client && client.authenticated) {
      this.auditService.logAuditEvent({
        eventType: AuditEventType.WEBSOCKET_DISCONNECTED,
        severity: AuditSeverity.INFO,
        userId: client.userId,
        sessionId: clientId,
        ipAddress: client.ipAddress,
        userAgent: client.userAgent,
        resource: 'websocket',
        action: 'disconnection',
        details: { code, reason: reason.toString() }
      });
    }

    this.clients.delete(clientId);
    this.emit('clientDisconnected', { clientId, code, reason: reason.toString() });
  }

  private handleClientError(clientId: string, error: Error): void {
    console.error(`WebSocket client error ${clientId}:`, error);
    this.closeClient(clientId, 'Client error');
  }

  private handleServerError(error: Error): void {
    console.error('WebSocket server error:', error);
    this.emit('serverError', error);
  }

  private sendMessage(clientId: string, message: WSMessage): void {
    const client = this.clients.get(clientId);
    if (!client || client.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      client.socket.send(JSON.stringify(message));
    } catch (error) {
      console.error(`Error sending message to client ${clientId}:`, error);
      this.closeClient(clientId, 'Send error');
    }
  }

  private sendError(clientId: string, error: string): void {
    this.sendMessage(clientId, {
      type: WSMessageType.ERROR,
      data: { error },
      timestamp: new Date().toISOString()
    });
  }

  private broadcastToChannel(channel: WSChannel, message: WSMessage): void {
    const subscribedClients = Array.from(this.clients.values())
      .filter(client => client.subscriptions.has(channel));

    for (const client of subscribedClients) {
      this.sendMessage(client.id, message);
    }

    console.log(`📢 Broadcasted ${message.type} to ${subscribedClients.length} clients on ${channel}`);
  }

  private closeClient(clientId: string, reason: string): void {
    const client = this.clients.get(clientId);
    if (!client) {
      return;
    }

    try {
      if (client.socket.readyState === WebSocket.OPEN) {
        client.socket.close(1000, reason);
      }
    } catch (error) {
      console.error(`Error closing client ${clientId}:`, error);
    }

    this.clients.delete(clientId);
  }

  private hasChannelPermission(client: WSClient, channel: WSChannel): boolean {
    // Basic permission check
    switch (channel) {
      case WSChannel.ADMIN_DASHBOARD:
        return client.role === 'ADMIN';
      
      case WSChannel.COMPLIANCE:
        return client.role === 'ADMIN' || client.role === 'COMPLIANCE_OFFICER';
      
      case WSChannel.SECURITY_ALERTS:
      case WSChannel.FRAUD_DETECTION:
      case WSChannel.SYSTEM_HEALTH:
        return client.role === 'ADMIN' || client.role === 'SECURITY_OFFICER';
      
      case WSChannel.USER_SESSIONS:
        return client.authenticated; // Any authenticated user for their own sessions
      
      default:
        return false;
    }
  }

  private validateJWTToken(token: string): any {
    // Simplified JWT validation - would use proper JWT library in production
    try {
      // This is a mock implementation
      if (token.startsWith('valid_')) {
        return {
          userId: token.replace('valid_', ''),
          role: 'ADMIN', // Mock role
          exp: Date.now() + 3600000 // 1 hour
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  private generateClientId(): string {
    return `ws_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      for (const client of this.clients.values()) {
        if (client.socket.readyState === WebSocket.OPEN) {
          this.sendMessage(client.id, {
            type: WSMessageType.HEARTBEAT,
            timestamp: new Date().toISOString()
          });
        }
      }
    }, this.HEARTBEAT_INTERVAL);
  }

  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      const now = new Date();
      const timeoutClients: string[] = [];

      for (const [clientId, client] of this.clients.entries()) {
        const timeSinceActivity = now.getTime() - client.lastActivity.getTime();
        
        if (timeSinceActivity > this.CLIENT_TIMEOUT) {
          timeoutClients.push(clientId);
        }
      }

      for (const clientId of timeoutClients) {
        console.log(`⏰ Client timeout: ${clientId}`);
        this.closeClient(clientId, 'Inactive timeout');
      }
    }, this.CLIENT_TIMEOUT / 2); // Check every 2.5 minutes
  }

  private setupDashboardListeners(): void {
    // Listen to security dashboard events
    this.securityDashboard.on('threatDetected', (threat: ThreatEvent) => {
      this.broadcastSecurityAlert(threat);
    });

    this.securityDashboard.on('metricsUpdated', (metrics: SecurityMetrics) => {
      this.broadcastMetricsUpdate(metrics);
    });

    console.log('📊 Dashboard listeners configured');
  }
}

/**
 * WebSocket Security Service Factory
 */
export function createWebSocketSecurityService(
  securityDashboard: SecurityDashboardService,
  auditService: AuditService,
  securityService: SecurityService,
  port: number = 8080
): WebSocketSecurityService {
  return new WebSocketSecurityService(securityDashboard, auditService, securityService, port);
}

console.log('🔌 WebSocket Security Service module loaded');
export default WebSocketSecurityService;
