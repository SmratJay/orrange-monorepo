/**
 * Phase 3D Advanced Features API Routes
 * Integration of Payment Gateway, Smart Contract Escrow, Analytics, UI Enhancement, and AI Recommendation Services
 */

import express from 'express';
import rateLimit from 'express-rate-limit';
import { body, param, query, validationResult } from 'express-validator';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { SecurityService } from '../services/SecurityService.js';
import { AuditService } from '../services/AuditService.js';
import { PaymentGatewayService } from '../services/PaymentGatewayService.js';
import { SmartContractEscrowService } from '../services/SmartContractEscrowService.js';
import { TradingAnalyticsService, MetricType, TimePeriod } from '../services/TradingAnalyticsService.js';
import { UIEnhancementService, NotificationType, UITheme } from '../services/UIEnhancementService.js';
import { AIRecommendationEngine, RecommendationType, RiskLevel } from '../services/AIRecommendationEngine.js';

const router = express.Router();

// Rate limiting for different endpoints
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

const analyticsLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 20 // limit analytics requests
});

const aiLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 30 // limit AI requests
});

// ====================
// PAYMENT GATEWAY ROUTES
// ====================

/**
 * Process Payment
 */
router.post('/payments/process',
  generalLimiter,
  authenticateToken,
  [
    body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be greater than 0'),
    body('currency').isIn(['USD', 'EUR', 'GBP', 'BTC', 'ETH', 'USDC']).withMessage('Invalid currency'),
    body('provider').isIn(['stripe', 'paypal', 'square', 'razorpay', 'crypto']).withMessage('Invalid payment provider'),
    body('paymentMethod').notEmpty().withMessage('Payment method is required')
  ],
  async (req: any, res: any) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { amount, currency, provider, paymentMethod, metadata } = req.body;
      const paymentService = req.app.locals.paymentGatewayService as PaymentGatewayService;

      const result = await paymentService.processPayment({
        amount,
        currency,
        provider,
        paymentMethod,
        userId: req.user.id,
        metadata: {
          ...metadata,
          userAgent: req.headers['user-agent'],
          ipAddress: req.ip
        }
      });

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Payment processing error:', error);
      res.status(500).json({
        success: false,
        error: 'Payment processing failed'
      });
    }
  }
);

/**
 * Get Payment Status
 */
router.get('/payments/:paymentId/status',
  generalLimiter,
  authenticateToken,
  [
    param('paymentId').isString().notEmpty().withMessage('Payment ID is required')
  ],
  async (req: any, res: any) => {
    try {
      const { paymentId } = req.params;
      const paymentService = req.app.locals.paymentGatewayService as PaymentGatewayService;

      const status = await paymentService.getPaymentStatus(paymentId);

      res.json({
        success: true,
        data: status
      });
    } catch (error) {
      console.error('Payment status error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get payment status'
      });
    }
  }
);

/**
 * Process Refund
 */
router.post('/payments/:paymentId/refund',
  generalLimiter,
  authenticateToken,
  requireRole(['admin', 'support']),
  [
    param('paymentId').isString().notEmpty().withMessage('Payment ID is required'),
    body('amount').optional().isFloat({ min: 0.01 }).withMessage('Refund amount must be greater than 0'),
    body('reason').notEmpty().withMessage('Refund reason is required')
  ],
  async (req: any, res: any) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { paymentId } = req.params;
      const { amount, reason } = req.body;
      const paymentService = req.app.locals.paymentGatewayService as PaymentGatewayService;

      const result = await paymentService.processRefund(paymentId, amount, reason);

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Refund processing error:', error);
      res.status(500).json({
        success: false,
        error: 'Refund processing failed'
      });
    }
  }
);

// ====================
// SMART CONTRACT ESCROW ROUTES
// ====================

/**
 * Create Escrow
 */
