/**
 * Advanced P2P Order Management Service
 * MIT-Level Engineering - Pure P2P Crypto Platform
 * 
 * Features:
 * - Advanced order lifecycle management
 * - Dynamic order modification
 * - Partial fill handling
 * - Order expiration and cleanup
 * - Portfolio impact analysis
 * - Risk management integration
 * - Performance analytics
 */

import { EventEmitter } from 'events';
import { PrismaClient, Order, OrderStatus, OrderType } from '@prisma/client';
import { Redis } from 'ioredis';
import BigNumber from 'bignumber.js';
import P2PMatchingEngine, { P2POrder, P2POrderSide, P2POrderType } from './P2PMatchingEngine.js';
import SmartContractEscrowService from './SmartContractEscrowService.js';
import { SecurityService } from './SecurityService.js';
import { AuditService } from './AuditService.js';

// ===========================
// ADVANCED ORDER TYPES
// ===========================

export interface AdvancedOrderParams {
  // Basic order data
  userId: string;
  symbol: string;
  side: P2POrderSide;
  type: P2POrderType;
  quantity: BigNumber;
  price?: BigNumber;

  // Advanced features
  timeInForce?: 'IOC' | 'FOK' | 'GTC' | 'GTD'; // Immediate-or-Cancel, Fill-or-Kill, Good-Till-Cancel, Good-Till-Date
  expireAt?: Date;
  
  // Conditional orders
  stopPrice?: BigNumber;
  triggerPrice?: BigNumber;
  
  // Portfolio management
  maxPortfolioPercentage?: number; // Max % of portfolio this order can represent
  minFillQuantity?: BigNumber; // Minimum acceptable fill quantity
  
  // Risk management
  maxSlippage?: BigNumber; // Max acceptable price slippage (percentage)
  
  // P2P specific
  preferredCounterparties?: string[]; // Preferred trading partners
  excludedCounterparties?: string[]; // Blacklisted trading partners
  requiredReputationScore?: number;
  
  // Payment methods
  acceptedPaymentMethods?: string[];
  escrowRequirement?: 'FULL' | 'PARTIAL' | 'NONE';
  
  // Metadata
  clientOrderId?: string;
  tags?: string[];
  notes?: string;
}

export interface OrderModification {
  orderId: string;
  newQuantity?: BigNumber;
  newPrice?: BigNumber;
  newTimeInForce?: 'IOC' | 'FOK' | 'GTC' | 'GTD';
  newExpireAt?: Date;
}

export interface OrderAnalytics {
  orderId: string;
  submissionLatency: number; // Time from submit to acknowledgment
  matchingLatency: number; // Time from submit to first match
  fillRate: BigNumber; // Percentage filled
  averageFillPrice: BigNumber;
  priceImprovement: BigNumber; // Better than expected price
  slippage: BigNumber;
  escrowEfficiency: number; // Time escrow was locked vs trading time
  counterpartyReputation: number;
  totalFees: BigNumber;
}

export interface PortfolioImpact {
  beforeOrder: {
    totalValue: BigNumber;
    assetBreakdown: Map<string, BigNumber>;
    riskScore: number;
  };
  afterOrder: {
    totalValue: BigNumber;
    assetBreakdown: Map<string, BigNumber>;
    riskScore: number;
  };
  impact: {
    valueChange: BigNumber;
    riskChange: number;
    concentrationRisk: number;
    liquidityImpact: BigNumber;
  };
}

/**
 * Advanced P2P Order Management Service
 */
export class P2POrderManagementService extends EventEmitter {
  private prisma: PrismaClient;
  private redis: Redis;
  private p2pEngine: P2PMatchingEngine;
  private escrowService: SmartContractEscrowService;
  private securityService: SecurityService;
  private auditService: AuditService;
  
  // Order tracking and analytics
  private activeOrders: Map<string, P2POrder>;
  private orderAnalytics: Map<string, OrderAnalytics>;
  private userPortfolios: Map<string, Map<string, BigNumber>>; // userId -> asset -> balance
  
  // Performance metrics
  private metrics = {
    ordersProcessed: 0,
    averageProcessingTime: 0,
    successRate: 0,
    totalVolume: new BigNumber(0)
  };

