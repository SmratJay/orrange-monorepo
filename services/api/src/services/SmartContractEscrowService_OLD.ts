/**
 * Smart Contract Escrow Service - CORE IMPLEMENTATION
 * Clean integration with OrrangeEscrow smart contract
 * 
 * FOCUS: P2P cryptocurrency trading with proper escrow
 * STATUS: Week 2 Day 1 - Clean rebuild after contract fixes
 */

import { ethers, Contract, Wallet, Provider } from 'ethers';
import { EventEmitter } from 'events';

/**
 * Trade Status - Mirrors smart contract states
 */
export enum TradeState {
  NONE = 0,
  ACTIVE = 1,
  COMPLETED = 2,
  REFUNDED = 3,
  DISPUTED = 4,
  CANCELLED = 5,
  EMERGENCY_HALT = 6
}

/**
 * Escrow Service Events
 */
export enum EscrowEvent {
  TRADE_CREATED = 'TradeCreated',
  TRADE_COMPLETED = 'TradeCompleted',
  TRADE_CANCELLED = 'TradeCancelled',
  TRADE_DISPUTED = 'TradeDisputed',
  PAYMENT_CONFIRMED = 'PaymentConfirmed'
}
  SELLER_WINS = 'SELLER_WINS',
  PARTIAL_REFUND = 'PARTIAL_REFUND',
  ARBITRATION = 'ARBITRATION',
  AUTOMATED = 'AUTOMATED'
}

/**
 * Blockchain Networks
 */
export enum BlockchainNetwork {
  ETHEREUM_MAINNET = 'ETHEREUM_MAINNET',
  ETHEREUM_SEPOLIA = 'ETHEREUM_SEPOLIA',
  POLYGON = 'POLYGON',
  BSC = 'BSC',
  ARBITRUM = 'ARBITRUM',
/**
 * Trade Information - Matches database schema
 */
export interface TradeInfo {
  tradeId: string;
  seller: string;
  buyer: string;
  tokenAddress: string;
  amount: string; // BigNumber string
  platformFee: string;
  securityDeposit: string;
  expiresAt: number;
  paymentHash: string;
  state: TradeState;
  txHash?: string;
  blockNumber?: number;
  createdAt: Date;
}

/**
 * Contract Configuration
 */
export interface ContractConfig {
  contractAddress: string;
  providerUrl: string;
  chainId: number;
  privateKey?: string; // For admin operations
  gasLimit?: number;
  gasPrice?: string;
}

/**
 * Transaction Result
 */
export interface TxResult {
  success: boolean;
  txHash?: string;
  blockNumber?: number;
  gasUsed?: string;
  error?: string;
}

/**
 * Smart Contract Escrow Service
 */
export class SmartContractEscrowService extends EventEmitter {
  private provider!: ethers.JsonRpcProvider;
  private wallet!: Wallet;
  private escrowContract!: Contract;
  private multiSigContract?: Contract;

  // Network configurations
  private networkConfigs = new Map<BlockchainNetwork, {
    rpcUrl: string;
    chainId: number;
    gasPrice: string;
    contractAddress: string;
  }>();

  // Gas optimization settings
  private gasSettings = {
    gasLimit: 500000,
    maxFeePerGas: ethers.parseUnits('50', 'gwei'),
    maxPriorityFeePerGas: ethers.parseUnits('2', 'gwei')
  };

  // Active escrows tracking
  private activeEscrows = new Map<string, EscrowContract>();
  private pendingTransactions = new Map<string, Promise<any>>();

  constructor(
    private prisma: any,
    private redis: any,
    private securityService: SecurityService,
    private auditService: AuditService,
    private config: {
      privateKey: string;
      rpcUrl: string;
      contractAddress: string;
      network: BlockchainNetwork;
    }
  ) {
    super();
    console.log('🔗 Initializing Smart Contract Escrow Service...');
    this.initializeNetwork();
    this.loadNetworkConfigs();
  }

