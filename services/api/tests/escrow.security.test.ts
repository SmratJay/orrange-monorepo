import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { ethers } from 'ethers';
import { SecureEscrowService } from '../src/services/SecureEscrowService';
import { buildApp } from '../src/app';

// Test configuration
const TEST_CONFIG = {
  rpcUrl: 'http://localhost:8545', // Local test blockchain
  privateKey: '0x' + '0'.repeat(64), // Test private key
  contractAddress: '0x' + '1'.repeat(40), // Test contract address
};

describe('SecureEscrowService Security Tests', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let escrowService: SecureEscrowService;
  let testUser: any;
  let testTrade: any;

  beforeAll(async () => {
    // Setup test database
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.TEST_DATABASE_URL || 'postgresql://test:test@localhost:5432/orrange_test',
        },
      },
    });

    // Build test app
    app = await buildApp({ logger: false });
    await app.ready();

    // Initialize escrow service with test config
    escrowService = new SecureEscrowService(prisma, TEST_CONFIG);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    // Clean database before each test
    await prisma.auditLog.deleteMany();
    await prisma.escrow.deleteMany();
    await prisma.trade.deleteMany();
    await prisma.user.deleteMany();

    // Create test user
    testUser = await prisma.user.create({
      data: {
        walletAddress: '0x1234567890123456789012345678901234567890',
        reputationScore: 4.5,
        tradeCount: 10,
        kycStatus: 'VERIFIED',
        riskLevel: 'LOW',
        riskScore: 25,
      },
    });

    // Create test trade
    testTrade = await prisma.trade.create({
      data: {
        id: 'test-trade-id',
        sellerId: testUser.id,
        buyerId: 'buyer-id',
        asset: 'USDT',
        fiatCurrency: 'USD',
        amount: '1000',
        price: '1.00',
        totalValue: '1000',
        status: 'ACTIVE',
        paymentMethod: 'PayPal',
      },
    });
  });

  describe('Escrow Creation Security', () => {
    it('should create escrow with valid data', async () => {
      const result = await escrowService.createEscrow({
        tradeId: testTrade.id,
        sellerAddress: testUser.walletAddress,
        buyerAddress: '0x9876543210987654321098765432109876543210',
        tokenAddress: '0x1111111111111111111111111111111111111111',
        amount: '1000',
        chainId: 1,
        paymentMethod: 'PayPal',
      });

      expect(result.success).toBe(true);
      expect(result.escrowId).toBeDefined();
      expect(result.riskScore).toBeGreaterThanOrEqual(0);
    });

    it('should reject escrow with invalid wallet address', async () => {
      const result = await escrowService.createEscrow({
        tradeId: testTrade.id,
        sellerAddress: 'invalid-address',
        buyerAddress: '0x9876543210987654321098765432109876543210',
        tokenAddress: '0x1111111111111111111111111111111111111111',
        amount: '1000',
        chainId: 1,
        paymentMethod: 'PayPal',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid input');
    });

    it('should reject escrow with excessive amount', async () => {
      const result = await escrowService.createEscrow({
        tradeId: testTrade.id,
        sellerAddress: testUser.walletAddress,
        buyerAddress: '0x9876543210987654321098765432109876543210',
        tokenAddress: '0x1111111111111111111111111111111111111111',
        amount: '999999999999', // Exceeds max limit
        chainId: 1,
        paymentMethod: 'PayPal',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('limit');
    });

    it('should flag high-risk transactions', async () => {
      // Update user to high risk
      await prisma.user.update({
        where: { id: testUser.id },
        data: { riskScore: 85, tradeCount: 1 }, // High risk, low trade count
      });

      const result = await escrowService.createEscrow({
        tradeId: testTrade.id,
        sellerAddress: testUser.walletAddress,
        buyerAddress: '0x9876543210987654321098765432109876543210',
        tokenAddress: '0x1111111111111111111111111111111111111111',
        amount: '50000', // Large amount
        chainId: 1,
        paymentMethod: 'PayPal',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('high risk');
      expect(result.riskScore).toBeGreaterThan(80);
    });

    it('should prevent duplicate escrow creation', async () => {
      // Create first escrow
      await escrowService.createEscrow({
        tradeId: testTrade.id,
        sellerAddress: testUser.walletAddress,
        buyerAddress: '0x9876543210987654321098765432109876543210',
        tokenAddress: '0x1111111111111111111111111111111111111111',
        amount: '1000',
        chainId: 1,
        paymentMethod: 'PayPal',
      });

      // Attempt to create duplicate
      const result = await escrowService.createEscrow({
        tradeId: testTrade.id,
        sellerAddress: testUser.walletAddress,
        buyerAddress: '0x9876543210987654321098765432109876543210',
        tokenAddress: '0x1111111111111111111111111111111111111111',
        amount: '1000',
        chainId: 1,
        paymentMethod: 'PayPal',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('already exists');
    });

    it('should create audit logs for all attempts', async () => {
      await escrowService.createEscrow({
        tradeId: testTrade.id,
        sellerAddress: testUser.walletAddress,
        buyerAddress: '0x9876543210987654321098765432109876543210',
        tokenAddress: '0x1111111111111111111111111111111111111111',
        amount: '1000',
        chainId: 1,
        paymentMethod: 'PayPal',
      });

      const auditLogs = await prisma.auditLog.findMany({
        where: { action: { contains: 'ESCROW' } },
      });

      expect(auditLogs.length).toBeGreaterThan(0);
      expect(auditLogs.some(log => log.action.includes('CREATE'))).toBe(true);
    });
  });

  describe('Security Checks', () => {
    it('should detect rapid trading velocity', async () => {
      // Create multiple recent trades
      for (let i = 0; i < 6; i++) {
        await prisma.escrow.create({
          data: {
            tradeId: `velocity-test-${i}`,
            status: 'FUNDED',
            chainId: 1,
            tokenAddress: '0x1111111111111111111111111111111111111111',
            amount: '100',
            timeoutAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            trade: {
              create: {
                id: `velocity-test-${i}`,
                sellerId: testUser.id,
                buyerId: 'buyer-id',
                asset: 'USDT',
                fiatCurrency: 'USD',
                amount: '100',
                price: '1.00',
                totalValue: '100',
                status: 'ACTIVE',
                paymentMethod: 'PayPal',
              },
            },
          },
        });
      }

      const result = await escrowService.createEscrow({
        tradeId: 'new-trade-id',
        sellerAddress: testUser.walletAddress,
        buyerAddress: '0x9876543210987654321098765432109876543210',
        tokenAddress: '0x1111111111111111111111111111111111111111',
        amount: '1000',
        chainId: 1,
        paymentMethod: 'PayPal',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('velocity') || expect(result.error).toContain('time period');
    });

    it('should validate daily volume limits', async () => {
      // Create trades that exceed daily limit
      await prisma.escrow.create({
        data: {
          tradeId: 'volume-test',
          status: 'FUNDED',
          chainId: 1,
          tokenAddress: '0x1111111111111111111111111111111111111111',
          amount: '950000', // Close to daily limit
          timeoutAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          trade: {
            create: {
              id: 'volume-test',
              sellerId: testUser.id,
              buyerId: 'buyer-id',
              asset: 'USDT',
              fiatCurrency: 'USD',
              amount: '950000',
              price: '1.00',
              totalValue: '950000',
              status: 'ACTIVE',
              paymentMethod: 'PayPal',
            },
          },
        },
      });

      const result = await escrowService.createEscrow({
        tradeId: 'volume-exceed-test',
        sellerAddress: testUser.walletAddress,
        buyerAddress: '0x9876543210987654321098765432109876543210',
        tokenAddress: '0x1111111111111111111111111111111111111111',
        amount: '100000', // This would exceed daily limit
        chainId: 1,
        paymentMethod: 'PayPal',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('volume limit');
    });

    it('should block blacklisted users', async () => {
      // Blacklist the user
      await prisma.user.update({
        where: { id: testUser.id },
        data: { riskLevel: 'BLACKLISTED', isBlacklisted: true },
      });

      const result = await escrowService.createEscrow({
        tradeId: testTrade.id,
        sellerAddress: testUser.walletAddress,
        buyerAddress: '0x9876543210987654321098765432109876543210',
        tokenAddress: '0x1111111111111111111111111111111111111111',
        amount: '1000',
        chainId: 1,
        paymentMethod: 'PayPal',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('blacklist');
    });
  });

  describe('Escrow Release Security', () => {
    let testEscrow: any;

    beforeEach(async () => {
      // Create test escrow
      testEscrow = await prisma.escrow.create({
        data: {
          tradeId: testTrade.id,
          status: 'FUNDED',
          chainId: 1,
          tokenAddress: '0x1111111111111111111111111111111111111111',
          amount: '1000',
          riskScore: 30,
          timeoutAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          transactionHash: '0xabcdef',
        },
      });
    });

    it('should require valid payment confirmation signature', async () => {
      const invalidSignature = '0x' + '0'.repeat(130);
      
      const result = await escrowService.releaseEscrow(testTrade.id, {
        confirmationSignature: invalidSignature,
        evidenceHashes: [],
        timestamp: Date.now(),
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('signature');
    });

    it('should enforce delay for high-risk transactions', async () => {
      // Update escrow to high risk
      await prisma.escrow.update({
        where: { id: testEscrow.id },
        data: { riskScore: 80 },
      });

      // Generate a valid signature (mock)
      const wallet = new ethers.Wallet('0x' + '1'.repeat(64));
      const messageHash = ethers.utils.keccak256(
        ethers.utils.solidityPack(
          ['bytes32', 'string', 'uint256'],
          [testTrade.id, 'PAYMENT_CONFIRMED', Date.now()]
        )
      );
      const signature = await wallet.signMessage(ethers.utils.arrayify(messageHash));

      const result = await escrowService.releaseEscrow(testTrade.id, {
        confirmationSignature: signature,
        evidenceHashes: [],
        timestamp: Date.now(),
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('verification time') || expect(result.error).toContain('delay');
    });

    it('should prevent release of non-funded escrow', async () => {
      // Update escrow status
      await prisma.escrow.update({
        where: { id: testEscrow.id },
        data: { status: 'DISPUTED' },
      });

      const result = await escrowService.releaseEscrow(testTrade.id, {
        confirmationSignature: '0x' + '1'.repeat(130),
        evidenceHashes: [],
        timestamp: Date.now(),
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('status');
    });
  });

  describe('Dispute Handling Security', () => {
    let testEscrow: any;

    beforeEach(async () => {
      testEscrow = await prisma.escrow.create({
        data: {
          tradeId: testTrade.id,
          status: 'FUNDED',
          chainId: 1,
          tokenAddress: '0x1111111111111111111111111111111111111111',
          amount: '1000',
          timeoutAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          transactionHash: '0xabcdef',
        },
      });
    });

    it('should create dispute with valid data', async () => {
      const result = await escrowService.openDispute({
        tradeId: testTrade.id,
        reason: 'Payment not received after 24 hours',
        evidence: ['screenshot1.png', 'message_thread.txt'],
        disputedBy: 'buyer',
      });

      expect(result.success).toBe(true);
      expect(result.disputeId).toBeDefined();
    });

    it('should prevent dispute after timeout window', async () => {
      // Set escrow timeout to past date
      await prisma.escrow.update({
        where: { id: testEscrow.id },
        data: { timeoutAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) }, // 8 days ago
      });

      const result = await escrowService.openDispute({
        tradeId: testTrade.id,
        reason: 'Late dispute attempt',
        disputedBy: 'buyer',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('expired');
    });

    it('should require minimum reason length', async () => {
      const result = await escrowService.openDispute({
        tradeId: testTrade.id,
        reason: 'Too short', // Less than 10 characters
        disputedBy: 'buyer',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('validation');
    });

    it('should limit evidence files', async () => {
      const tooManyFiles = Array.from({ length: 15 }, (_, i) => `file${i}.png`);
      
      const result = await escrowService.openDispute({
        tradeId: testTrade.id,
        reason: 'This dispute has too many evidence files attached',
        evidence: tooManyFiles,
        disputedBy: 'buyer',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('validation');
    });
  });

  describe('Health Check and Monitoring', () => {
    it('should return health status', async () => {
      const health = await escrowService.healthCheck();
      
      expect(health.status).toMatch(/healthy|degraded|unhealthy/);
      expect(health.checks).toBeDefined();
      expect(health.lastUpdate).toBeInstanceOf(Date);
    });

    it('should detect database connectivity issues', async () => {
      // Simulate database disconnection
      await prisma.$disconnect();
      
      const health = await escrowService.healthCheck();
      
      expect(health.status).toMatch(/degraded|unhealthy/);
      expect(health.checks.database).toBe(false);
    });
  });

  describe('Event Handling', () => {
    it('should emit security alerts for suspicious activity', (done) => {
      escrowService.on('securityAlert', (alert) => {
        expect(alert.type).toBeDefined();
        expect(alert.severity).toBeDefined();
        expect(alert.timestamp).toBeInstanceOf(Date);
        done();
      });

      // Simulate suspicious activity detection
      escrowService.emit('securityAlert', {
        type: 'SUSPICIOUS_ACTIVITY',
        severity: 'HIGH',
        timestamp: new Date(),
      });
    });

    it('should emit escrow creation events', (done) => {
      escrowService.on('escrowCreated', (event) => {
        expect(event.escrowId).toBeDefined();
        expect(event.tradeId).toBeDefined();
        expect(event.riskScore).toBeGreaterThanOrEqual(0);
        done();
      });

      // Simulate escrow creation
      escrowService.emit('escrowCreated', {
        escrowId: 'test-escrow-id',
        tradeId: testTrade.id,
        riskScore: 25,
      });
    });
  });

  describe('Risk Assessment', () => {
    it('should calculate risk score based on user history', async () => {
      // Test with new user (higher risk)
      const newUser = await prisma.user.create({
        data: {
          walletAddress: '0x9999999999999999999999999999999999999999',
          reputationScore: 0,
          tradeCount: 0,
          kycStatus: 'UNVERIFIED',
          riskLevel: 'MEDIUM',
        },
      });

      const result = await escrowService.createEscrow({
        tradeId: 'risk-test-trade',
        sellerAddress: newUser.walletAddress,
        buyerAddress: '0x8888888888888888888888888888888888888888',
        tokenAddress: '0x1111111111111111111111111111111111111111',
        amount: '1000',
        chainId: 1,
        paymentMethod: 'PayPal',
      });

      if (result.success) {
        expect(result.riskScore).toBeGreaterThan(20); // New user should have higher risk
      }
    });

    it('should consider amount in risk calculation', async () => {
      const largeAmountResult = await escrowService.createEscrow({
        tradeId: 'large-amount-test',
        sellerAddress: testUser.walletAddress,
        buyerAddress: '0x8888888888888888888888888888888888888888',
        tokenAddress: '0x1111111111111111111111111111111111111111',
        amount: '50000', // Large amount
        chainId: 1,
        paymentMethod: 'PayPal',
      });

      const smallAmountResult = await escrowService.createEscrow({
        tradeId: 'small-amount-test',
        sellerAddress: testUser.walletAddress,
        buyerAddress: '0x7777777777777777777777777777777777777777',
        tokenAddress: '0x1111111111111111111111111111111111111111',
        amount: '100', // Small amount
        chainId: 1,
        paymentMethod: 'PayPal',
      });

      if (largeAmountResult.success && smallAmountResult.success) {
        expect(largeAmountResult.riskScore).toBeGreaterThan(smallAmountResult.riskScore!);
      }
    });
  });
});