router.post('/escrow/create',
  generalLimiter,
  authenticateToken,
  [
    body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be greater than 0'),
    body('currency').isIn(['USD', 'BTC', 'ETH', 'USDC']).withMessage('Invalid currency'),
    body('buyerId').isString().notEmpty().withMessage('Buyer ID is required'),
    body('sellerId').isString().notEmpty().withMessage('Seller ID is required'),
    body('terms').isString().notEmpty().withMessage('Terms are required')
  ],
  async (req: any, res: any) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { amount, currency, buyerId, sellerId, terms, metadata } = req.body;
      const escrowService = req.app.locals.smartContractEscrowService as SmartContractEscrowService;

      const escrow = await escrowService.createEscrow({
        amount,
        currency,
        buyerId,
        sellerId,
        terms,
        metadata: {
          ...metadata,
          createdBy: req.user.id,
          ipAddress: req.ip
        }
      });

      res.json({
        success: true,
        data: escrow
      });
    } catch (error) {
      console.error('Escrow creation error:', error);
      res.status(500).json({
        success: false,
        error: 'Escrow creation failed'
      });
    }
  }
);

/**
 * Get Escrow Status
 */
router.get('/escrow/:escrowId',
  generalLimiter,
  authenticateToken,
  [
    param('escrowId').isString().notEmpty().withMessage('Escrow ID is required')
  ],
  async (req: any, res: any) => {
    try {
      const { escrowId } = req.params;
      const escrowService = req.app.locals.smartContractEscrowService as SmartContractEscrowService;

      const escrow = await escrowService.getEscrowStatus(escrowId);

      res.json({
        success: true,
        data: escrow
      });
    } catch (error) {
      console.error('Escrow status error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get escrow status'
      });
    }
  }
);

/**
 * Release Escrow Funds
 */
router.post('/escrow/:escrowId/release',
  generalLimiter,
  authenticateToken,
  [
    param('escrowId').isString().notEmpty().withMessage('Escrow ID is required'),
    body('releaseType').isIn(['full', 'partial']).withMessage('Invalid release type'),
    body('amount').optional().isFloat({ min: 0.01 }).withMessage('Amount must be greater than 0')
  ],
  async (req: any, res: any) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { escrowId } = req.params;
      const { releaseType, amount } = req.body;
      const escrowService = req.app.locals.smartContractEscrowService as SmartContractEscrowService;

      const result = await escrowService.releaseEscrowFunds(escrowId, releaseType === 'full' ? undefined : amount);

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Escrow release error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to release escrow funds'
      });
    }
  }
);

// ====================
// TRADING ANALYTICS ROUTES
// ====================

/**
 * Get Trading Analytics
 */
router.get('/analytics/trading',
  analyticsLimiter,
  authenticateToken,
  [
    query('period').isIn(['REAL_TIME', 'HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'])
      .withMessage('Invalid period')
  ],
  async (req: any, res: any) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const period = req.query.period as TimePeriod || TimePeriod.DAILY;
      const analyticsService = req.app.locals.tradingAnalyticsService as TradingAnalyticsService;

      const analytics = await analyticsService.getTradingAnalytics(period);

      res.json({
        success: true,
        data: analytics
      });
    } catch (error) {
      console.error('Trading analytics error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get trading analytics'
      });
    }
  }
);

/**
 * Get User Behavior Analytics
 */
router.get('/analytics/user-behavior',
  analyticsLimiter,
  authenticateToken,
  [
    query('period').isIn(['REAL_TIME', 'HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'])
      .withMessage('Invalid period'),
    query('userId').optional().isString().withMessage('User ID must be a string')
  ],
  async (req: any, res: any) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const period = req.query.period as TimePeriod || TimePeriod.DAILY;
      const userId = req.query.userId || req.user.id;
      const analyticsService = req.app.locals.tradingAnalyticsService as TradingAnalyticsService;

      // Only allow users to see their own analytics unless admin
      if (userId !== req.user.id && !req.user.roles.includes('admin')) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      const analytics = await analyticsService.getUserBehaviorAnalytics(period, userId);

      res.json({
        success: true,
        data: analytics
      });
    } catch (error) {
      console.error('User behavior analytics error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get user behavior analytics'
      });
    }
  }
);

/**
 * Get Revenue Analytics
 */
router.get('/analytics/revenue',
  analyticsLimiter,
  authenticateToken,
  requireRole(['admin', 'finance']),
  [
    query('period').isIn(['REAL_TIME', 'HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'])
      .withMessage('Invalid period')
  ],
  async (req: any, res: any) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const period = req.query.period as TimePeriod || TimePeriod.MONTHLY;
      const analyticsService = req.app.locals.tradingAnalyticsService as TradingAnalyticsService;

      const analytics = await analyticsService.getRevenueAnalytics(period);

      res.json({
        success: true,
        data: analytics
      });
    } catch (error) {
      console.error('Revenue analytics error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get revenue analytics'
      });
    }
  }
);