  /**
   * Initialize Blockchain Network Connection
   */
  private async initializeNetwork(): Promise<void> {
    try {
      // Initialize provider and wallet
      this.provider = new ethers.JsonRpcProvider(this.config.rpcUrl);
      this.wallet = new Wallet(this.config.privateKey, this.provider);

      // Load OrrangeEscrow contract ABI (updated to match deployed contract)
      const escrowABI = [
        // Core Trading Functions
        "function createTrade(bytes32 _tradeId, address _buyer, address _tokenAddress, uint256 _amount, uint256 _platformFee, uint256 _securityDeposit, uint256 _expiresAt, bytes32 _paymentHash) external nonpayable",
        "function confirmPaymentReceived(bytes32 _tradeId) external nonpayable",
        "function cancelExpiredTrade(bytes32 _tradeId) external nonpayable",
        
        // View Functions
        "function getTrade(bytes32 _tradeId) external view returns (tuple(bytes32 tradeId, address seller, address buyer, address tokenAddress, uint256 amount, uint256 platformFee, uint256 securityDeposit, uint256 createdAt, uint256 expiresAt, uint256 lastActivityAt, uint8 state, bytes32 paymentHash))",
        "function tradeExists(bytes32 _tradeId) external view returns (bool)",
        "function whitelistedTokens(address) external view returns (bool)",
        
        // Admin Functions  
        "function whitelistToken(address _token, bool _whitelisted) external nonpayable",
        "function owner() external view returns (address)",
        "function paused() external view returns (bool)",
        "function feeCollector() external view returns (address)",
        "function platformFeePercent() external view returns (uint256)",
        
        // Emergency Functions
        "function emergencyPause() external nonpayable",
        "function emergencyUnpause() external nonpayable",
        
        // Events
        "event TradeCreated(bytes32 indexed tradeId, address indexed seller, address indexed buyer, address tokenAddress, uint256 amount, uint256 expiresAt)",
        "event PaymentConfirmed(bytes32 indexed tradeId, address indexed buyer, uint256 confirmedAt)",
        "event TradeRefunded(bytes32 indexed tradeId, uint256 refundedAt)",
        "event TokenWhitelisted(address indexed token, bool whitelisted)"
      ];

      this.escrowContract = new Contract(this.config.contractAddress, escrowABI, this.wallet);

      // Setup event listeners
      this.setupContractEventListeners();

      console.log(`✅ Connected to ${this.config.network} network`);
      console.log(`📄 Escrow contract: ${this.config.contractAddress}`);

    } catch (error: any) {
      console.error('Failed to initialize blockchain network:', error);
      throw new Error(`Network initialization failed: ${error.message}`);
    }
  }

  /**
   * Load Network Configurations
   */
  private loadNetworkConfigs(): void {
    this.networkConfigs.set(BlockchainNetwork.ETHEREUM_MAINNET, {
      rpcUrl: process.env.ETHEREUM_RPC_URL || 'https://mainnet.infura.io/v3/YOUR_PROJECT_ID',
      chainId: 1,
      gasPrice: '20000000000', // 20 gwei
      contractAddress: process.env.ETHEREUM_ESCROW_CONTRACT || ''
    });

    this.networkConfigs.set(BlockchainNetwork.ETHEREUM_SEPOLIA, {
      rpcUrl: process.env.SEPOLIA_RPC_URL || 'https://sepolia.infura.io/v3/YOUR_PROJECT_ID',
      chainId: 11155111,
      gasPrice: '10000000000', // 10 gwei
      contractAddress: process.env.SEPOLIA_ESCROW_CONTRACT || this.config.contractAddress
    });

    this.networkConfigs.set(BlockchainNetwork.POLYGON, {
      rpcUrl: process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com',
      chainId: 137,
      gasPrice: '30000000000', // 30 gwei
      contractAddress: process.env.POLYGON_ESCROW_CONTRACT || ''
    });

    console.log(`📡 Loaded ${this.networkConfigs.size} network configurations`);
  }

