import { PrismaClient, P2PTradeStatus, P2PEscrowStatus, P2PDisputeStatus } from '@prisma/client';
import { ethers } from 'ethers';
import { EventEmitter } from 'events';
import * as winston from 'winston';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import Decimal from 'decimal.js';

// Security validation schemas
const CreateEscrowSchema = z.object({
  tradeId: z.string().min(1),
  sellerAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  buyerAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  tokenAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  amount: z.string().refine((val) => {
    try {
      const decimal = new Decimal(val);
      return decimal.gt(0) && decimal.lt('1000000000'); // Max 1B tokens
    } catch {
      return false;
    }
  }),
  chainId: z.number().positive(),
  paymentMethod: z.string().min(1),
  timeoutHours: z.number().min(1).max(168).default(24), // 1 hour to 7 days
});

const DisputeSchema = z.object({
  tradeId: z.string().min(1),
  reason: z.string().min(10).max(1000),
  evidence: z.array(z.string()).optional(),
  disputedBy: z.enum(['seller', 'buyer']),
});

// Security configuration
interface SecurityConfig {
  maxDailyVolume: Decimal;
  maxSingleTrade: Decimal;
  minConfirmations: number;
  riskAssessmentEnabled: boolean;
  multisigRequired: boolean;
  emergencyContactDelay: number;
  auditLogRetention: number;
}

interface RiskFactors {
  userAge: number; // Account age in days
  tradeHistory: number; // Previous successful trades
  reputationScore: number; // 0-100 scale
  volumeHistory: Decimal; // Historical volume
  disputeRatio: number; // Disputes / Total trades
  kycStatus: boolean;
}