/**
 * Get Real-time Dashboard Metrics
 */
router.get('/analytics/dashboard',
  analyticsLimiter,
  authenticateToken,
  async (req: any, res: any) => {
    try {
      const analyticsService = req.app.locals.tradingAnalyticsService as TradingAnalyticsService;
      const metrics = analyticsService.getRealTimeDashboardMetrics();

      res.json({
        success: true,
        data: metrics
      });
    } catch (error) {
      console.error('Dashboard metrics error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get dashboard metrics'
      });
    }
  }
);

// ====================
// UI ENHANCEMENT ROUTES
// ====================

/**
 * Get UI Preferences
 */
router.get('/ui/preferences',
  generalLimiter,
  authenticateToken,
  async (req: any, res: any) => {
    try {
      const uiService = req.app.locals.uiEnhancementService as UIEnhancementService;
      const preferences = await uiService.getUserInterfacePreferences(req.user.id);

      res.json({
        success: true,
        data: preferences
      });
    } catch (error) {
      console.error('UI preferences error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get UI preferences'
      });
    }
  }
);

/**
 * Update UI Preferences
 */
router.put('/ui/preferences',
  generalLimiter,
  authenticateToken,
  [
    body('theme').optional().isIn(['LIGHT', 'DARK', 'AUTO', 'HIGH_CONTRAST']).withMessage('Invalid theme'),
    body('language').optional().isString().withMessage('Language must be a string'),
    body('currency').optional().isString().withMessage('Currency must be a string')
  ],
  async (req: any, res: any) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const uiService = req.app.locals.uiEnhancementService as UIEnhancementService;
      const preferences = await uiService.updateUserInterfacePreferences(req.user.id, req.body);

      res.json({
        success: true,
        data: preferences
      });
    } catch (error) {
      console.error('UI preferences update error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update UI preferences'
      });
    }
  }
);

/**
 * Send Notification
 */
router.post('/ui/notifications',
  generalLimiter,
  authenticateToken,
  requireRole(['admin', 'support']),
  [
    body('userId').isString().notEmpty().withMessage('User ID is required'),
    body('type').isIn(['TRADE_EXECUTED', 'PRICE_ALERT', 'MARKET_UPDATE', 'SECURITY_ALERT', 'SYSTEM_MAINTENANCE', 'PROMOTION', 'NEWS_UPDATE'])
      .withMessage('Invalid notification type'),
    body('title').isString().notEmpty().withMessage('Title is required'),
    body('message').isString().notEmpty().withMessage('Message is required'),
    body('priority').isIn(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).withMessage('Invalid priority')
  ],
  async (req: any, res: any) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { userId, type, title, message, priority, data } = req.body;
      const uiService = req.app.locals.uiEnhancementService as UIEnhancementService;

      await uiService.sendNotification({
        userId,
        type: type as NotificationType,
        title,
        message,
        priority,
        data
      });

      res.json({
        success: true,
        message: 'Notification sent successfully'
      });
    } catch (error) {
      console.error('Send notification error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to send notification'
      });
    }
  }
);

/**
 * Get User Notifications
 */
router.get('/ui/notifications',
  generalLimiter,
  authenticateToken,
  [
    query('unreadOnly').optional().isBoolean().withMessage('unreadOnly must be boolean'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be non-negative')
  ],
  async (req: any, res: any) => {
    try {
      const uiService = req.app.locals.uiEnhancementService as UIEnhancementService;
      const notifications = await uiService.getUserNotifications(req.user.id, {
        unreadOnly: req.query.unreadOnly === 'true',
        limit: parseInt(req.query.limit) || 50,
        offset: parseInt(req.query.offset) || 0
      });

      res.json({
        success: true,
        data: notifications
      });
    } catch (error) {
      console.error('Get notifications error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get notifications'
      });
    }
  }
);

// ====================
// AI RECOMMENDATION ROUTES
// ====================

/**
 * Get AI Trading Recommendations
 */