  /**
   * Create New Escrow Contract
   */
  async createEscrow(
    orderId: string,
    buyerId: string,
    sellerId: string,
    amount: number,
    currency: Currency,
    options: {
      expirationHours?: number;
      arbitratorId?: string;
      metadata?: Record<string, any>;
      network?: BlockchainNetwork;
      requireMultiSig?: boolean;
    } = {}
  ): Promise<EscrowContract> {
    const startTime = Date.now();
    console.log(`🔗 Creating escrow for order: ${orderId}`);

    try {
      // Validate inputs
      if (amount <= 0) {
        throw new Error('Escrow amount must be greater than zero');
      }

      // Convert amount to Wei (assuming ETH for now)
      const amountWei = ethers.parseEther(amount.toString());
      
      // Get buyer and seller wallet addresses (would be stored in user profiles)
      const buyerAddress = await this.getUserWalletAddress(buyerId);
      const sellerAddress = await this.getUserWalletAddress(sellerId);

      // Create escrow transaction
      const tx = await this.escrowContract.createEscrow(
        orderId,
        buyerAddress,
        sellerAddress,
        amountWei,
        {
          gasLimit: this.gasSettings.gasLimit,
          maxFeePerGas: this.gasSettings.maxFeePerGas,
          maxPriorityFeePerGas: this.gasSettings.maxPriorityFeePerGas
        }
      );

      console.log(`📝 Escrow transaction submitted: ${tx.hash}`);

      // Wait for confirmation
      const receipt = await tx.wait(1);
      const escrowId = this.extractEscrowIdFromReceipt(receipt);

      const escrowContract: EscrowContract = {
        id: escrowId,
        orderId,
        buyerId,
        sellerId,
        arbitratorId: options.arbitratorId,
        amount,
        currency,
        contractAddress: this.config.contractAddress,
        transactionHash: tx.hash,
        network: options.network || this.config.network,
        status: EscrowStatus.CREATED,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + (options.expirationHours || 24) * 60 * 60 * 1000),
        metadata: options.metadata || {}
      };

      // Store in database and cache
      await this.saveEscrowContract(escrowContract);
      this.activeEscrows.set(escrowId, escrowContract);

      // Log audit event
      await this.auditService.logAuditEvent({
        eventType: AuditEventType.ESCROW_CREATED,
        severity: AuditSeverity.INFO,
        userId: buyerId,
        sessionId: options.metadata?.sessionId,
        ipAddress: options.metadata?.ipAddress,
        userAgent: options.metadata?.userAgent,
        resource: 'smart-escrow',
        action: 'create-escrow',
        details: {
          escrowId,
          orderId,
          amount,
          currency,
          transactionHash: tx.hash,
          processingTime: Date.now() - startTime
        }
      });

      this.emit('escrowCreated', escrowContract);
      console.log(`✅ Escrow created successfully: ${escrowId}`);
      
      return escrowContract;

    } catch (error: any) {
      console.error(`Escrow creation failed: ${error.message}`);
      
      await this.auditService.logAuditEvent({
        eventType: AuditEventType.ESCROW_FAILED,
        severity: AuditSeverity.ERROR,
        userId: buyerId,
        resource: 'smart-escrow',
        action: 'create-escrow-failed',
        details: {
          orderId,
          error: error.message,
          processingTime: Date.now() - startTime
        }
      });

      throw new Error(`Failed to create escrow: ${error.message}`);
    }
  }

