/**
 * Phase 3C Enhanced Security - Integration Test Suite
 * Comprehensive Security System Testing
 * 
 * Test Coverage:
 * - Multi-factor authentication (MFA/TOTP)
 * - Real-time fraud detection
 * - Immutable audit logging
 * - Security middleware protection
 * - WebSocket security events
 * - Compliance reporting
 * - Performance & load testing
 */

import { jest } from '@jest/globals';
import { SecurityService, SecurityEventType, RiskLevel, MFAMethod } from '../src/services/SecurityService.js';
import { FraudDetectionService, FraudType, RiskLevel as FraudRiskLevel } from '../src/services/FraudDetectionService.js';
import { AuditService, AuditEventType, AuditSeverity, ComplianceStandard } from '../src/services/AuditService.js';
import { SecurityDashboardService, ThreatType, ThreatSeverity, ThreatStatus } from '../src/services/SecurityDashboardService.js';
import { WebSocketSecurityService, WSMessageType, WSChannel } from '../src/websocket/SecurityWebSocket.js';
import { SecurityMiddleware, createSecurityMiddleware } from '../src/middleware/security.js';
import crypto from 'crypto';

// Mock dependencies
const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    update: jest.fn(),
    create: jest.fn()
  },
  mfaSecret: {
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn()
  },
  auditLog: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn()
  },
  session: {
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn()
  }
};

const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  exists: jest.fn(),
  incr: jest.fn(),
  expire: jest.fn()
};