  // Configuration
  private readonly ORDER_EXPIRY_CHECK_INTERVAL = 60000; // 1 minute
  private readonly MAX_ORDERS_PER_USER = 100;
  private readonly MIN_ORDER_VALUE = new BigNumber('0.01'); // Min $0.01 equivalent

  constructor(
    p2pEngine: P2PMatchingEngine,
    escrowService: SmartContractEscrowService,
    securityService: SecurityService,
    auditService: AuditService,
    prisma: PrismaClient,
    redis: Redis
  ) {
    super();
    
    this.p2pEngine = p2pEngine;
    this.escrowService = escrowService;
    this.securityService = securityService;
    this.auditService = auditService;
    this.prisma = prisma;
    this.redis = redis;
    
    this.activeOrders = new Map();
    this.orderAnalytics = new Map();
    this.userPortfolios = new Map();

    this.setupEventHandlers();
    this.startOrderExpiryService();
    this.startAnalyticsService();
  }

  /**
   * Submit advanced P2P order with comprehensive validation and risk checks
   */
  async submitAdvancedOrder(params: AdvancedOrderParams): Promise<{
    success: boolean;
    orderId?: string;
    error?: string;
    analytics?: {
      estimatedFillTime: number;
      priceImpact: BigNumber;
      riskAssessment: string;
      portfolioImpact: PortfolioImpact;
    };
  }> {
    const startTime = Date.now();

    try {
      console.log(`📝 Processing advanced order: ${params.side} ${params.quantity} ${params.symbol} @ ${params.price || 'MARKET'}`);

      // 1. Pre-flight validations
      const validationResult = await this.validateAdvancedOrder(params);
      if (!validationResult.isValid) {
        return { success: false, error: validationResult.error };
      }

      // 2. Risk assessment
      const riskAssessment = await this.assessOrderRisk(params);
      if (riskAssessment.riskLevel === 'HIGH' && !riskAssessment.approved) {
        return { success: false, error: `Order rejected: ${riskAssessment.reason}` };
      }

      // 3. Portfolio impact analysis
      const portfolioImpact = await this.analyzePortfolioImpact(params);
      if (portfolioImpact.impact.concentrationRisk > 0.8) { // 80% concentration is too risky
        return { success: false, error: 'Order would create excessive concentration risk' };
      }

      // 4. Calculate optimal execution strategy
      const executionStrategy = await this.calculateExecutionStrategy(params);

      // 5. Set up escrow if required
      let escrowId: string | undefined;
      if (params.escrowRequirement !== 'NONE') {
        escrowId = await this.setupEscrowForOrder(params);
        if (!escrowId) {
          return { success: false, error: 'Failed to create escrow for order' };
        }
      }

      // 6. Create and submit order
      const orderId = this.generateOrderId();
      const order: P2POrder = {
        id: orderId,
        userId: params.userId,
        symbol: params.symbol,
        side: params.side,
        type: params.type,
        quantity: params.quantity,
        remainingQuantity: params.quantity,
        fillQuantity: new BigNumber(0),
        price: params.price || new BigNumber(0),
        stopPrice: params.stopPrice,
        status: 'PENDING',
        timeInForce: params.timeInForce || 'GTC',
        expireAt: params.expireAt,
        escrowId,
        paymentMethods: params.acceptedPaymentMethods || [],
        requiredReputationScore: params.requiredReputationScore || 50,
        preferredCounterparties: params.preferredCounterparties || [],
        excludedCounterparties: params.excludedCounterparties || [],
        clientOrderId: params.clientOrderId,
        tags: params.tags || [],
        metadata: {
          submissionTime: new Date(),
          maxSlippage: params.maxSlippage,
          minFillQuantity: params.minFillQuantity,
          notes: params.notes
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // 7. Initialize analytics tracking
      this.orderAnalytics.set(orderId, {
        orderId,
        submissionLatency: Date.now() - startTime,
        matchingLatency: 0,
        fillRate: new BigNumber(0),
        averageFillPrice: new BigNumber(0),
        priceImprovement: new BigNumber(0),
        slippage: new BigNumber(0),
        escrowEfficiency: 0,
        counterpartyReputation: 0,
        totalFees: new BigNumber(0)
      });

      // 8. Submit to matching engine
      const submissionResult = await this.p2pEngine.submitOrder(order);
      if (!submissionResult.success) {
        return { success: false, error: submissionResult.error };
      }

      // 9. Store in active orders
      this.activeOrders.set(orderId, order);

      // 10. Persist to database
      await this.persistOrderToDatabase(order);

      // 11. Audit log
      await this.auditService.logActivity({
        userId: params.userId,
        action: 'ORDER_SUBMITTED',
        resourceType: 'P2P_ORDER',
        resourceId: orderId,
        metadata: {
          symbol: params.symbol,
          side: params.side,
          quantity: params.quantity.toString(),
          type: params.type,
          escrowId
        }
      });

      // 12. Update metrics
      this.metrics.ordersProcessed++;
      this.updateAverageProcessingTime(Date.now() - startTime);

      // 13. Emit events
      this.emit('order:submitted', order);

      console.log(`✅ Advanced order submitted: ${orderId}`);

      return {
        success: true,
        orderId,
        analytics: {
          estimatedFillTime: executionStrategy.estimatedFillTime,
          priceImpact: executionStrategy.priceImpact,
          riskAssessment: riskAssessment.riskLevel,
          portfolioImpact
        }
      };

    } catch (error) {
      console.error('❌ Error submitting advanced order:', error);
      return { success: false, error: 'Internal error processing order' };
    }
  }

  /**
   * Modify existing order
   */
  async modifyOrder(modification: OrderModification): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      console.log(`🔄 Modifying order: ${modification.orderId}`);

      const order = this.activeOrders.get(modification.orderId);
      if (!order) {
        return { success: false, error: 'Order not found' };
      }

      if (order.status !== 'ACTIVE' && order.status !== 'PARTIAL_FILL') {
        return { success: false, error: 'Order cannot be modified in current status' };
      }

      // Validate modifications
      if (modification.newQuantity && modification.newQuantity.lte(order.fillQuantity)) {
        return { success: false, error: 'New quantity must be greater than filled quantity' };
      }

      // Apply modifications
      const oldOrder = { ...order };
      
      if (modification.newQuantity) {
        order.quantity = modification.newQuantity;
        order.remainingQuantity = modification.newQuantity.minus(order.fillQuantity);
      }
      
      if (modification.newPrice) {
        order.price = modification.newPrice;
      }
      
      if (modification.newTimeInForce) {
        order.timeInForce = modification.newTimeInForce;
      }
      
      if (modification.newExpireAt) {
        order.expireAt = modification.newExpireAt;
      }

      order.updatedAt = new Date();

      // Update in matching engine
      const updateResult = await this.p2pEngine.updateOrder(order);
      if (!updateResult.success) {
        // Revert changes
        Object.assign(order, oldOrder);
        return { success: false, error: updateResult.error };
      }

      // Update in database
      await this.updateOrderInDatabase(order);

      // Audit log
      await this.auditService.logActivity({
        userId: order.userId,
        action: 'ORDER_MODIFIED',
        resourceType: 'P2P_ORDER',
        resourceId: order.id,
        metadata: {
          oldQuantity: oldOrder.quantity.toString(),
          newQuantity: order.quantity.toString(),
          oldPrice: oldOrder.price.toString(),
          newPrice: order.price.toString()
        }
      });

      this.emit('order:modified', order, oldOrder);

      console.log(`✅ Order modified: ${modification.orderId}`);
      return { success: true };

    } catch (error) {
      console.error(`❌ Error modifying order ${modification.orderId}:`, error);
      return { success: false, error: 'Internal error modifying order' };
    }
  }