  /**
   * Fund Escrow Contract
   */
  async fundEscrow(
    escrowId: string,
    fundingSource: 'wallet' | 'payment_gateway' = 'wallet'
  ): Promise<boolean> {
    console.log(`💰 Funding escrow: ${escrowId}`);

    try {
      const escrow = this.activeEscrows.get(escrowId);
      if (!escrow) {
        throw new Error('Escrow not found');
      }

      if (escrow.status !== EscrowStatus.CREATED) {
        throw new Error(`Cannot fund escrow in status: ${escrow.status}`);
      }

      let fundingTx;

      // Pure P2P crypto platform - Direct smart contract funding only
      // Direct wallet funding with crypto
      const amountWei = ethers.parseEther(escrow.amount.toString());
      
      console.log('Funding escrow directly via smart contract', { 
        escrowId, 
        amount: escrow.amount.toString(),
        amountWei: amountWei.toString() 
      });
      
      fundingTx = await this.escrowContract.fundEscrow(escrowId, {
        value: amountWei,
        gasLimit: this.gasSettings.gasLimit,
        maxFeePerGas: this.gasSettings.maxFeePerGas,
        maxPriorityFeePerGas: this.gasSettings.maxPriorityFeePerGas
      });

      await fundingTx.wait(1);

      // Update escrow status
      escrow.status = EscrowStatus.FUNDED;
      escrow.fundedAt = new Date();
      this.activeEscrows.set(escrowId, escrow);
      await this.updateEscrowContract(escrow);

      this.emit('escrowFunded', escrow);
      console.log(`✅ Escrow funded successfully: ${escrowId}`);
      
      return true;

    } catch (error: any) {
      console.error(`Escrow funding failed: ${error.message}`);
      throw new Error(`Failed to fund escrow: ${error.message}`);
    }
  }

  /**
   * Release Escrow to Seller
   */
  async releaseEscrow(
    escrowId: string,
    initiatedBy: string,
    partialAmount?: number
  ): Promise<boolean> {
    console.log(`🔓 Releasing escrow: ${escrowId}`);

    try {
      const escrow = this.activeEscrows.get(escrowId);
      if (!escrow) {
        throw new Error('Escrow not found');
      }

      // Validate authorization
      if (initiatedBy !== escrow.buyerId && initiatedBy !== escrow.arbitratorId) {
        throw new Error('Unauthorized escrow release attempt');
      }

      if (escrow.status !== EscrowStatus.FUNDED && escrow.status !== EscrowStatus.ACTIVE) {
        throw new Error(`Cannot release escrow in status: ${escrow.status}`);
      }

      let releaseTx;

      if (partialAmount && partialAmount < escrow.amount) {
        // Partial release implementation
        const partialAmountWei = ethers.parseEther(partialAmount.toString());
        releaseTx = await this.escrowContract.partialRelease(escrowId, partialAmountWei, {
          gasLimit: this.gasSettings.gasLimit
        });
        
        escrow.status = EscrowStatus.PARTIALLY_RELEASED;
      } else {
        // Full release
        releaseTx = await this.escrowContract.releaseEscrow(escrowId, {
          gasLimit: this.gasSettings.gasLimit
        });
        
        escrow.status = EscrowStatus.COMPLETED;
        escrow.completedAt = new Date();
      }

      await releaseTx.wait(1);

      this.activeEscrows.set(escrowId, escrow);
      await this.updateEscrowContract(escrow);

      // Log audit event
      await this.auditService.logAuditEvent({
        eventType: AuditEventType.ESCROW_RELEASED,
        severity: AuditSeverity.INFO,
        userId: initiatedBy,
        resource: 'smart-escrow',
        action: 'release-escrow',
        details: {
          escrowId,
          orderId: escrow.orderId,
          amount: partialAmount || escrow.amount,
          transactionHash: releaseTx.hash
        }
      });

      this.emit('escrowReleased', escrow);
      console.log(`✅ Escrow released successfully: ${escrowId}`);
      
      return true;

    } catch (error: any) {
      console.error(`Escrow release failed: ${error.message}`);
      throw new Error(`Failed to release escrow: ${error.message}`);
    }
  }

