// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title OrrangeEscrow - P2P Trading Escrow Contract
 * @dev Enterprise-grade escrow contract for secure P2P cryptocurrency trading
 * @notice Handles escrowed trades with seller confirmation mechanism
 */
contract OrrangeEscrow is ReentrancyGuard, Pausable, Ownable, AccessControl {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    // Role definitions
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant MODERATOR_ROLE = keccak256("MODERATOR_ROLE");
    bytes32 public constant EMERGENCY_ROLE = keccak256("EMERGENCY_ROLE");

    // Trade states
    enum TradeState {
        NONE,           // 0 - Trade doesn't exist
        ACTIVE,         // 1 - Trade is active, funds escrowed
        COMPLETED,      // 2 - Trade completed, funds released to buyer
        REFUNDED,       // 3 - Trade refunded to seller
        DISPUTED,       // 4 - Trade is in dispute
        CANCELLED,      // 5 - Trade cancelled before funding
        EMERGENCY_HALT  // 6 - Emergency halt activated
    }

    // Trade structure
    struct Trade {
        bytes32 tradeId;
        address seller;
        address buyer;
        address tokenAddress;
        uint256 amount;
        uint256 platformFee;
        uint256 securityDeposit;
        uint256 createdAt;
        uint256 expiresAt;
        uint256 lastActivityAt;
        TradeState state;
        bytes32 paymentHash; // Hash of payment method details
    }

    // Security configuration
    struct SecurityConfig {
        uint256 minTradeAmount;
        uint256 maxTradeAmount;
        uint256 maxDailyVolume;
        uint256 securityDepositPercent; // Basis points (100 = 1%)
        uint256 emergencyDelayPeriod;
        uint256 disputeTimeWindow;
        uint256 autoRefundDelay;
        bool requireMultisigForLargeAmounts;
        uint256 multisigThreshold;
    }

    // State variables
    mapping(bytes32 => Trade) public trades;
    mapping(address => uint256) public dailyVolume;
    mapping(address => uint256) public lastTradeTimestamp;
    mapping(address => bool) public blacklistedAddresses;
    mapping(address => bool) public whitelistedTokens;
    mapping(bytes32 => bool) public usedNonces;
    
    SecurityConfig public securityConfig;
    address public feeCollector;
    address public emergencyMultisig;
    uint256 public totalEscrowedAmount;
    uint256 public platformFeePercent = 50; // 0.5% (50/10000)
    
    // Emergency controls
    bool public emergencyHalt = false;
    uint256 public emergencyActivatedAt;
    mapping(bytes32 => uint256) public emergencyWithdrawRequests;

    // Custom errors
    error TradeNotFound();
    error TradeExpired();
    error InvalidTradeState(TradeState expected, TradeState actual);
    error UnauthorizedSender();
    error InvalidAmount();
    error InvalidNonce();
    error SignatureVerificationFailed();
    error EmergencyHaltActive();
    error SecurityDepositTooLow();
    error ExceedsMaxTradeAmount();
    error ExceedsDailyLimit();
    error TokenNotWhitelisted();
    error BlacklistedAddress();

    // Events
    event TradeCreated(
        bytes32 indexed tradeId,
        address indexed seller,
        address indexed buyer,
        address tokenAddress,
        uint256 amount,
        uint256 expiresAt
    );
    
    event TradeCompleted(
        bytes32 indexed tradeId,
        uint256 completedAt
    );
    
    event TradeRefunded(
        bytes32 indexed tradeId,
        uint256 refundedAt
    );
    
    event DisputeRaised(
        bytes32 indexed tradeId,
        address indexed initiator,
        uint256 raisedAt
    );
    
    event EmergencyHaltActivated(uint256 activatedAt);
    event EmergencyHaltDeactivated(uint256 deactivatedAt);

    /**
     * @dev Constructor - Initialize with proper OpenZeppelin v5 syntax
     */
    constructor(
        address _feeCollector,
        address _emergencyMultisig,
        address _initialOwner
    ) Ownable(_initialOwner) {
        feeCollector = _feeCollector;
        emergencyMultisig = _emergencyMultisig;
        
        // Grant roles to deployer initially
        _grantRole(DEFAULT_ADMIN_ROLE, _initialOwner);
        _grantRole(ADMIN_ROLE, _initialOwner);
        _grantRole(EMERGENCY_ROLE, _initialOwner);
        
        // Set default security configuration
        securityConfig = SecurityConfig({
            minTradeAmount: 1e15, // 0.001 ETH minimum
            maxTradeAmount: 1000e18, // 1000 tokens maximum
            maxDailyVolume: 10000e18, // 10,000 tokens daily limit
            securityDepositPercent: 100, // 1%
            emergencyDelayPeriod: 24 hours,
            disputeTimeWindow: 7 days,
            autoRefundDelay: 30 days,
            requireMultisigForLargeAmounts: true,
            multisigThreshold: 100e18 // 100 tokens
        });
    }

    /**
     * @dev Create a new P2P trade
     * @param _tradeId Unique identifier for the trade
     * @param _buyer Address of the buyer
     * @param _tokenAddress Address of the token being traded
     * @param _amount Amount of tokens to trade
     * @param _platformFee Platform fee amount
     * @param _securityDeposit Security deposit amount
     * @param _expiresAt Timestamp when trade expires
     * @param _paymentHash Hash of payment method details
     */
    function createTrade(
        bytes32 _tradeId,
        address _buyer,
        address _tokenAddress,
        uint256 _amount,
        uint256 _platformFee,
        uint256 _securityDeposit,
        uint256 _expiresAt,
        bytes32 _paymentHash
    ) external nonReentrant whenNotPaused {
        // Security checks
        if (_amount < securityConfig.minTradeAmount) revert InvalidAmount();
        if (_amount > securityConfig.maxTradeAmount) revert ExceedsMaxTradeAmount();
        if (blacklistedAddresses[msg.sender] || blacklistedAddresses[_buyer]) 
            revert BlacklistedAddress();
        if (!whitelistedTokens[_tokenAddress]) revert TokenNotWhitelisted();
        if (trades[_tradeId].seller != address(0)) revert InvalidNonce();
        if (_expiresAt <= block.timestamp) revert TradeExpired();

        // Check daily volume limits
        uint256 newDailyVolume = dailyVolume[msg.sender] + _amount;
        if (newDailyVolume > securityConfig.maxDailyVolume) revert ExceedsDailyLimit();
        dailyVolume[msg.sender] = newDailyVolume;

        // Create trade struct
        Trade storage trade = trades[_tradeId];
        trade.tradeId = _tradeId;
        trade.seller = msg.sender;
        trade.buyer = _buyer;
        trade.tokenAddress = _tokenAddress;
        trade.amount = _amount;
        trade.platformFee = _platformFee;
        trade.securityDeposit = _securityDeposit;
        trade.createdAt = block.timestamp;
        trade.expiresAt = _expiresAt;
        trade.lastActivityAt = block.timestamp;
        trade.state = TradeState.ACTIVE;
        trade.paymentHash = _paymentHash;

        // Transfer tokens to escrow
        IERC20 token = IERC20(_tokenAddress);
        uint256 totalAmount = _amount + _platformFee + _securityDeposit;
        token.safeTransferFrom(msg.sender, address(this), totalAmount);
        totalEscrowedAmount += totalAmount;

        emit TradeCreated(_tradeId, msg.sender, _buyer, _tokenAddress, _amount, _expiresAt);
    }

    /**
     * @dev Seller confirms payment received and releases escrow
     * @notice This is the primary P2P completion method - no admin needed
     */
    function confirmPaymentReceived(
        bytes32 _tradeId
    ) external nonReentrant whenNotPaused {
        Trade storage trade = trades[_tradeId];
        
        // Only seller can confirm payment received
        if (msg.sender != trade.seller) revert UnauthorizedSender();
        if (trade.state != TradeState.ACTIVE) 
            revert InvalidTradeState(TradeState.ACTIVE, trade.state);
        if (block.timestamp > trade.expiresAt) revert TradeExpired();
        
        trade.state = TradeState.COMPLETED;
        trade.lastActivityAt = block.timestamp;
        
        // Transfer tokens to buyer
        IERC20 token = IERC20(trade.tokenAddress);
        token.safeTransfer(trade.buyer, trade.amount);
        token.safeTransfer(feeCollector, trade.platformFee);
        token.safeTransfer(trade.seller, trade.securityDeposit); // Return security deposit
        
        totalEscrowedAmount -= (trade.amount + trade.platformFee + trade.securityDeposit);
        
        emit TradeCompleted(_tradeId, block.timestamp);
    }

    /**
     * @dev Cancel an expired trade and refund seller
     */
    function cancelExpiredTrade(bytes32 _tradeId) external nonReentrant {
        Trade storage trade = trades[_tradeId];
        
        if (trade.state != TradeState.ACTIVE) 
            revert InvalidTradeState(TradeState.ACTIVE, trade.state);
        if (block.timestamp <= trade.expiresAt) revert TradeNotFound();
        
        trade.state = TradeState.REFUNDED;
        trade.lastActivityAt = block.timestamp;
        
        // Refund all tokens to seller
        IERC20 token = IERC20(trade.tokenAddress);
        uint256 totalRefund = trade.amount + trade.platformFee + trade.securityDeposit;
        token.safeTransfer(trade.seller, totalRefund);
        totalEscrowedAmount -= totalRefund;
        
        emit TradeRefunded(_tradeId, block.timestamp);
    }

    /**
     * @dev Emergency pause function
     */
    function emergencyPause() external onlyRole(EMERGENCY_ROLE) {
        _pause();
        emergencyHalt = true;
        emergencyActivatedAt = block.timestamp;
        emit EmergencyHaltActivated(block.timestamp);
    }

    /**
     * @dev Emergency unpause function
     */
    function emergencyUnpause() external onlyRole(EMERGENCY_ROLE) {
        _unpause();
        emergencyHalt = false;
        emit EmergencyHaltDeactivated(block.timestamp);
    }

    /**
     * @dev Update security configuration
     */
    function updateSecurityConfig(
        SecurityConfig calldata _newConfig
    ) external onlyRole(ADMIN_ROLE) {
        securityConfig = _newConfig;
    }

    /**
     * @dev Whitelist token for trading
     */
    function whitelistToken(address _token, bool _whitelisted) external onlyRole(ADMIN_ROLE) {
        whitelistedTokens[_token] = _whitelisted;
    }

    /**
     * @dev Blacklist address
     */
    function blacklistAddress(address _address, bool _blacklisted) external onlyRole(ADMIN_ROLE) {
        blacklistedAddresses[_address] = _blacklisted;
    }

    /**
     * @dev Update fee collector address
     */
    function updateFeeCollector(address _newFeeCollector) external onlyRole(ADMIN_ROLE) {
        feeCollector = _newFeeCollector;
    }

    /**
     * @dev Get trade information
     */
    function getTrade(bytes32 _tradeId) external view returns (Trade memory) {
        return trades[_tradeId];
    }

    /**
     * @dev Check if trade exists
     */
    function tradeExists(bytes32 _tradeId) external view returns (bool) {
        return trades[_tradeId].seller != address(0);
    }

    /**
     * @dev Emergency withdrawal (only in extreme circumstances)
     */
    function emergencyWithdraw(
        bytes32 _tradeId,
        address _to
    ) external onlyRole(EMERGENCY_ROLE) {
        Trade storage trade = trades[_tradeId];
        
        if (trade.state == TradeState.NONE) revert TradeNotFound();
        
        trade.state = TradeState.EMERGENCY_HALT;
        
        IERC20 token = IERC20(trade.tokenAddress);
        uint256 totalAmount = trade.amount + trade.platformFee + trade.securityDeposit;
        token.safeTransfer(_to, totalAmount);
        totalEscrowedAmount -= totalAmount;
    }
}
