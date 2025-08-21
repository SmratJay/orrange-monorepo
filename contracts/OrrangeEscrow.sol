// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/**
 * @title OrrangeEscrow
 * @dev Ultra-secure escrow contract for P2P crypto trading
 * @notice This contract handles escrow for trades with maximum security
 */
contract OrrangeEscrow is ReentrancyGuard, Pausable, Ownable, AccessControl {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

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

    // Trade structure with all security fields
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
        bytes32 sellerSignature;
        bytes32 buyerSignature;
        uint256 nonce;
        bool requiresKYC;
        bytes32 paymentHash; // Hash of payment method details
    }

    // Security parameters
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

    // Risk assessment structure
    struct RiskAssessment {
        uint256 userRiskScore;
        uint256 tradeRiskScore;
        bool isHighRisk;
        bytes32[] riskFactors;
    }

    // State variables
    mapping(bytes32 => Trade) public trades;
    mapping(address => uint256) public dailyVolume;
    mapping(address => uint256) public lastTradeTimestamp;
    mapping(address => bool) public blacklistedAddresses;
    mapping(address => bool) public whitelistedTokens;
    mapping(bytes32 => bool) public usedNonces;
    mapping(address => uint256) public userRiskScores;
    
    SecurityConfig public securityConfig;
    address public feeCollector;
    address public emergencyMultisig;
    uint256 public totalEscrowedAmount;
    uint256 public platformFeePercent = 50; // 0.5% (50/10000)
    
    // Emergency controls
    bool public emergencyHalt = false;
    uint256 public emergencyActivatedAt;
    mapping(bytes32 => uint256) public emergencyWithdrawRequests;
    
    // Events
    event TradeCreated(
        bytes32 indexed tradeId, 
        address indexed seller, 
        address indexed buyer, 
        address tokenAddress, 
        uint256 amount,
        uint256 expiresAt
    );
    event TradeCompleted(bytes32 indexed tradeId, uint256 completedAt);
    event TradeRefunded(bytes32 indexed tradeId, uint256 refundedAt);
    event TradeDisputed(bytes32 indexed tradeId, address disputedBy, uint256 disputedAt);
    event TradeCancelled(bytes32 indexed tradeId, uint256 cancelledAt);
    event EmergencyHaltActivated(uint256 activatedAt, address activatedBy);
    event EmergencyHaltDeactivated(uint256 deactivatedAt, address deactivatedBy);
    event SecurityConfigUpdated(address updatedBy, uint256 updatedAt);
    event RiskScoreUpdated(address user, uint256 newScore, uint256 updatedAt);
    event SuspiciousActivityDetected(bytes32 indexed tradeId, address user, string reason);

    // Custom errors for gas efficiency
    error TradeAlreadyExists();
    error TradeNotFound();
    error InvalidTradeState(TradeState expected, TradeState actual);
    error UnauthorizedAccess();
    error UnauthorizedSender();
    error InsufficientFunds();
    error TradeExpired();
    error InvalidSignature();
    error ExceedsMaxAmount();
    error ExceedsDailyLimit();
    error BlacklistedAddress();
    error UnsupportedToken();
    error EmergencyHaltActive();
    error InvalidNonce();
    error HighRiskTransaction();

    constructor(
        address _feeCollector,
        address _emergencyMultisig,
        address _initialAdmin
    ) {
        feeCollector = _feeCollector;
        emergencyMultisig = _emergencyMultisig;
        
        // Set up roles
        _grantRole(DEFAULT_ADMIN_ROLE, _initialAdmin);
        _grantRole(ADMIN_ROLE, _initialAdmin);
        _grantRole(EMERGENCY_ROLE, _emergencyMultisig);
        
        // Initialize security configuration
        securityConfig = SecurityConfig({
            minTradeAmount: 1e18, // 1 token minimum
            maxTradeAmount: 1000000e18, // 1M tokens maximum
            maxDailyVolume: 10000000e18, // 10M tokens daily limit
            securityDepositPercent: 100, // 1% security deposit
            emergencyDelayPeriod: 24 hours,
            disputeTimeWindow: 7 days,
            autoRefundDelay: 3 days,
            requireMultisigForLargeAmounts: true,
            multisigThreshold: 100000e18 // 100K tokens
        });
    }

    /**
     * @dev Create a new trade with maximum security checks
     */
    function createTrade(
        bytes32 _tradeId,
        address _buyer,
        address _tokenAddress,
        uint256 _amount,
        uint256 _expiresAt,
        bytes32 _paymentHash,
        bytes32 _sellerSignature,
        uint256 _nonce,
        bool _requiresKYC
    ) external nonReentrant whenNotPaused {
        // Security checks
        if (emergencyHalt) revert EmergencyHaltActive();
        if (blacklistedAddresses[msg.sender] || blacklistedAddresses[_buyer]) 
            revert BlacklistedAddress();
        if (!whitelistedTokens[_tokenAddress]) revert UnsupportedToken();
        if (trades[_tradeId].state != TradeState.NONE) revert TradeAlreadyExists();
        if (usedNonces[_nonce]) revert InvalidNonce();
        if (_amount < securityConfig.minTradeAmount || _amount > securityConfig.maxTradeAmount) 
            revert ExceedsMaxAmount();
        
        // Daily volume check
        if (dailyVolume[msg.sender] + _amount > securityConfig.maxDailyVolume) 
            revert ExceedsDailyLimit();
        
        // Risk assessment
        RiskAssessment memory riskAssessment = _assessTradeRisk(msg.sender, _buyer, _amount);
        if (riskAssessment.isHighRisk && !hasRole(ADMIN_ROLE, msg.sender)) 
            revert HighRiskTransaction();
        
        // Verify seller signature
        bytes32 messageHash = keccak256(abi.encodePacked(
            _tradeId, _buyer, _tokenAddress, _amount, _nonce, block.chainid
        )).toEthSignedMessageHash();
        
        if (messageHash.recover(_sellerSignature) != msg.sender) 
            revert InvalidSignature();
        
        // Calculate fees and deposits
        uint256 platformFee = (_amount * platformFeePercent) / 10000;
        uint256 securityDeposit = (_amount * securityConfig.securityDepositPercent) / 10000;
        uint256 totalRequired = _amount + platformFee + securityDeposit;
        
        // Transfer tokens to escrow
        IERC20 token = IERC20(_tokenAddress);
        token.safeTransferFrom(msg.sender, address(this), totalRequired);
        
        // Create trade record
        trades[_tradeId] = Trade({
            tradeId: _tradeId,
            seller: msg.sender,
            buyer: _buyer,
            tokenAddress: _tokenAddress,
            amount: _amount,
            platformFee: platformFee,
            securityDeposit: securityDeposit,
            createdAt: block.timestamp,
            expiresAt: _expiresAt,
            lastActivityAt: block.timestamp,
            state: TradeState.ACTIVE,
            sellerSignature: _sellerSignature,
            buyerSignature: bytes32(0),
            nonce: _nonce,
            requiresKYC: _requiresKYC,
            paymentHash: _paymentHash
        });
        
        // Update tracking variables
        usedNonces[_nonce] = true;
        dailyVolume[msg.sender] += _amount;
        totalEscrowedAmount += totalRequired;
        lastTradeTimestamp[msg.sender] = block.timestamp;
        
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
     * @dev Complete trade with buyer confirmation (ADMIN ONLY - for disputes)
     * @notice This is backup method for disputed trades requiring admin intervention
     */
    function completeTrade(
        bytes32 _tradeId,
        bytes32 _buyerSignature
    ) external nonReentrant onlyRole(ADMIN_ROLE) {
        Trade storage trade = trades[_tradeId];
        
        if (trade.state != TradeState.ACTIVE) 
            revert InvalidTradeState(TradeState.ACTIVE, trade.state);
        if (block.timestamp > trade.expiresAt) revert TradeExpired();
        
        // Verify buyer signature for payment confirmation
        bytes32 messageHash = keccak256(abi.encodePacked(
            _tradeId, "PAYMENT_CONFIRMED", block.timestamp
        )).toEthSignedMessageHash();
        
        if (messageHash.recover(_buyerSignature) != trade.buyer) 
            revert InvalidSignature();
        
        trade.state = TradeState.COMPLETED;
        trade.buyerSignature = _buyerSignature;
        trade.lastActivityAt = block.timestamp;
        
        // Transfer tokens
        IERC20 token = IERC20(trade.tokenAddress);
        token.safeTransfer(trade.buyer, trade.amount);
        token.safeTransfer(feeCollector, trade.platformFee);
        token.safeTransfer(trade.seller, trade.securityDeposit); // Return security deposit
        
        totalEscrowedAmount -= (trade.amount + trade.platformFee + trade.securityDeposit);
        
        emit TradeCompleted(_tradeId, block.timestamp);
    }

    /**
     * @dev Refund trade with enhanced security
     */
    function refundTrade(
        bytes32 _tradeId,
        string memory _reason
    ) external nonReentrant onlyRole(ADMIN_ROLE) {
        Trade storage trade = trades[_tradeId];
        
        if (trade.state != TradeState.ACTIVE && trade.state != TradeState.DISPUTED) 
            revert InvalidTradeState(TradeState.ACTIVE, trade.state);
        
        trade.state = TradeState.REFUNDED;
        trade.lastActivityAt = block.timestamp;
        
        // Return all funds to seller
        IERC20 token = IERC20(trade.tokenAddress);
        uint256 totalRefund = trade.amount + trade.platformFee + trade.securityDeposit;
        token.safeTransfer(trade.seller, totalRefund);
        
        totalEscrowedAmount -= totalRefund;
        
        emit TradeRefunded(_tradeId, block.timestamp);
    }

    /**
     * @dev Open dispute with evidence hash
     */
    function disputeTrade(
        bytes32 _tradeId,
        bytes32 _evidenceHash,
        string memory _reason
    ) external nonReentrant {
        Trade storage trade = trades[_tradeId];
        
        if (trade.state != TradeState.ACTIVE) 
            revert InvalidTradeState(TradeState.ACTIVE, trade.state);
        if (msg.sender != trade.seller && msg.sender != trade.buyer) 
            revert UnauthorizedAccess();
        if (block.timestamp > trade.expiresAt + securityConfig.disputeTimeWindow) 
            revert TradeExpired();
        
        trade.state = TradeState.DISPUTED;
        trade.lastActivityAt = block.timestamp;
        
        emit TradeDisputed(_tradeId, msg.sender, block.timestamp);
    }

    /**
     * @dev Resolve dispute with flexible resolution
     */
    function resolveDispute(
        bytes32 _tradeId,
        uint256 _buyerAmount,
        uint256 _sellerAmount,
        uint256 _platformAmount,
        string memory _resolution
    ) external nonReentrant onlyRole(MODERATOR_ROLE) {
        Trade storage trade = trades[_tradeId];
        
        if (trade.state != TradeState.DISPUTED) 
            revert InvalidTradeState(TradeState.DISPUTED, trade.state);
        
        uint256 totalAmount = trade.amount + trade.securityDeposit;
        if (_buyerAmount + _sellerAmount + _platformAmount != totalAmount) {
            revert("Invalid distribution amounts");
        }
        
        trade.state = TradeState.COMPLETED;
        trade.lastActivityAt = block.timestamp;
        
        IERC20 token = IERC20(trade.tokenAddress);
        
        if (_buyerAmount > 0) {
            token.safeTransfer(trade.buyer, _buyerAmount);
        }
        if (_sellerAmount > 0) {
            token.safeTransfer(trade.seller, _sellerAmount);
        }
        if (_platformAmount > 0) {
            token.safeTransfer(feeCollector, _platformAmount + trade.platformFee);
        } else {
            token.safeTransfer(feeCollector, trade.platformFee);
        }
        
        totalEscrowedAmount -= (trade.amount + trade.platformFee + trade.securityDeposit);
        
        emit TradeCompleted(_tradeId, block.timestamp);
    }

    /**
     * @dev Emergency halt mechanism
     */
    function activateEmergencyHalt() external onlyRole(EMERGENCY_ROLE) {
        emergencyHalt = true;
        emergencyActivatedAt = block.timestamp;
        _pause();
        
        emit EmergencyHaltActivated(block.timestamp, msg.sender);
    }

    /**
     * @dev Deactivate emergency halt
     */
    function deactivateEmergencyHalt() external onlyRole(EMERGENCY_ROLE) {
        require(block.timestamp >= emergencyActivatedAt + securityConfig.emergencyDelayPeriod, 
                "Emergency delay period not met");
        
        emergencyHalt = false;
        _unpause();
        
        emit EmergencyHaltDeactivated(block.timestamp, msg.sender);
    }

    /**
     * @dev Risk assessment algorithm
     */
    function _assessTradeRisk(
        address _seller,
        address _buyer,
        uint256 _amount
    ) internal view returns (RiskAssessment memory) {
        uint256 sellerScore = userRiskScores[_seller];
        uint256 buyerScore = userRiskScores[_buyer];
        uint256 tradeScore = 0;
        
        // Calculate trade risk factors
        if (_amount > securityConfig.maxTradeAmount / 2) tradeScore += 20;
        if (block.timestamp - lastTradeTimestamp[_seller] < 1 hours) tradeScore += 15;
        if (dailyVolume[_seller] > securityConfig.maxDailyVolume / 2) tradeScore += 25;
        
        uint256 totalRiskScore = sellerScore + buyerScore + tradeScore;
        bool isHighRisk = totalRiskScore > 70; // Risk threshold
        
        bytes32[] memory riskFactors = new bytes32[](0);
        
        return RiskAssessment({
            userRiskScore: sellerScore + buyerScore,
            tradeRiskScore: tradeScore,
            isHighRisk: isHighRisk,
            riskFactors: riskFactors
        });
    }

    /**
     * @dev Update user risk score
     */
    function updateRiskScore(
        address _user,
        uint256 _newScore
    ) external onlyRole(ADMIN_ROLE) {
        userRiskScores[_user] = _newScore;
        emit RiskScoreUpdated(_user, _newScore, block.timestamp);
    }

    /**
     * @dev Add/remove addresses from blacklist
     */
    function updateBlacklist(
        address _address,
        bool _isBlacklisted
    ) external onlyRole(ADMIN_ROLE) {
        blacklistedAddresses[_address] = _isBlacklisted;
    }

    /**
     * @dev Add/remove tokens from whitelist
     */
    function updateTokenWhitelist(
        address _token,
        bool _isWhitelisted
    ) external onlyRole(ADMIN_ROLE) {
        whitelistedTokens[_token] = _isWhitelisted;
    }

    /**
     * @dev Update security configuration
     */
    function updateSecurityConfig(
        SecurityConfig memory _newConfig
    ) external onlyRole(ADMIN_ROLE) {
        securityConfig = _newConfig;
        emit SecurityConfigUpdated(msg.sender, block.timestamp);
    }

    /**
     * @dev Get trade details with security info
     */
    function getTradeDetails(bytes32 _tradeId) external view returns (
        Trade memory trade,
        RiskAssessment memory riskAssessment
    ) {
        trade = trades[_tradeId];
        riskAssessment = _assessTradeRisk(trade.seller, trade.buyer, trade.amount);
        return (trade, riskAssessment);
    }

    /**
     * @dev Auto-refund expired trades (can be called by anyone)
     */
    function autoRefundExpiredTrade(bytes32 _tradeId) external nonReentrant {
        Trade storage trade = trades[_tradeId];
        
        require(trade.state == TradeState.ACTIVE, "Trade not active");
        require(block.timestamp > trade.expiresAt + securityConfig.autoRefundDelay, 
                "Auto-refund delay not met");
        
        trade.state = TradeState.REFUNDED;
        trade.lastActivityAt = block.timestamp;
        
        // Return all funds to seller
        IERC20 token = IERC20(trade.tokenAddress);
        uint256 totalRefund = trade.amount + trade.platformFee + trade.securityDeposit;
        token.safeTransfer(trade.seller, totalRefund);
        
        totalEscrowedAmount -= totalRefund;
        
        emit TradeRefunded(_tradeId, block.timestamp);
    }

    /**
     * @dev Circuit breaker for suspicious activity
     */
    function circuitBreaker(
        bytes32 _tradeId,
        string memory _reason
    ) external onlyRole(EMERGENCY_ROLE) {
        Trade storage trade = trades[_tradeId];
        trade.state = TradeState.EMERGENCY_HALT;
        
        emit SuspiciousActivityDetected(_tradeId, trade.seller, _reason);
    }

    /**
     * @dev View functions for monitoring
     */
    function getContractStats() external view returns (
        uint256 totalEscrowed,
        uint256 activeTradesCount,
        bool isEmergencyActive,
        uint256 emergencyTime
    ) {
        return (
            totalEscrowedAmount,
            0, // Would need to track this separately for gas efficiency
            emergencyHalt,
            emergencyActivatedAt
        );
    }
}