  /**
   * Refund Escrow to Buyer
   */
  async refundEscrow(
    escrowId: string,
    initiatedBy: string,
    refundAmount?: number
  ): Promise<boolean> {
    console.log(`🔙 Refunding escrow: ${escrowId}`);

    try {
      const escrow = this.activeEscrows.get(escrowId);
      if (!escrow) {
        throw new Error('Escrow not found');
      }

      // Validate authorization
      if (initiatedBy !== escrow.sellerId && initiatedBy !== escrow.arbitratorId) {
        throw new Error('Unauthorized escrow refund attempt');
      }

      const refundTx = await this.escrowContract.refundEscrow(escrowId, {
        gasLimit: this.gasSettings.gasLimit
      });

      await refundTx.wait(1);

      escrow.status = EscrowStatus.REFUNDED;
      this.activeEscrows.set(escrowId, escrow);
      await this.updateEscrowContract(escrow);

      this.emit('escrowRefunded', escrow);
      console.log(`✅ Escrow refunded successfully: ${escrowId}`);
      
      return true;

    } catch (error: any) {
      console.error(`Escrow refund failed: ${error.message}`);
      throw new Error(`Failed to refund escrow: ${error.message}`);
    }
  }

  /**
   * Initiate Dispute
   */
  async initiateDispute(
    escrowId: string,
    initiatedBy: string,
    reason: string,
    evidence: any[] = []
  ): Promise<DisputeInfo> {
    console.log(`⚖️ Initiating dispute for escrow: ${escrowId}`);

    try {
      const escrow = this.activeEscrows.get(escrowId);
      if (!escrow) {
        throw new Error('Escrow not found');
      }

      if (initiatedBy !== escrow.buyerId && initiatedBy !== escrow.sellerId) {
        throw new Error('Unauthorized dispute initiation');
      }

      const disputeTx = await this.escrowContract.disputeEscrow(escrowId, reason, {
        gasLimit: this.gasSettings.gasLimit
      });

      await disputeTx.wait(1);

      const disputeInfo: DisputeInfo = {
        id: `dispute_${escrowId}_${Date.now()}`,
        escrowId,
        initiatedBy: initiatedBy === escrow.buyerId ? 'buyer' : 'seller',
        reason,
        evidence
      };

      escrow.status = EscrowStatus.DISPUTED;
      this.activeEscrows.set(escrowId, escrow);
      await this.updateEscrowContract(escrow);

      this.emit('disputeInitiated', disputeInfo);
      console.log(`⚖️ Dispute initiated: ${disputeInfo.id}`);
      
      return disputeInfo;

    } catch (error: any) {
      console.error(`Dispute initiation failed: ${error.message}`);
      throw new Error(`Failed to initiate dispute: ${error.message}`);
    }
  }

  /**
   * Get Escrow Status
   */
  async getEscrowStatus(escrowId: string): Promise<EscrowContract | null> {
    // Check cache first
    if (this.activeEscrows.has(escrowId)) {
      return this.activeEscrows.get(escrowId)!;
    }

    // Query blockchain
    try {
      const escrowData = await this.escrowContract.getEscrow(escrowId);
      
      // Transform blockchain data to our interface
      const escrowContract: EscrowContract = {
        id: escrowId,
        orderId: escrowData.orderId,
        buyerId: '', // Would need to map from address
        sellerId: '', // Would need to map from address
        amount: parseFloat(ethers.formatEther(escrowData.amount)),
        currency: Currency.ETH, // Assuming ETH for now
        contractAddress: this.config.contractAddress,
        transactionHash: '',
        network: this.config.network,
        status: this.mapContractStatus(escrowData.status),
        createdAt: new Date(escrowData.createdAt * 1000),
        expiresAt: new Date(escrowData.expiresAt * 1000),
        metadata: {}
      };

      this.activeEscrows.set(escrowId, escrowContract);
      return escrowContract;

    } catch (error: any) {
      console.error(`Failed to get escrow status: ${error.message}`);
      return null;
    }
  }

  /**
   * Get Gas Estimates
   */
  async getGasEstimates(): Promise<{
    createEscrow: string;
    fundEscrow: string;
    releaseEscrow: string;
    refundEscrow: string;
    disputeEscrow: string;
  }> {
    try {
      const feeData = await this.provider.getFeeData();
      const gasPrice = feeData.gasPrice || ethers.parseUnits('20', 'gwei'); // fallback
      
      return {
        createEscrow: ethers.formatEther(gasPrice * BigInt(200000)), // Estimated gas
        fundEscrow: ethers.formatEther(gasPrice * BigInt(150000)),
        releaseEscrow: ethers.formatEther(gasPrice * BigInt(100000)),
        refundEscrow: ethers.formatEther(gasPrice * BigInt(100000)),
        disputeEscrow: ethers.formatEther(gasPrice * BigInt(120000))
      };
    } catch (error) {
      console.error('Failed to get gas estimates:', error);
      return {
        createEscrow: '0.01',
        fundEscrow: '0.008',
        releaseEscrow: '0.005',
        refundEscrow: '0.005',
        disputeEscrow: '0.006'
      };
    }
  }

