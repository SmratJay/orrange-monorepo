const { ethers } = require("hardhat");
const crypto = require("crypto");

async function main() {
  console.log("🧪 OrrangeEscrow Contract Testing Suite");
  console.log("=====================================\n");

  // Get the contract
  const deploymentInfo = require("../deployments/hardhat.json");
  const OrrangeEscrow = await ethers.getContractFactory("OrrangeEscrow");
  const escrow = OrrangeEscrow.attach(deploymentInfo.contractAddress);
  
  // Get signers
  const [deployer, buyer, seller, feeCollector] = await ethers.getSigners();
  
  console.log("📍 Contract Address:", deploymentInfo.contractAddress);
  console.log("👤 Deployer:", deployer.address);
  console.log("🛒 Buyer:", buyer.address);
  console.log("🏪 Seller:", seller.address);
  console.log("🏦 Fee Collector:", feeCollector.address);
  
  console.log("\n🔍 Testing Contract Basic Functions...\n");
  
  // Test 1: Check initial state
  console.log("1️⃣ Testing initial contract state...");
  try {
    const owner = await escrow.owner();
    const isPaused = await escrow.paused();
    const totalEscrowed = await escrow.totalEscrowedAmount();
    const feeCollectorAddr = await escrow.feeCollector();
    const emergencyMultisig = await escrow.emergencyMultisig();
    
    console.log("   ✅ Contract Owner:", owner);
    console.log("   ✅ Contract Paused:", isPaused);
    console.log("   ✅ Total Escrowed Amount:", ethers.formatEther(totalEscrowed));
    console.log("   ✅ Fee Collector:", feeCollectorAddr);
    console.log("   ✅ Emergency Multisig:", emergencyMultisig);
  } catch (error) {
    console.log("   ❌ Error:", error.message);
  }
  
  // Test 2: Check platform fee
  console.log("\n2️⃣ Testing platform fee configuration...");
  try {
    const platformFeePercent = await escrow.platformFeePercent();
    console.log("   ✅ Platform Fee Percent:", platformFeePercent.toString() + "%");
  } catch (error) {
    console.log("   ❌ Error:", error.message);
  }
  
  // Test 3: Deploy a mock ERC20 token for testing
  console.log("\n3️⃣ Deploying mock ERC20 token for testing...");
  let mockToken;
  try {
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockToken = await MockERC20.deploy(
      "Mock USDT", 
      "MUSDT", 
      ethers.parseUnits("1000000", 6), // 1M tokens with 6 decimals
      6
    );
    await mockToken.waitForDeployment();
    const tokenAddress = await mockToken.getAddress();
    console.log("   ✅ Mock Token deployed at:", tokenAddress);
    
    // Give some tokens to buyer and seller
    await mockToken.transfer(buyer.address, ethers.parseUnits("10000", 6));
    await mockToken.transfer(seller.address, ethers.parseUnits("10000", 6));
    
    const buyerBalance = await mockToken.balanceOf(buyer.address);
    const sellerBalance = await mockToken.balanceOf(seller.address);
    console.log("   ✅ Buyer token balance:", ethers.formatUnits(buyerBalance, 6));
    console.log("   ✅ Seller token balance:", ethers.formatUnits(sellerBalance, 6));
  } catch (error) {
    console.log("   ❌ Error deploying mock token:", error.message);
    return;
  }
  
  // Test 4: Whitelist the mock token
  console.log("\n4️⃣ Whitelisting mock token...");
  try {
    const tokenAddress = await mockToken.getAddress();
    await escrow.connect(deployer).whitelistToken(tokenAddress, true);
    const isWhitelisted = await escrow.whitelistedTokens(tokenAddress);
    console.log("   ✅ Token whitelisted successfully:", isWhitelisted);
  } catch (error) {
    console.log("   ❌ Error whitelisting token:", error.message);
  }
  
  // Test 5: Create a trade with the proper signature
  console.log("\n5️⃣ Creating a P2P trade...");
  let tradeId;
  try {
    const tokenAddress = await mockToken.getAddress();
    const amount = ethers.parseUnits("100", 6); // 100 MUSDT
    
    // Generate a unique trade ID
    tradeId = ethers.keccak256(ethers.toUtf8Bytes(`trade_${Date.now()}_${Math.random()}`));
    
    // Calculate platform fee (assuming 0.5%)
    const platformFeePercent = await escrow.platformFeePercent();
    const platformFee = (amount * platformFeePercent) / 10000n;
    
    // Security deposit (assuming 5%)
    const securityDepositPercent = 500n; // 5%
    const securityDeposit = (amount * securityDepositPercent) / 10000n;
    
    // Expiry (1 day from now)
    const expiresAt = Math.floor(Date.now() / 1000) + (24 * 60 * 60);
    
    // Create payment hash (for demonstration)
    const paymentHash = ethers.keccak256(ethers.toUtf8Bytes("payment_proof_123"));
    
    console.log("   📋 Trade Parameters:");
    console.log("      - Trade ID:", tradeId);
    console.log("      - Token:", tokenAddress);
    console.log("      - Amount:", ethers.formatUnits(amount, 6));
    console.log("      - Platform Fee:", ethers.formatUnits(platformFee, 6));
    console.log("      - Security Deposit:", ethers.formatUnits(securityDeposit, 6));
    console.log("      - Expires At:", new Date(expiresAt * 1000).toISOString());
    
    // Seller approves escrow to spend tokens
    await mockToken.connect(seller).approve(await escrow.getAddress(), amount);
    
    // Create trade (called by seller)
    const tx = await escrow.connect(seller).createTrade(
      tradeId,
      buyer.address,
      tokenAddress,
      amount,
      platformFee,
      securityDeposit,
      expiresAt,
      paymentHash
    );
    await tx.wait();
    
    console.log("   ✅ Trade created successfully");
  } catch (error) {
    console.log("   ❌ Error creating trade:", error.message);
    console.log("   📝 Error details:", error);
    return;
  }
  
  // Test 6: Check trade details
  console.log("\n6️⃣ Checking trade details...");
  try {
    const trade = await escrow.getTrade(tradeId);
    console.log("   ✅ Trade Details:");
    console.log("      - Trade ID:", trade.tradeId);
    console.log("      - Seller:", trade.seller);
    console.log("      - Buyer:", trade.buyer);
    console.log("      - Token:", trade.tokenAddress);
    console.log("      - Amount:", ethers.formatUnits(trade.amount, 6));
    console.log("      - Platform Fee:", ethers.formatUnits(trade.platformFee, 6));
    console.log("      - Security Deposit:", ethers.formatUnits(trade.securityDeposit, 6));
    console.log("      - State:", trade.state.toString()); // 0 = Created
    console.log("      - Created At:", new Date(Number(trade.createdAt) * 1000).toISOString());
    console.log("      - Expires At:", new Date(Number(trade.expiresAt) * 1000).toISOString());
  } catch (error) {
    console.log("   ❌ Error fetching trade:", error.message);
  }
  
  // Test 7: Buyer confirms payment (this completes the trade)
  console.log("\n7️⃣ Buyer confirming payment received...");
  try {
    const tx = await escrow.connect(buyer).confirmPaymentReceived(tradeId);
    await tx.wait();
    console.log("   ✅ Payment confirmed by buyer");
    
    // Check updated status
    const trade = await escrow.getTrade(tradeId);
    console.log("   ✅ Trade State after confirmation:", trade.state.toString()); // Should be updated
  } catch (error) {
    console.log("   ❌ Error confirming payment:", error.message);
  }
  
  // Test 8: Check final balances
  console.log("\n8️⃣ Checking final balances...");
  try {
    const sellerTokenBalance = await mockToken.balanceOf(seller.address);
    const buyerTokenBalance = await mockToken.balanceOf(buyer.address);
    const escrowTokenBalance = await mockToken.balanceOf(await escrow.getAddress());
    const totalEscrowed = await escrow.totalEscrowedAmount();
    
    console.log("   ✅ Seller Token Balance:", ethers.formatUnits(sellerTokenBalance, 6));
    console.log("   ✅ Buyer Token Balance:", ethers.formatUnits(buyerTokenBalance, 6));
    console.log("   ✅ Escrow Token Balance:", ethers.formatUnits(escrowTokenBalance, 6));
    console.log("   ✅ Total Escrowed Amount:", ethers.formatEther(totalEscrowed));
  } catch (error) {
    console.log("   ❌ Error checking balances:", error.message);
  }
  
  // Test 9: Check security configuration
  console.log("\n9️⃣ Checking security configuration...");
  try {
    const securityConfig = await escrow.securityConfig();
    console.log("   ✅ Security Configuration:");
    console.log("      - Min Trade Amount:", ethers.formatEther(securityConfig.minTradeAmount));
    console.log("      - Max Trade Amount:", ethers.formatEther(securityConfig.maxTradeAmount));
    console.log("      - Max Daily Volume:", ethers.formatEther(securityConfig.maxDailyVolume));
    console.log("      - Security Deposit %:", securityConfig.securityDepositPercent.toString());
    console.log("      - Emergency Delay Period:", securityConfig.emergencyDelayPeriod.toString(), "seconds");
    console.log("      - Auto Refund Delay:", securityConfig.autoRefundDelay.toString(), "seconds");
    console.log("      - Require Multisig for Large Amounts:", securityConfig.requireMultisigForLargeAmounts);
  } catch (error) {
    console.log("   ❌ Error fetching security config:", error.message);
  }
  
  console.log("\n🎉 Contract Testing Complete!");
  console.log("=====================================");
  
  return {
    contractAddress: deploymentInfo.contractAddress,
    tradeId: tradeId
  };
}

main()
  .then((result) => {
    console.log("\n📊 Test Results Summary:");
    console.log("Contract Address:", result.contractAddress);
    console.log("Test Trade ID:", result.tradeId);
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Testing failed:", error);
    process.exit(1);
  });