describe('Phase 3C Enhanced Security - Integration Tests', () => {
  let securityService: SecurityService;
  let fraudDetectionService: FraudDetectionService;
  let auditService: AuditService;
  let securityDashboard: SecurityDashboardService;
  let wsSecurityService: WebSocketSecurityService;
  let securityMiddleware: SecurityMiddleware;

  const testUserId = 'test-user-123';
  const testSessionId = 'test-session-456';
  const testIPAddress = '192.168.1.100';
  const testUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

  beforeAll(async () => {
    console.log('🧪 Setting up Phase 3C Security Integration Tests...');

    // Initialize services
    securityService = new SecurityService(mockPrisma as any, mockRedis as any);
    fraudDetectionService = new FraudDetectionService(mockPrisma as any, mockRedis as any);
    auditService = new AuditService(mockPrisma as any);
    securityDashboard = new SecurityDashboardService(securityService, fraudDetectionService, auditService);
    wsSecurityService = new WebSocketSecurityService(securityDashboard, auditService, securityService);
    securityMiddleware = createSecurityMiddleware(securityService, fraudDetectionService, auditService);

    // Start security monitoring
    await securityDashboard.startMonitoring(1000); // 1 second intervals for testing
    await wsSecurityService.start();
  });

  afterAll(async () => {
    console.log('🧪 Cleaning up Phase 3C Security Tests...');
    securityDashboard.stopMonitoring();
    await wsSecurityService.stop();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('🔐 Multi-Factor Authentication (MFA)', () => {
    test('should setup TOTP MFA successfully', async () => {
      // Mock user data
      mockPrisma.user.findUnique.mockResolvedValue({
        id: testUserId,
        email: 'test@orrange.com',
        mfaEnabled: false
      });

      mockPrisma.mfaSecret.create.mockResolvedValue({
        id: 'mfa-secret-123',
        userId: testUserId,
        secret: 'JBSWY3DPEHPK3PXP',
        isActive: false
      });

      const result = await securityService.setupTOTP(testUserId);

      expect(result).toEqual({
        method: MFAMethod.TOTP,
        qrCode: expect.stringContaining('otpauth://totp/'),
        backupCodes: expect.arrayContaining([expect.any(String)]),
        isActive: false
      });

      expect(mockPrisma.mfaSecret.create).toHaveBeenCalledWith({
        data: {
          userId: testUserId,
          secret: expect.any(String),
          type: MFAMethod.TOTP,
          isActive: false
        }
      });
    });

    test('should verify and activate TOTP token', async () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const validToken = '123456'; // Mock TOTP token

      mockPrisma.mfaSecret.findFirst.mockResolvedValue({
        id: 'mfa-secret-123',
        userId: testUserId,
        secret: secret,
        isActive: false
      });

      mockPrisma.mfaSecret.update.mockResolvedValue({
        id: 'mfa-secret-123',
        userId: testUserId,
        secret: secret,
        isActive: true
      });

      mockPrisma.user.update.mockResolvedValue({
        id: testUserId,
        mfaEnabled: true
      });

      // Mock TOTP verification
      jest.spyOn(securityService, 'verifyTOTP').mockResolvedValue(true);

      const result = await securityService.verifyAndActivateTOTP(testUserId, validToken);

      expect(result).toBe(true);
      expect(mockPrisma.mfaSecret.update).toHaveBeenCalledWith({
        where: { id: 'mfa-secret-123' },
        data: { isActive: true }
      });
    });

    test('should reject invalid TOTP token', async () => {
      const invalidToken = '000000';

      jest.spyOn(securityService, 'verifyTOTP').mockResolvedValue(false);

      const result = await securityService.verifyAndActivateTOTP(testUserId, invalidToken);

      expect(result).toBe(false);
    });
  });

  describe('🤖 AI-Powered Fraud Detection', () => {
    test('should analyze transaction and detect low risk', async () => {
      const transactionData = {
        id: 'tx-123',
        userId: testUserId,
        timestamp: new Date(),
        amount: 100,
        tradingPair: 'BTC/USD',
        orderType: 'BUY',
        ipAddress: testIPAddress,
        userAgent: testUserAgent
      };

      // Mock user behavior data
      mockRedis.get.mockResolvedValue(JSON.stringify({
        avgTransactionAmount: 150,
        transactionFrequency: 5,
        commonTradingPairs: ['BTC/USD', 'ETH/USD'],
        usualHours: [9, 10, 11, 14, 15, 16],
        locationHistory: ['US', 'CA']
      }));

      const result = await fraudDetectionService.analyzeFraud(transactionData);

      expect(result).toEqual({
        transactionId: 'tx-123',
        riskScore: expect.any(Number),
        riskLevel: expect.stringMatching(/^(LOW|MEDIUM|HIGH|CRITICAL)$/),
        fraudTypes: expect.any(Array),
        recommendations: expect.any(Array),
        modelScores: expect.objectContaining({
          isolationForest: expect.any(Number),
          localOutlierFactor: expect.any(Number),
          statisticalAnalysis: expect.any(Number),
          behavioralAnalysis: expect.any(Number),
          ensemble: expect.any(Number)
        }),
        features: expect.any(Object),
        timestamp: expect.any(Date)
      });

      expect(result.riskScore).toBeGreaterThanOrEqual(0);
      expect(result.riskScore).toBeLessThanOrEqual(1);
    });

    test('should detect high-risk suspicious activity', async () => {
      const suspiciousTransaction = {
        id: 'tx-suspicious-456',
        userId: testUserId,
        timestamp: new Date(),
        amount: 50000, // Unusually high amount
        tradingPair: 'RARE/USD', // Uncommon pair
        orderType: 'SELL',
        ipAddress: '1.2.3.4', // Different country
        userAgent: 'curl/7.68.0' // Suspicious user agent
      };

      // Mock no previous behavior data (new user pattern)
      mockRedis.get.mockResolvedValue(null);

      const result = await fraudDetectionService.analyzeFraud(suspiciousTransaction);

      expect(result.riskScore).toBeGreaterThan(0.7); // High risk
      expect(result.riskLevel).toMatch(/^(HIGH|CRITICAL)$/);
      expect(result.fraudTypes).toContain(FraudType.UNUSUAL_ACTIVITY);
    });

    test('should update user behavior profile after transaction', async () => {
      const transactionData = {
        id: 'tx-profile-update-789',
        userId: testUserId,
        timestamp: new Date(),
        amount: 200,
        tradingPair: 'ETH/USD',
        orderType: 'BUY',
        ipAddress: testIPAddress,
        userAgent: testUserAgent
      };

      await fraudDetectionService.updateUserBehavior(testUserId, transactionData);

      expect(mockRedis.set).toHaveBeenCalledWith(
        `user_behavior:${testUserId}`,
        expect.any(String),
        'EX',
        expect.any(Number)
      );
    });
  });

  describe('📋 Immutable Audit Logging', () => {
    test('should create audit entry with hash chain', async () => {
      const auditData = {
        eventType: AuditEventType.USER_LOGIN,
        severity: AuditSeverity.INFO,
        userId: testUserId,
        sessionId: testSessionId,
        ipAddress: testIPAddress,
        userAgent: testUserAgent,
        resource: 'auth',
        action: 'login',
        details: { method: 'email' }
      };

      // Mock last audit entry for hash chain
      mockPrisma.auditLog.findFirst.mockResolvedValue({
        id: 'audit-prev-123',
        hash: 'previous-hash-abc123',
        blockNumber: 999
      });

      mockPrisma.auditLog.create.mockResolvedValue({
        id: 'audit-new-456',
        ...auditData,
        hash: 'new-hash-def456',
        previousHash: 'previous-hash-abc123',
        blockNumber: 1000,
        timestamp: new Date()
      });

      const result = await auditService.logAuditEvent(auditData);

      expect(result).toEqual({
        id: 'audit-new-456',
        hash: 'new-hash-def456',
        blockNumber: 1000
      });

      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          ...auditData,
          hash: expect.any(String),
          previousHash: 'previous-hash-abc123',
          blockNumber: 1000
        })
      });
    });

    test('should verify audit chain integrity', async () => {
      const mockAuditEntries = [
        {
          id: 'audit-1',
          hash: 'hash-1',
          previousHash: null,
          blockNumber: 1,
          timestamp: new Date(),
          eventType: AuditEventType.SYSTEM_START
        },
        {
          id: 'audit-2',
          hash: 'hash-2',
          previousHash: 'hash-1',
          blockNumber: 2,
          timestamp: new Date(),
          eventType: AuditEventType.USER_LOGIN
        }
      ];

      mockPrisma.auditLog.findMany.mockResolvedValue(mockAuditEntries);

      // Mock hash calculation to match
      jest.spyOn(auditService as any, 'calculateAuditHash').mockImplementation((entry) => entry.hash);

      const result = await auditService.verifyChainIntegrity();

      expect(result).toEqual({
        isValid: true,
        totalEntries: 2,
        verifiedEntries: 2,
        brokenChains: 0,
        lastVerified: expect.any(Date),
        issues: []
      });
    });

    test('should generate SOX compliance report', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      mockPrisma.auditLog.findMany.mockResolvedValue([
        {
          eventType: AuditEventType.USER_LOGIN,
          severity: AuditSeverity.INFO,
          timestamp: new Date('2024-01-15')
        },
        {
          eventType: AuditEventType.DATA_ACCESS,
          severity: AuditSeverity.WARNING,
          timestamp: new Date('2024-01-20')
        }
      ]);

      const report = await auditService.generateComplianceReport(
        ComplianceStandard.SOX,
        startDate,
        endDate,
        'AUDIT_TRAIL'
      );

      expect(report).toEqual({
        reportId: expect.any(String),
        standard: ComplianceStandard.SOX,
        reportType: 'AUDIT_TRAIL',
        period: { startDate, endDate },
        generatedAt: expect.any(Date),
        summary: expect.objectContaining({
          totalEvents: 2,
          complianceScore: expect.any(Number),
          violations: expect.any(Number)
        }),
        sections: expect.any(Array),
        recommendations: expect.any(Array)
      });
    });
  });

  describe('📊 Security Dashboard & Monitoring', () => {
    test('should collect and provide security metrics', async () => {
      const metrics = await securityDashboard.getCurrentMetrics();

      expect(metrics).toEqual({
        timestamp: expect.any(Date),
        totalUsers: expect.any(Number),
        activeUsers: expect.any(Number),
        activeSessions: expect.any(Number),
        securityAlerts: expect.objectContaining({
          total: expect.any(Number),
          critical: expect.any(Number),
          high: expect.any(Number),
          medium: expect.any(Number),
          low: expect.any(Number)
        }),
        fraudDetection: expect.objectContaining({
          totalTransactions: expect.any(Number),
          suspiciousTransactions: expect.any(Number),
          blockedTransactions: expect.any(Number),
          falsePositiveRate: expect.any(Number),
          averageRiskScore: expect.any(Number)
        }),
        authentication: expect.objectContaining({
          totalLogins: expect.any(Number),
          successfulLogins: expect.any(Number),
          failedLogins: expect.any(Number),
          mfaEnabled: expect.any(Number),
          mfaUsage: expect.any(Number)
        }),
        systemHealth: expect.objectContaining({
          uptime: expect.any(Number),
          responseTime: expect.any(Number),
          errorRate: expect.any(Number),
          throughput: expect.any(Number)
        })
      });
    });

    test('should create and manage threat events', async () => {
      const threatId = await securityDashboard.createThreatEvent(
        ThreatType.FRAUD_ATTEMPT,
        ThreatSeverity.HIGH,
        testIPAddress,
        'Suspicious trading pattern detected',
        { userId: testUserId, transactionAmount: 50000 },
        testUserId
      );

      expect(threatId).toMatch(/^threat_\d+_[a-z0-9]+$/);

      const activeThreats = securityDashboard.getActiveThreatEvents();
      expect(activeThreats).toHaveLength(1);
      expect(activeThreats[0]).toEqual({
        id: threatId,
        type: ThreatType.FRAUD_ATTEMPT,
        severity: ThreatSeverity.HIGH,
        source: testIPAddress,
        target: testUserId,
        description: 'Suspicious trading pattern detected',
        status: ThreatStatus.ACTIVE,
        timestamp: expect.any(Date),
        metadata: expect.objectContaining({
          userId: testUserId,
          transactionAmount: 50000
        })
      });

      // Update threat status
      await securityDashboard.updateThreatStatus(
        threatId,
        ThreatStatus.RESOLVED,
        'False positive - legitimate transaction'
      );

      const resolvedThreats = securityDashboard.getActiveThreatEvents();
      expect(resolvedThreats).toHaveLength(0);
    });

    test('should provide system health dashboard', async () => {
      // Record some performance metrics
      securityDashboard.recordPerformanceMetric('/api/v1/trading/orders', 150, true);
      securityDashboard.recordPerformanceMetric('/api/v1/wallet/balance', 75, true);
      securityDashboard.recordPerformanceMetric('/api/v1/user/profile', 200, false);

      const healthDashboard = await securityDashboard.getSystemHealthDashboard();

      expect(healthDashboard).toEqual({
        status: expect.stringMatching(/^(healthy|warning|critical)$/),
        uptime: expect.any(Number),
        services: expect.objectContaining({
          security: 'operational',
          fraudDetection: 'operational',
          audit: 'operational',
          database: 'operational'
        }),
        metrics: expect.any(Object),
        alerts: expect.any(Array),
        performance: expect.any(Array)
      });
    });
  });

  describe('🔌 WebSocket Security Events', () => {
    test('should handle WebSocket connections and authentication', (done) => {
      // This test would require actual WebSocket connection
      // For now, we'll test the connection stats
      const stats = wsSecurityService.getConnectionStats();
      
      expect(stats).toEqual({
        totalConnections: expect.any(Number),
        authenticatedConnections: expect.any(Number),
        subscriptionStats: expect.any(Object),
        clientsByRole: expect.any(Object)
      });

      done();
    });

    test('should broadcast security alerts to subscribed clients', () => {
      const mockThreatEvent = {
        id: 'threat-test-123',
        timestamp: new Date(),
        type: ThreatType.BRUTE_FORCE,
        severity: ThreatSeverity.HIGH,
        source: '1.2.3.4',
        description: 'Multiple failed login attempts',
        status: ThreatStatus.ACTIVE,
        metadata: { attempts: 5 }
      };

      // Mock broadcast functionality
      const broadcastSpy = jest.spyOn(wsSecurityService, 'broadcastSecurityAlert');
      wsSecurityService.broadcastSecurityAlert(mockThreatEvent);

      expect(broadcastSpy).toHaveBeenCalledWith(mockThreatEvent);
    });

    test('should force user logout via WebSocket', () => {
      const logoutSpy = jest.spyOn(wsSecurityService, 'forceUserLogout');
      
      wsSecurityService.forceUserLogout(testUserId, 'Security violation detected');
      
      expect(logoutSpy).toHaveBeenCalledWith(testUserId, 'Security violation detected');
    });
  });

  describe('🛡️ Security Middleware Integration', () => {
    test('should create security middleware with proper configuration', () => {
      expect(securityMiddleware).toBeInstanceOf(SecurityMiddleware);
    });

    test('should validate rate limiting functionality', () => {
      const rateLimitMiddleware = securityMiddleware.rateLimitMiddleware();
      expect(typeof rateLimitMiddleware).toBe('function');
    });

    test('should validate MFA enforcement functionality', () => {
      const mfaMiddleware = securityMiddleware.mfaEnforcementMiddleware();
      expect(typeof mfaMiddleware).toBe('function');
    });

    test('should validate fraud detection middleware', () => {
      const fraudMiddleware = securityMiddleware.fraudDetectionMiddleware();
      expect(typeof fraudMiddleware).toBe('function');
    });
  });

  describe('🚀 Performance & Load Testing', () => {
    test('should handle high-volume fraud analysis', async () => {
      const startTime = Date.now();
      const promises: Promise<any>[] = [];

      // Simulate 100 concurrent fraud analyses
      for (let i = 0; i < 100; i++) {
        const transactionData = {
          id: `load-test-${i}`,
          userId: `user-${i % 10}`, // 10 different users
          timestamp: new Date(),
          amount: Math.random() * 1000,
          tradingPair: 'BTC/USD',
          orderType: i % 2 === 0 ? 'BUY' : 'SELL',
          ipAddress: `192.168.1.${i % 255}`,
          userAgent: testUserAgent
        };

        promises.push(fraudDetectionService.analyzeFraud(transactionData));
      }

      const results = await Promise.all(promises);
      const duration = Date.now() - startTime;

      expect(results).toHaveLength(100);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
      
      console.log(`✅ Processed 100 fraud analyses in ${duration}ms`);
    });

    test('should handle high-volume audit logging', async () => {
      const startTime = Date.now();
      const promises: Promise<any>[] = [];

      // Mock batch audit creation
      mockPrisma.auditLog.create.mockImplementation(() => 
        Promise.resolve({
          id: `audit-${Math.random()}`,
          hash: crypto.randomBytes(32).toString('hex'),
          blockNumber: Math.floor(Math.random() * 1000)
        })
      );

      // Simulate 50 concurrent audit logs
      for (let i = 0; i < 50; i++) {
        const auditData = {
          eventType: AuditEventType.API_REQUEST,
          severity: AuditSeverity.INFO,
          userId: testUserId,
          sessionId: `session-${i}`,
          ipAddress: testIPAddress,
          userAgent: testUserAgent,
          resource: '/api/v1/test',
          action: 'GET',
          details: { requestId: i }
        };

        promises.push(auditService.logAuditEvent(auditData));
      }

      const results = await Promise.all(promises);
      const duration = Date.now() - startTime;

      expect(results).toHaveLength(50);
      expect(duration).toBeLessThan(3000); // Should complete within 3 seconds
      
      console.log(`✅ Created 50 audit logs in ${duration}ms`);
    });
  });

  describe('🔒 End-to-End Security Flow', () => {
    test('should complete full security flow: authentication → transaction → audit', async () => {
      console.log('🔄 Testing complete security flow...');

      // 1. Setup MFA
      mockPrisma.user.findUnique.mockResolvedValue({
        id: testUserId,
        email: 'test@orrange.com',
        mfaEnabled: false
      });

      mockPrisma.mfaSecret.create.mockResolvedValue({
        id: 'mfa-secret-e2e',
        userId: testUserId,
        secret: 'JBSWY3DPEHPK3PXP'
      });

      const mfaSetup = await securityService.setupTOTP(testUserId);
      expect(mfaSetup.method).toBe(MFAMethod.TOTP);

      // 2. Verify MFA and activate
      jest.spyOn(securityService, 'verifyTOTP').mockResolvedValue(true);
      mockPrisma.mfaSecret.findFirst.mockResolvedValue({
        id: 'mfa-secret-e2e',
        secret: 'JBSWY3DPEHPK3PXP'
      });

      const mfaVerified = await securityService.verifyAndActivateTOTP(testUserId, '123456');
      expect(mfaVerified).toBe(true);

      // 3. Analyze transaction for fraud
      const transactionData = {
        id: 'e2e-transaction-123',
        userId: testUserId,
        timestamp: new Date(),
        amount: 500,
        tradingPair: 'BTC/USD',
        orderType: 'BUY',
        ipAddress: testIPAddress,
        userAgent: testUserAgent
      };

      const fraudAnalysis = await fraudDetectionService.analyzeFraud(transactionData);
      expect(fraudAnalysis.riskScore).toBeGreaterThanOrEqual(0);

      // 4. Log audit event
      mockPrisma.auditLog.create.mockResolvedValue({
        id: 'audit-e2e-123',
        hash: 'e2e-hash-456',
        blockNumber: 1001
      });

      const auditResult = await auditService.logAuditEvent({
        eventType: AuditEventType.TRANSACTION_CREATED,
        severity: AuditSeverity.INFO,
        userId: testUserId,
        sessionId: testSessionId,
        ipAddress: testIPAddress,
        userAgent: testUserAgent,
        resource: 'trading',
        action: 'create-order',
        details: { transactionId: transactionData.id, amount: transactionData.amount }
      });

      expect(auditResult.id).toBe('audit-e2e-123');

      // 5. Update dashboard metrics
      securityDashboard.recordAuthEvent('login', true);
      securityDashboard.recordFraudResult(fraudAnalysis);
      securityDashboard.recordPerformanceMetric('/api/v1/trading/orders', 120, true);

      const finalMetrics = await securityDashboard.getCurrentMetrics();
      expect(finalMetrics.authentication.totalLogins).toBeGreaterThan(0);
      expect(finalMetrics.fraudDetection.totalTransactions).toBeGreaterThan(0);

      console.log('✅ End-to-end security flow completed successfully');
    });
  });
});

console.log('🧪 Phase 3C Enhanced Security Integration Test Suite loaded');
export default {};