  // ===================
  // PRIVATE METHODS
  // ===================

  private setupContractEventListeners(): void {
    this.escrowContract.on('TradeCreated', (tradeId, seller, buyer, tokenAddress, amount, expiresAt, event) => {
      console.log(`📄 Contract Event - Trade Created: ${tradeId}`);
      this.emit('contractTradeCreated', { tradeId, seller, buyer, tokenAddress, amount, expiresAt, event });
    });

    this.escrowContract.on('PaymentConfirmed', (tradeId, buyer, confirmedAt, event) => {
      console.log(`✅ Contract Event - Payment Confirmed: ${tradeId}`);
      this.emit('contractPaymentConfirmed', { tradeId, buyer, confirmedAt, event });
    });

    this.escrowContract.on('TradeRefunded', (tradeId, refundedAt, event) => {
      console.log(`� Contract Event - Trade Refunded: ${tradeId}`);
      this.emit('contractTradeRefunded', { tradeId, refundedAt, event });
    });

    this.escrowContract.on('TokenWhitelisted', (token, whitelisted, event) => {
      console.log(`🔐 Contract Event - Token Whitelist Updated: ${token} - ${whitelisted}`);
      this.emit('contractTokenWhitelisted', { token, whitelisted, event });
    });
  }

  private async getUserWalletAddress(userId: string): Promise<string> {
    // Mock implementation - would get from user profile
    const mockAddresses = {
      'user1': '0x742d35cc2979d4b6b4d123456789a1b1c2d2e3f3',
      'user2': '0x8ba1f109551bD432803012645Hac136c8ce1F6AA'
    };
    
    return mockAddresses[userId as keyof typeof mockAddresses] || mockAddresses.user1;
  }

  private extractEscrowIdFromReceipt(receipt: any): string {
    // Extract escrow ID from transaction receipt events
    const event = receipt.events?.find((e: any) => e.event === 'EscrowCreated');
    return event?.args?.escrowId?.toString() || `escrow_${Date.now()}`;
  }

  private mapContractStatus(statusCode: number): EscrowStatus {
    const statusMap = {
      0: EscrowStatus.CREATED,
      1: EscrowStatus.FUNDED,
      2: EscrowStatus.COMPLETED,
      3: EscrowStatus.REFUNDED,
      4: EscrowStatus.DISPUTED,
      5: EscrowStatus.EXPIRED
    };
    
    return statusMap[statusCode as keyof typeof statusMap] || EscrowStatus.CREATED;
  }

  private async saveEscrowContract(escrow: EscrowContract): Promise<void> {
    // Save to database
    // Implementation would depend on database schema
    console.log(`💾 Saving escrow to database: ${escrow.id}`);
  }

  private async updateEscrowContract(escrow: EscrowContract): Promise<void> {
    // Update in database
    console.log(`🔄 Updating escrow in database: ${escrow.id}`);
  }
}

/**
 * Smart Contract Escrow Factory
 */
export function createSmartContractEscrowService(
  prisma: any,
  redis: any,
  securityService: SecurityService,
  auditService: AuditService,
  config: {
    privateKey: string;
    rpcUrl: string;
    contractAddress: string;
    network: BlockchainNetwork;
  }
): SmartContractEscrowService {
  return new SmartContractEscrowService(
    prisma,
    redis,
    securityService,
    auditService,
    config
  );
}

console.log('🔗 Smart Contract Escrow Service module loaded');
export default SmartContractEscrowService;
