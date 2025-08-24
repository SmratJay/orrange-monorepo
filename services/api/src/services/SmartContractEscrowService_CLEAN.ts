/**
 * Smart Contract Escrow Service - CLEAN IMPLEMENTATION
 * Handles integration with OrrangeEscrow smart contract
 * 
 * Week 2 Day 1: Clean rebuild after smart contract compilation fixes
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
 * Smart Contract Escrow Service - CORE IMPLEMENTATION
 * Handles integration with OrrangeEscrow smart contract
 */
export class SmartContractEscrowService extends EventEmitter {
  private provider: Provider;
  private contract: Contract;
  private wallet?: Wallet;

  constructor(private config: ContractConfig) {
    super();
    this.initializeProvider();
  }

  /**
   * Initialize blockchain provider and contract
   */
  private initializeProvider(): void {
    this.provider = new ethers.JsonRpcProvider(this.config.providerUrl);
    
    // Initialize contract with ABI matching our fixed contract
    const contractABI = [
      // Core functions from our fixed OrrangeEscrow contract
      "function createTrade(bytes32 _tradeId, address _buyer, address _tokenAddress, uint256 _amount, uint256 _expiresAt, bytes32 _paymentHash, bytes _sellerSignature, uint256 _nonce, bool _requiresKYC) external",
      "function confirmPaymentReceived(bytes32 _tradeId) external",
      "function cancelExpiredTrade(bytes32 _tradeId) external",
      "function getTrade(bytes32 _tradeId) external view returns (tuple(bytes32 tradeId, address seller, address buyer, address tokenAddress, uint256 amount, uint256 platformFee, uint256 securityDeposit, uint256 createdAt, uint256 expiresAt, uint256 lastActivityAt, uint8 state, bytes sellerSignature, bytes buyerSignature, uint256 nonce, bool requiresKYC, bytes32 paymentHash))",
      
      // Events
      "event TradeCreated(bytes32 indexed tradeId, address indexed seller, address indexed buyer, address tokenAddress, uint256 amount, uint256 expiresAt)",
      "event TradeCompleted(bytes32 indexed tradeId, uint256 timestamp)",
      "event TradeCancelled(bytes32 indexed tradeId, uint256 timestamp)",
      "event TradeDisputed(bytes32 indexed tradeId, address initiator, uint256 timestamp)",
      
      // View functions
      "function platformFeePercent() external view returns (uint256)",
      "function totalEscrowedAmount() external view returns (uint256)",
      "function owner() external view returns (address)",
      "function paused() external view returns (bool)",
      "function whitelistedTokens(address) external view returns (bool)"
    ];

    this.contract = new ethers.Contract(
      this.config.contractAddress,
      contractABI,
      this.provider
    );

    // Initialize wallet for admin operations if private key provided
    if (this.config.privateKey) {
      this.wallet = new Wallet(this.config.privateKey, this.provider);
      this.contract = this.contract.connect(this.wallet);
    }

    // Setup event listeners
    this.setupEventListeners();

    console.log(`✅ SmartContractEscrowService initialized on chain ${this.config.chainId}`);
  }

  /**
   * Setup blockchain event listeners
   */
  private setupEventListeners(): void {
    // Listen for trade creation events
    this.contract.on('TradeCreated', (tradeId, seller, buyer, tokenAddress, amount, expiresAt, event) => {
      this.emit(EscrowEvent.TRADE_CREATED, {
        tradeId: tradeId,
        seller,
        buyer,
        tokenAddress,
        amount: amount.toString(),
        expiresAt: expiresAt.toString(),
        blockNumber: event.blockNumber,
        txHash: event.transactionHash
      });
    });

    // Listen for trade completion events
    this.contract.on('TradeCompleted', (tradeId, timestamp, event) => {
      this.emit(EscrowEvent.TRADE_COMPLETED, {
        tradeId: tradeId,
        timestamp: timestamp.toString(),
        blockNumber: event.blockNumber,
        txHash: event.transactionHash
      });
    });

    // Listen for trade cancellation events
    this.contract.on('TradeCancelled', (tradeId, timestamp, event) => {
      this.emit(EscrowEvent.TRADE_CANCELLED, {
        tradeId: tradeId,
        timestamp: timestamp.toString(),
        blockNumber: event.blockNumber,
        txHash: event.transactionHash
      });
    });

    console.log('🎧 Contract event listeners setup complete');
  }