  /**
   * Cancel order
   */
  async cancelOrder(orderId: string, userId: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      console.log(`❌ Cancelling order: ${orderId}`);

      const order = this.activeOrders.get(orderId);
      if (!order) {
        return { success: false, error: 'Order not found' };
      }

      if (order.userId !== userId) {
        return { success: false, error: 'Unauthorized to cancel this order' };
      }

      if (order.status === 'CANCELLED' || order.status === 'FILLED') {
        return { success: false, error: 'Order cannot be cancelled in current status' };
      }

      // Cancel in matching engine
      const cancelResult = await this.p2pEngine.cancelOrder(orderId);
      if (!cancelResult.success) {
        return { success: false, error: cancelResult.error };
      }

      // Release escrow if applicable
      if (order.escrowId) {
        try {
          await this.escrowService.releaseEscrow(order.escrowId, order.userId);
        } catch (error) {
          console.error(`❌ Error releasing escrow for cancelled order ${orderId}:`, error);
          // Don't fail the cancellation due to escrow issues
        }
      }

      // Update order status
      order.status = 'CANCELLED';
      order.updatedAt = new Date();

      // Update in database
      await this.updateOrderInDatabase(order);

      // Remove from active orders
      this.activeOrders.delete(orderId);

      // Audit log
      await this.auditService.logActivity({
        userId,
        action: 'ORDER_CANCELLED',
        resourceType: 'P2P_ORDER',
        resourceId: orderId,
        metadata: {
          symbol: order.symbol,
          remainingQuantity: order.remainingQuantity.toString()
        }
      });

      this.emit('order:cancelled', order);

      console.log(`✅ Order cancelled: ${orderId}`);
      return { success: true };

    } catch (error) {
      console.error(`❌ Error cancelling order ${orderId}:`, error);
      return { success: false, error: 'Internal error cancelling order' };
    }
  }

  /**
   * Get user's active orders
   */
  async getUserActiveOrders(userId: string): Promise<P2POrder[]> {
    try {
      const userOrders = Array.from(this.activeOrders.values())
        .filter(order => order.userId === userId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      return userOrders;
    } catch (error) {
      console.error(`❌ Error fetching user orders for ${userId}:`, error);
      return [];
    }
  }

  /**
   * Get order analytics
   */
  getOrderAnalytics(orderId: string): OrderAnalytics | undefined {
    return this.orderAnalytics.get(orderId);
  }

  /**
   * Get service performance metrics
   */
  getPerformanceMetrics(): any {
    return {
      ...this.metrics,
      activeOrders: this.activeOrders.size,
      trackedAnalytics: this.orderAnalytics.size,
      uptime: process.uptime()
    };
  }

  // ===========================
  // PRIVATE VALIDATION METHODS
  // ===========================

  private async validateAdvancedOrder(params: AdvancedOrderParams): Promise<{
    isValid: boolean;
    error?: string;
  }> {
    // Basic validation
    if (!params.userId || !params.symbol || !params.side || !params.type) {
      return { isValid: false, error: 'Missing required order parameters' };
    }

    if (params.quantity.lte(0)) {
      return { isValid: false, error: 'Order quantity must be positive' };
    }

    if (params.type === 'LIMIT' && (!params.price || params.price.lte(0))) {
      return { isValid: false, error: 'Limit orders must have positive price' };
    }

    // User order limit check
    const userActiveOrders = Array.from(this.activeOrders.values())
      .filter(order => order.userId === params.userId).length;
      
    if (userActiveOrders >= this.MAX_ORDERS_PER_USER) {
      return { isValid: false, error: `Maximum ${this.MAX_ORDERS_PER_USER} active orders per user` };
    }

    // Minimum order value check
    const estimatedValue = params.price ? params.quantity.times(params.price) : new BigNumber(0);
    if (params.type === 'LIMIT' && estimatedValue.lt(this.MIN_ORDER_VALUE)) {
      return { isValid: false, error: 'Order value below minimum threshold' };
    }

    return { isValid: true };
  }

  private async assessOrderRisk(params: AdvancedOrderParams): Promise<{
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    approved: boolean;
    reason?: string;
  }> {
    // Risk factors
    let riskScore = 0;

    // Large order size risk
    const estimatedValue = params.price ? params.quantity.times(params.price) : new BigNumber(0);
    if (estimatedValue.gt(10000)) riskScore += 30; // Orders > $10k
    else if (estimatedValue.gt(1000)) riskScore += 10; // Orders > $1k

    // Market order risk
    if (params.type === 'MARKET') riskScore += 20;

    // No escrow risk
    if (params.escrowRequirement === 'NONE') riskScore += 25;

    // Low reputation counterparty acceptance
    if (params.requiredReputationScore && params.requiredReputationScore < 70) riskScore += 15;

    // Determine risk level
    let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    if (riskScore <= 30) riskLevel = 'LOW';
    else if (riskScore <= 60) riskLevel = 'MEDIUM';
    else riskLevel = 'HIGH';

    // High risk orders require additional approval (mock for now)
    const approved = riskLevel !== 'HIGH' || estimatedValue.lt(50000); // Auto-approve < $50k

    return {
      riskLevel,
      approved,
      reason: riskLevel === 'HIGH' && !approved ? 'Order size exceeds risk limits' : undefined
    };
  }

  private async analyzePortfolioImpact(params: AdvancedOrderParams): Promise<PortfolioImpact> {
    // Mock portfolio impact analysis
    // In production, this would integrate with portfolio management service
    
    const beforeOrder = {
      totalValue: new BigNumber(100000), // $100k portfolio
      assetBreakdown: new Map([
        ['BTC', new BigNumber(50000)],
        ['ETH', new BigNumber(30000)],
        ['USDC', new BigNumber(20000)]
      ]),
      riskScore: 0.6
    };

    // Calculate after-order state
    const orderValue = params.price ? params.quantity.times(params.price) : new BigNumber(0);
    const afterOrder = { ...beforeOrder };
    
    if (params.side === 'BUY') {
      afterOrder.assetBreakdown.set(params.symbol, 
        (afterOrder.assetBreakdown.get(params.symbol) || new BigNumber(0)).plus(orderValue));
    } else {
      afterOrder.assetBreakdown.set(params.symbol, 
        (afterOrder.assetBreakdown.get(params.symbol) || new BigNumber(0)).minus(orderValue));
    }

    // Calculate concentration risk
    const maxAssetValue = Math.max(...Array.from(afterOrder.assetBreakdown.values()).map(v => v.toNumber()));
    const concentrationRisk = maxAssetValue / afterOrder.totalValue.toNumber();

    return {
      beforeOrder,
      afterOrder,
      impact: {
        valueChange: orderValue,
        riskChange: 0.05, // Mock 5% risk increase
        concentrationRisk,
        liquidityImpact: orderValue.dividedBy(1000000) // Mock liquidity impact
      }
    };
  }

  private async calculateExecutionStrategy(params: AdvancedOrderParams): Promise<{
    estimatedFillTime: number;
    priceImpact: BigNumber;
    optimalChunkSize?: BigNumber;
  }> {
    // Mock execution strategy calculation
    // In production, this would analyze order book depth, historical data, etc.
    
    const estimatedFillTime = params.type === 'MARKET' ? 1000 : 30000; // 1s for market, 30s for limit
    const priceImpact = params.quantity.dividedBy(100000); // Mock 1 basis point per $1000
    
    return {
      estimatedFillTime,
      priceImpact,
      optimalChunkSize: params.quantity.dividedBy(5) // Break large orders into 5 chunks
    };
  }

  private async setupEscrowForOrder(params: AdvancedOrderParams): Promise<string | undefined> {
    try {
      if (params.side === 'BUY') {
        // For buy orders, escrow the payment amount
        const escrowAmount = params.price ? params.quantity.times(params.price) : new BigNumber(0);
        const escrowResult = await this.escrowService.createEscrow(
          params.userId,
          'MOCK_SELLER', // Will be filled when matched
          'USDC', // Assume USDC payments
          escrowAmount
        );
        return escrowResult.success ? escrowResult.escrowId : undefined;
      } else {
        // For sell orders, escrow the asset
        const escrowResult = await this.escrowService.createEscrow(
          params.userId,
          'MOCK_BUYER', // Will be filled when matched
          params.symbol,
          params.quantity
        );
        return escrowResult.success ? escrowResult.escrowId : undefined;
      }
    } catch (error) {
      console.error('❌ Error setting up escrow for order:', error);
      return undefined;
    }
  }

  // ===========================
  // DATABASE OPERATIONS
  // ===========================

  private async persistOrderToDatabase(order: P2POrder): Promise<void> {
    try {
      await this.prisma.order.create({
        data: {
          id: order.id,
          userId: order.userId,
          symbol: order.symbol,
          side: order.side as OrderType, // Assuming compatible enum
          type: order.type as OrderType,
          quantity: order.quantity.toString(),
          price: order.price.toString(),
          status: order.status as OrderStatus,
          remainingQuantity: order.remainingQuantity.toString(),
          fillQuantity: order.fillQuantity.toString(),
          escrowId: order.escrowId,
          clientOrderId: order.clientOrderId,
          createdAt: order.createdAt,
          updatedAt: order.updatedAt
        }
      });
    } catch (error) {
      console.error('❌ Error persisting order to database:', error);
      // Don't throw - order is already in memory and matching engine
    }
  }

  private async updateOrderInDatabase(order: P2POrder): Promise<void> {
    try {
      await this.prisma.order.update({
        where: { id: order.id },
        data: {
          quantity: order.quantity.toString(),
          price: order.price.toString(),
          status: order.status as OrderStatus,
          remainingQuantity: order.remainingQuantity.toString(),
          fillQuantity: order.fillQuantity.toString(),
          updatedAt: order.updatedAt
        }
      });
    } catch (error) {
      console.error('❌ Error updating order in database:', error);
    }
  }

  // ===========================
  // EVENT HANDLERS
  // ===========================

  private setupEventHandlers(): void {
    // Listen to matching engine events
    this.p2pEngine.on('trade:executed', (trade) => {
      this.handleTradeExecution(trade);
    });

    this.p2pEngine.on('order:filled', (order) => {
      this.handleOrderFilled(order);
    });

    this.p2pEngine.on('order:partial_fill', (order) => {
      this.handlePartialFill(order);
    });
  }

  private handleTradeExecution(trade: any): void {
    // Update analytics for both orders involved in trade
    const buyOrderAnalytics = this.orderAnalytics.get(trade.buyOrderId);
    const sellOrderAnalytics = this.orderAnalytics.get(trade.sellOrderId);

    if (buyOrderAnalytics) {
      buyOrderAnalytics.matchingLatency = Date.now() - new Date(trade.executedAt).getTime();
      buyOrderAnalytics.averageFillPrice = trade.price;
    }

    if (sellOrderAnalytics) {
      sellOrderAnalytics.matchingLatency = Date.now() - new Date(trade.executedAt).getTime();
      sellOrderAnalytics.averageFillPrice = trade.price;
    }

    this.emit('trade:analytics_updated', { trade, buyOrderAnalytics, sellOrderAnalytics });
  }

  private handleOrderFilled(order: P2POrder): void {
    // Update analytics
    const analytics = this.orderAnalytics.get(order.id);
    if (analytics) {
      analytics.fillRate = new BigNumber(100); // 100% filled
    }

    // Remove from active orders
    this.activeOrders.delete(order.id);

    this.emit('order:completed', order);
  }

  private handlePartialFill(order: P2POrder): void {
    // Update analytics
    const analytics = this.orderAnalytics.get(order.id);
    if (analytics) {
      analytics.fillRate = order.fillQuantity.dividedBy(order.quantity).times(100);
    }

    this.emit('order:partial_fill', order);
  }

  // ===========================
  // BACKGROUND SERVICES
  // ===========================

  private startOrderExpiryService(): void {
    setInterval(async () => {
      const now = new Date();
      const expiredOrders: string[] = [];

      for (const [orderId, order] of this.activeOrders.entries()) {
        if (order.expireAt && order.expireAt <= now) {
          expiredOrders.push(orderId);
        }
      }

      // Cancel expired orders
      for (const orderId of expiredOrders) {
        const order = this.activeOrders.get(orderId);
        if (order) {
          await this.cancelOrder(orderId, order.userId);
          console.log(`⏰ Auto-cancelled expired order: ${orderId}`);
        }
      }

    }, this.ORDER_EXPIRY_CHECK_INTERVAL);
  }

  private startAnalyticsService(): void {
    // Periodically update performance metrics
    setInterval(() => {
      this.updatePerformanceMetrics();
    }, 30000); // Every 30 seconds
  }

  // ===========================
  // UTILITY METHODS
  // ===========================

  private generateOrderId(): string {
    return `p2p_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private updateAverageProcessingTime(processingTime: number): void {
    const totalTime = this.metrics.averageProcessingTime * (this.metrics.ordersProcessed - 1) + processingTime;
    this.metrics.averageProcessingTime = totalTime / this.metrics.ordersProcessed;
  }

  private updatePerformanceMetrics(): void {
    // Calculate success rate based on filled vs total orders
    const totalTracked = this.orderAnalytics.size;
    const successfulOrders = Array.from(this.orderAnalytics.values())
      .filter(analytics => analytics.fillRate.gte(100)).length;
    
    if (totalTracked > 0) {
      this.metrics.successRate = (successfulOrders / totalTracked) * 100;
    }

    // Update total volume
    this.metrics.totalVolume = Array.from(this.orderAnalytics.values())
      .reduce((total, analytics) => total.plus(analytics.averageFillPrice.times(analytics.fillRate.dividedBy(100))), new BigNumber(0));
  }
}

console.log('📊 P2P Order Management Service module loaded');
export default P2POrderManagementService;