export class SecureEscrowService extends EventEmitter {
  private prisma: PrismaClient;
  private logger: winston.Logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [new winston.transports.Console()]
  });
  private securityConfig: SecurityConfig = {};
  private contractAddress: string = '';
  private provider: any;
  private wallet: any;
  private contract: any;

  constructor(prisma: PrismaClient, config: any) {
    super();
    this.prisma = prisma;
    this.setupLogger();
    this.initializeSecurityConfig();
    this.initializeBlockchain(config);
    this.setupEventListeners();
  }

  private setupLogger() {
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { service: 'escrow-service' },
      transports: [
        new winston.transports.File({ filename: 'logs/escrow-error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/escrow-combined.log' }),
        new winston.transports.Console({
          format: winston.format.simple()
        })
      ],
    });
  }

  private initializeSecurityConfig() {
    this.securityConfig = {
      maxDailyVolume: new Decimal(process.env.MAX_DAILY_VOLUME || '1000000'),
      maxSingleTrade: new Decimal(process.env.MAX_SINGLE_TRADE || '100000'),
      minConfirmations: parseInt(process.env.MIN_CONFIRMATIONS || '3'),
      riskAssessmentEnabled: process.env.RISK_ASSESSMENT_ENABLED !== 'false',
      multisigRequired: process.env.MULTISIG_REQUIRED === 'true',
      emergencyContactDelay: parseInt(process.env.EMERGENCY_DELAY_MS || '300000'), // 5 minutes
      auditLogRetention: parseInt(process.env.AUDIT_RETENTION_DAYS || '2555'), // 7 years
    };
  }

  private initializeBlockchain(config: any) {
    try {
      this.provider = new (ethers as any).JsonRpcProvider(config.rpcUrl);
      this.wallet = new ethers.Wallet(config.privateKey || 'dummy', this.provider);
      this.contractAddress = config.contractAddress;
      
      // Load contract ABI (would be imported in real implementation)
      const contractABI: any[] = []; // Contract ABI would be loaded here
      this.contract = new ethers.Contract(this.contractAddress, contractABI, this.wallet);
    } catch (e) {
      console.warn('Failed to initialize blockchain:', e);
    }
  }

  private setupEventListeners() {
    // Listen for blockchain events
    this.contract.on('TradeCreated', this.handleTradeCreatedEvent.bind(this));
    this.contract.on('TradeCompleted', this.handleTradeCompletedEvent.bind(this));
    this.contract.on('TradeDisputed', this.handleTradeDisputedEvent.bind(this));
    this.contract.on('SuspiciousActivityDetected', this.handleSuspiciousActivity.bind(this));
  }

  /**
   * Create escrow with comprehensive security checks
   */
  async createEscrow(data: z.infer<typeof CreateEscrowSchema>): Promise<{
    success: boolean;
    escrowId?: string;
    error?: string;
    riskScore?: number;
  }> {
    const requestId = nanoid();
    
    try {
      // Validate input
      const validatedData = CreateEscrowSchema.parse(data);
      
      this.logger.info('Creating escrow', {
        requestId,
        tradeId: validatedData.tradeId,
        sellerAddress: validatedData.sellerAddress,
        amount: validatedData.amount,
      });

      // Security checks
      const securityChecks = await this.performSecurityChecks(validatedData);
      if (!securityChecks.passed) {
        this.logger.warn('Security checks failed', {
          requestId,
          tradeId: validatedData.tradeId,
          reasons: securityChecks.reasons,
        });
        return { success: false, error: 'Security checks failed: ' + securityChecks.reasons.join(', ') };
      }

      // Risk assessment
      let riskScore = 0;
      if (this.securityConfig.riskAssessmentEnabled) {
        riskScore = await this.assessRisk(validatedData);
        if (riskScore > 80) {
          this.logger.error('High risk transaction blocked', {
            requestId,
            tradeId: validatedData.tradeId,
            riskScore,
          });
          return { success: false, error: 'Transaction flagged as high risk', riskScore };
        }
      }

      // Check if trade already has escrow
      const existingEscrow = await this.prisma.escrow.findUnique({
        where: { tradeId: validatedData.tradeId }
      });

      if (existingEscrow) {
        this.logger.warn('Escrow already exists', {
          requestId,
          tradeId: validatedData.tradeId,
          existingStatus: existingEscrow.status,
        });
        return { success: false, error: 'Escrow already exists for this trade' };
      }

      // Create database record first (for atomic operations)
      const escrow = await this.prisma.escrow.create({
        data: {
          tradeId: validatedData.tradeId,
          status: EscrowStatus.INITIATED,
          chainId: validatedData.chainId,
          tokenAddress: validatedData.tokenAddress,
          amount: validatedData.amount,
          timeoutAt: new Date(Date.now() + validatedData.timeoutHours * 60 * 60 * 1000),
          riskScore,
          securityFlags: securityChecks.flags,
        }
      });

      // Create blockchain escrow
      const nonce = await this.generateSecureNonce();
      const paymentHash = ethers.utils.keccak256(
        ethers.utils.toUtf8Bytes(data.paymentMethod + validatedData.tradeId)
      );

      // Generate seller signature for contract
      const messageHash = ethers.utils.keccak256(
        ethers.utils.solidityPack(
          ['bytes32', 'address', 'address', 'uint256', 'uint256', 'uint256'],
          [validatedData.tradeId, validatedData.buyerAddress, validatedData.tokenAddress, 
           ethers.utils.parseEther(validatedData.amount), nonce, validatedData.chainId]
        )
      );

      const signature = await this.wallet.signMessage(ethers.utils.arrayify(messageHash));

      // Call smart contract
      const tx = await this.contract.createTrade(
        validatedData.tradeId,
        validatedData.buyerAddress,
        validatedData.tokenAddress,
        ethers.utils.parseEther(validatedData.amount),
        validatedData.timeoutHours * 3600, // Convert to seconds
        paymentHash,
        signature,
        nonce,
        riskScore > 50 // Require KYC for higher risk trades
      );

      // Wait for confirmation
      const receipt = await tx.wait(this.securityConfig.minConfirmations);

      // Update database with transaction hash
      await this.prisma.escrow.update({
        where: { id: escrow.id },
        data: {
          transactionHash: receipt.transactionHash,
          status: EscrowStatus.FUNDED,
          blockNumber: receipt.blockNumber,
        }
      });

      // Update trade status
      await this.prisma.trade.update({
        where: { id: validatedData.tradeId },
        data: { status: TradeStatus.ESCROWED }
      });

      // Log successful creation
      this.logger.info('Escrow created successfully', {
        requestId,
        tradeId: validatedData.tradeId,
        escrowId: escrow.id,
        transactionHash: receipt.transactionHash,
        riskScore,
      });

      // Emit event
      this.emit('escrowCreated', {
        escrowId: escrow.id,
        tradeId: validatedData.tradeId,
        riskScore,
      });

      return { success: true, escrowId: escrow.id, riskScore };

    } catch (error) {
      this.logger.error('Failed to create escrow', {
        requestId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        data,
      });

      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      };
    }
  }

  /**
   * Release escrow with payment confirmation
   */
  async releaseEscrow(tradeId: string, paymentProof: {
    confirmationSignature: string;
    evidenceHashes: string[];
    timestamp: number;
  }): Promise<{ success: boolean; error?: string }> {
    const requestId = nanoid();

    try {
      this.logger.info('Releasing escrow', { requestId, tradeId });

      // Get escrow details
      const escrow = await this.prisma.escrow.findUnique({
        where: { tradeId },
        include: { trade: true }
      });

      if (!escrow) {
        return { success: false, error: 'Escrow not found' };
      }

      if (escrow.status !== EscrowStatus.FUNDED) {
        return { success: false, error: `Invalid escrow status: ${escrow.status}` };
      }

      // Verify payment confirmation signature
      const messageHash = ethers.utils.keccak256(
        ethers.utils.solidityPack(
          ['bytes32', 'string', 'uint256'],
          [tradeId, 'PAYMENT_CONFIRMED', paymentProof.timestamp]
        )
      );

      const recoveredAddress = ethers.utils.verifyMessage(
        ethers.utils.arrayify(messageHash),
        paymentProof.confirmationSignature
      );

      if (recoveredAddress.toLowerCase() !== escrow.trade.buyerId.toLowerCase()) {
        this.logger.warn('Invalid payment confirmation signature', {
          requestId,
          tradeId,
          expected: escrow.trade.buyerId,
          recovered: recoveredAddress,
        });
        return { success: false, error: 'Invalid payment confirmation signature' };
      }

      // Additional delay for high-risk transactions
      if (escrow.riskScore > 70) {
        const releaseDelay = 2 * 60 * 60 * 1000; // 2 hours for high-risk
        const earliestRelease = new Date(escrow.updatedAt.getTime() + releaseDelay);
        
        if (new Date() < earliestRelease) {
          return { 
            success: false, 
            error: `High-risk transaction requires additional verification time. Can release after ${earliestRelease.toISOString()}` 
          };
        }
      }

      // Call smart contract to release
      const tx = await this.contract.completeTrade(tradeId, paymentProof.confirmationSignature);
      const receipt = await tx.wait(this.securityConfig.minConfirmations);

      // Update database
      await this.prisma.$transaction(async (tx) => {
        await tx.escrow.update({
          where: { id: escrow.id },
          data: {
            status: EscrowStatus.RELEASED,
            releasedAt: new Date(),
            releaseTransactionHash: receipt.transactionHash,
            paymentProof: paymentProof,
          }
        });

        await tx.trade.update({
          where: { id: tradeId },
          data: { status: TradeStatus.COMPLETED }
        });
      });

      this.logger.info('Escrow released successfully', {
        requestId,
        tradeId,
        transactionHash: receipt.transactionHash,
      });

      this.emit('escrowReleased', { tradeId, escrowId: escrow.id });

      return { success: true };

    } catch (error) {
      this.logger.error('Failed to release escrow', {
        requestId,
        tradeId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });

      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to release escrow' 
      };
    }
  }

  /**
   * Open dispute with evidence
   */
  async openDispute(data: z.infer<typeof DisputeSchema>): Promise<{
    success: boolean;
    disputeId?: string;
    error?: string;
  }> {
    const requestId = nanoid();

    try {
      const validatedData = DisputeSchema.parse(data);
      
      this.logger.info('Opening dispute', {
        requestId,
        tradeId: validatedData.tradeId,
        disputedBy: validatedData.disputedBy,
      });

      // Get escrow details
      const escrow = await this.prisma.escrow.findUnique({
        where: { tradeId: validatedData.tradeId },
        include: { trade: true }
      });

      if (!escrow) {
        return { success: false, error: 'Escrow not found' };
      }

      if (escrow.status !== EscrowStatus.FUNDED) {
        return { success: false, error: `Cannot dispute escrow with status: ${escrow.status}` };
      }

      // Check dispute window
      const disputeWindow = 7 * 24 * 60 * 60 * 1000; // 7 days
      if (new Date().getTime() > escrow.timeoutAt.getTime() + disputeWindow) {
        return { success: false, error: 'Dispute window has expired' };
      }

      // Hash evidence for security
      const evidenceHash = validatedData.evidence ? 
        ethers.utils.keccak256(ethers.utils.toUtf8Bytes(JSON.stringify(validatedData.evidence))) :
        null;

      // Create dispute in blockchain
      const tx = await this.contract.disputeTrade(
        validatedData.tradeId,
        evidenceHash || ethers.constants.HashZero,
        validatedData.reason
      );

      const receipt = await tx.wait(this.securityConfig.minConfirmations);

      // Create dispute in database
      const dispute = await this.prisma.$transaction(async (tx) => {
        const dispute = await tx.dispute.create({
          data: {
            tradeId: validatedData.tradeId,
            reason: validatedData.reason,
            evidence: validatedData.evidence,
            status: DisputeStatus.OPEN,
            disputedBy: validatedData.disputedBy,
            evidenceHash,
          }
        });

        await tx.escrow.update({
          where: { id: escrow.id },
          data: {
            status: EscrowStatus.DISPUTED,
            disputedAt: new Date(),
            disputeTransactionHash: receipt.transactionHash,
          }
        });

        await tx.trade.update({
          where: { id: validatedData.tradeId },
          data: { status: TradeStatus.DISPUTED }
        });

        return dispute;
      });

      this.logger.info('Dispute opened successfully', {
        requestId,
        tradeId: validatedData.tradeId,
        disputeId: dispute.id,
        transactionHash: receipt.transactionHash,
      });

      this.emit('disputeOpened', {
        tradeId: validatedData.tradeId,
        disputeId: dispute.id,
        disputedBy: validatedData.disputedBy,
      });

      return { success: true, disputeId: dispute.id };

    } catch (error) {
      this.logger.error('Failed to open dispute', {
        requestId,
        error: error instanceof Error ? error.message : 'Unknown error',
        data,
      });

      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to open dispute' 
      };
    }
  }

  /**
   * Comprehensive security checks
   */
  private async performSecurityChecks(data: z.infer<typeof CreateEscrowSchema>): Promise<{
    passed: boolean;
    reasons: string[];
    flags: string[];
  }> {
    const reasons: string[] = [];
    const flags: string[] = [];

    // Check blacklist
    const blacklistedAddresses = await this.prisma.user.findMany({
      where: {
        OR: [
          { walletAddress: data.sellerAddress },
          { walletAddress: data.buyerAddress }
        ],
        riskLevel: 'BLACKLISTED'
      }
    });

    if (blacklistedAddresses.length > 0) {
      reasons.push('Address is blacklisted');
      flags.push('BLACKLISTED_ADDRESS');
    }

    // Check daily volume limits
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const dailyVolume = await this.prisma.escrow.aggregate({
      where: {
        createdAt: { gte: today },
        trade: { creatorId: data.sellerAddress },
      },
      _sum: { amount: true }
    });

    const currentVolume = new Decimal(dailyVolume._sum.amount || '0');
    const newVolume = currentVolume.add(new Decimal(data.amount));

    if (newVolume.gt(this.securityConfig.maxDailyVolume)) {
      reasons.push('Exceeds daily volume limit');
      flags.push('VOLUME_LIMIT_EXCEEDED');
    }

    // Check single trade limit
    if (new Decimal(data.amount).gt(this.securityConfig.maxSingleTrade)) {
      reasons.push('Exceeds single trade limit');
      flags.push('TRADE_LIMIT_EXCEEDED');
    }

    // Check for rapid successive trades (velocity check)
    const recentTrades = await this.prisma.escrow.count({
      where: {
        trade: { creatorId: data.sellerAddress },
        createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) }, // Last hour
      }
    });

    if (recentTrades > 5) {
      reasons.push('Too many trades in short time period');
      flags.push('HIGH_VELOCITY_TRADING');
    }

    return {
      passed: reasons.length === 0,
      reasons,
      flags,
    };
  }

  /**
   * Risk assessment algorithm
   */
  private async assessRisk(data: z.infer<typeof CreateEscrowSchema>): Promise<number> {
    let riskScore = 0;

    // Get user data
    const seller = await this.prisma.user.findUnique({
      where: { walletAddress: data.sellerAddress }
    });

    const buyer = await this.prisma.user.findUnique({
      where: { walletAddress: data.buyerAddress }
    });

    // Account age factor (newer accounts = higher risk)
    if (seller) {
      const accountAge = (Date.now() - seller.createdAt.getTime()) / (24 * 60 * 60 * 1000);
      if (accountAge < 7) riskScore += 20; // New account
      else if (accountAge < 30) riskScore += 10; // Young account
    } else {
      riskScore += 30; // Unknown seller
    }

    // Trade history factor
    if (seller && seller.tradeCount < 5) {
      riskScore += 15; // Low trade history
    }

    // Reputation score factor
    if (seller && seller.reputationScore < 3.0) {
      riskScore += 20; // Low reputation
    }

    // Amount-based risk
    const amount = new Decimal(data.amount);
    if (amount.gt(new Decimal('10000'))) {
      riskScore += 15; // Large amount
    }

    // Time-based risk (trades at unusual hours)
    const hour = new Date().getHours();
    if (hour < 6 || hour > 22) {
      riskScore += 5; // Off-hours trading
    }

    return Math.min(riskScore, 100); // Cap at 100
  }

  /**
   * Generate cryptographically secure nonce
   */
  private async generateSecureNonce(): Promise<number> {
    const randomBytes = ethers.utils.randomBytes(8);
    return ethers.BigNumber.from(randomBytes).toNumber();
  }

  /**
   * Event handlers for blockchain events
   */
  private async handleTradeCreatedEvent(tradeId: string, seller: string, buyer: string) {
    this.logger.info('Blockchain trade created event', { tradeId, seller, buyer });
    // Sync with database if needed
  }

  private async handleTradeCompletedEvent(tradeId: string) {
    this.logger.info('Blockchain trade completed event', { tradeId });
    // Update any cached data
  }

  private async handleTradeDisputedEvent(tradeId: string, disputedBy: string) {
    this.logger.warn('Blockchain trade disputed event', { tradeId, disputedBy });
    // Alert monitoring systems
    this.emit('alertRequired', { 
      type: 'DISPUTE_OPENED', 
      tradeId, 
      severity: 'HIGH',
      timestamp: new Date()
    });
  }

  private async handleSuspiciousActivity(tradeId: string, user: string, reason: string) {
    this.logger.error('Suspicious activity detected', { tradeId, user, reason });
    
    // Immediate actions
    await this.prisma.user.update({
      where: { walletAddress: user },
      data: { riskLevel: 'HIGH' }
    });

    // Alert security team
    this.emit('securityAlert', {
      type: 'SUSPICIOUS_ACTIVITY',
      tradeId,
      user,
      reason,
      severity: 'CRITICAL',
      timestamp: new Date()
    });
  }

  /**
   * Health check method
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    checks: Record<string, boolean>;
    lastUpdate: Date;
  }> {
    const checks: Record<string, boolean> = {};

    try {
      // Check database connection
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = true;
    } catch {
      checks.database = false;
    }

    try {
      // Check blockchain connection
      await this.provider.getBlockNumber();
      checks.blockchain = true;
    } catch {
      checks.blockchain = false;
    }

    try {
      // Check contract is responsive
      await this.contract.getContractStats();
      checks.contract = true;
    } catch {
      checks.contract = false;
    }

    const healthyChecks = Object.values(checks).filter(Boolean).length;
    const totalChecks = Object.keys(checks).length;

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (healthyChecks === 0) status = 'unhealthy';
    else if (healthyChecks < totalChecks) status = 'degraded';

    return {
      status,
      checks,
      lastUpdate: new Date()
    };
  }
}

export default SecureEscrowService;