  /**
   * Create a new trade in the escrow contract
   */
  async createTrade(params: {
    tradeId: string;
    buyer: string;
    tokenAddress: string;
    amount: string;
    expiresAt: number;
    paymentHash: string;
    sellerSignature: string;
    nonce: number;
    requiresKYC: boolean;
    sellerWallet: Wallet;
  }): Promise<TxResult> {
    try {
      console.log(`📝 Creating trade ${params.tradeId}...`);
      
      // Connect contract with seller's wallet
      const contractWithSeller = this.contract.connect(params.sellerWallet);
      
      // Convert parameters to proper types
      const tradeIdBytes = ethers.id(params.tradeId);
      const amountBN = ethers.parseUnits(params.amount, 18);
      const paymentHashBytes = ethers.id(params.paymentHash);
      const signatureBytes = ethers.getBytes(params.sellerSignature);
      
      // Call contract function
      const tx = await contractWithSeller.createTrade(
        tradeIdBytes,
        params.buyer,
        params.tokenAddress,
        amountBN,
        params.expiresAt,
        paymentHashBytes,
        signatureBytes,
        params.nonce,
        params.requiresKYC,
        {
          gasLimit: this.config.gasLimit || 500000
        }
      );
      
      const receipt = await tx.wait();
      
      console.log(`✅ Trade created: ${receipt.hash}`);
      
      return {
        success: true,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed?.toString()
      };
      
    } catch (error: any) {
      console.error('❌ Create trade failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Confirm payment received (seller confirms)
   */
  async confirmPaymentReceived(tradeId: string, sellerWallet: Wallet): Promise<TxResult> {
    try {
      console.log(`✅ Confirming payment for trade ${tradeId}...`);
      
      const contractWithSeller = this.contract.connect(sellerWallet);
      const tradeIdBytes = ethers.id(tradeId);
      
      const tx = await contractWithSeller.confirmPaymentReceived(tradeIdBytes, {
        gasLimit: this.config.gasLimit || 300000
      });
      
      const receipt = await tx.wait();
      
      console.log(`✅ Payment confirmed: ${receipt.hash}`);
      
      return {
        success: true,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed?.toString()
      };
      
    } catch (error: any) {
      console.error('❌ Confirm payment failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get trade information from contract
   */
  async getTrade(tradeId: string): Promise<TradeInfo | null> {
    try {
      const tradeIdBytes = ethers.id(tradeId);
      const tradeData = await this.contract.getTrade(tradeIdBytes);
      
      return {
        tradeId: tradeData.tradeId,
        seller: tradeData.seller,
        buyer: tradeData.buyer,
        tokenAddress: tradeData.tokenAddress,
        amount: tradeData.amount.toString(),
        platformFee: tradeData.platformFee.toString(),
        securityDeposit: tradeData.securityDeposit.toString(),
        expiresAt: Number(tradeData.expiresAt),
        paymentHash: tradeData.paymentHash,
        state: Number(tradeData.state) as TradeState,
        createdAt: new Date(Number(tradeData.createdAt) * 1000)
      };
      
    } catch (error: any) {
      console.error('❌ Get trade failed:', error);
      return null;
    }
  }

  /**
   * Check if contract is operational
   */
  async isHealthy(): Promise<boolean> {
    try {
      const isPaused = await this.contract.paused();
      return !isPaused;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get platform fee percentage
   */
  async getPlatformFeePercent(): Promise<number> {
    try {
      const feePercent = await this.contract.platformFeePercent();
      return Number(feePercent);
    } catch (error) {
      return 0;
    }
  }

  /**
   * Get total escrowed amount
   */
  async getTotalEscrowedAmount(): Promise<string> {
    try {
      const total = await this.contract.totalEscrowedAmount();
      return total.toString();
    } catch (error) {
      return '0';
    }
  }
}