router.get('/ai/recommendations',
  aiLimiter,
  authenticateToken,
  [
    query('limit').optional().isInt({ min: 1, max: 20 }).withMessage('Limit must be between 1 and 20'),
    query('riskLevel').optional().isIn(['VERY_LOW', 'LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH']).withMessage('Invalid risk level'),
    query('tradingPairs').optional().isArray().withMessage('Trading pairs must be an array')
  ],
  async (req: any, res: any) => {
    try {
      const aiEngine = req.app.locals.aiRecommendationEngine as AIRecommendationEngine;
      
      const recommendations = await aiEngine.getTradingRecommendations(req.user.id, {
        limit: parseInt(req.query.limit) || 5,
        riskLevel: req.query.riskLevel as RiskLevel,
        tradingPairs: req.query.tradingPairs,
        activeOnly: true
      });

      res.json({
        success: true,
        data: recommendations
      });
    } catch (error) {
      console.error('AI recommendations error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get AI recommendations'
      });
    }
  }
);

/**
 * Get Portfolio Optimization
 */
router.get('/ai/portfolio-optimization',
  aiLimiter,
  authenticateToken,
  async (req: any, res: any) => {
    try {
      const aiEngine = req.app.locals.aiRecommendationEngine as AIRecommendationEngine;
      const optimization = await aiEngine.getPortfolioOptimization(req.user.id);

      res.json({
        success: true,
        data: optimization
      });
    } catch (error) {
      console.error('Portfolio optimization error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get portfolio optimization'
      });
    }
  }
);

/**
 * Get Market Analysis
 */
router.get('/ai/market-analysis/:tradingPair',
  aiLimiter,
  authenticateToken,
  [
    param('tradingPair').isString().notEmpty().withMessage('Trading pair is required')
  ],
  async (req: any, res: any) => {
    try {
      const { tradingPair } = req.params;
      const aiEngine = req.app.locals.aiRecommendationEngine as AIRecommendationEngine;
      
      const analysis = await aiEngine.getMarketAnalysis(tradingPair);

      res.json({
        success: true,
        data: analysis
      });
    } catch (error) {
      console.error('Market analysis error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get market analysis'
      });
    }
  }
);

/**
 * Execute AI Recommendation
 */
router.post('/ai/recommendations/:recommendationId/execute',
  generalLimiter,
  authenticateToken,
  [
    param('recommendationId').isString().notEmpty().withMessage('Recommendation ID is required'),
    body('quantity').optional().isFloat({ min: 0.001 }).withMessage('Quantity must be greater than 0'),
    body('price').optional().isFloat({ min: 0.01 }).withMessage('Price must be greater than 0')
  ],
  async (req: any, res: any) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { recommendationId } = req.params;
      const aiEngine = req.app.locals.aiRecommendationEngine as AIRecommendationEngine;

      const result = await aiEngine.executeRecommendation(req.user.id, recommendationId, req.body);

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Execute recommendation error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to execute recommendation'
      });
    }
  }
);

/**
 * Get Trading Profile
 */
router.get('/ai/trading-profile',
  generalLimiter,
  authenticateToken,
  async (req: any, res: any) => {
    try {
      const aiEngine = req.app.locals.aiRecommendationEngine as AIRecommendationEngine;
      const profile = await aiEngine.getUserTradingProfile(req.user.id);

      res.json({
        success: true,
        data: profile
      });
    } catch (error) {
      console.error('Trading profile error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get trading profile'
      });
    }
  }
);

/**
 * Get Model Performance
 */
router.get('/ai/model-performance',
  analyticsLimiter,
  authenticateToken,
  requireRole(['admin', 'analyst']),
  async (req: any, res: any) => {
    try {
      const aiEngine = req.app.locals.aiRecommendationEngine as AIRecommendationEngine;
      const performance = aiEngine.getModelPerformance();

      res.json({
        success: true,
        data: performance
      });
    } catch (error) {
      console.error('Model performance error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get model performance'
      });
    }
  }
);

// ====================
// ERROR HANDLING MIDDLEWARE
// ====================

router.use((error: any, req: any, res: any, next: any) => {
  console.error('Phase 3D API Error:', error);

  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  res.status(error.status || 500).json({
    success: false,
    error: isDevelopment ? error.message : 'Internal server error',
    ...(isDevelopment && { stack: error.stack })
  });
});

console.log('🚀 Phase 3D Advanced Features API Routes loaded');
export default router;
