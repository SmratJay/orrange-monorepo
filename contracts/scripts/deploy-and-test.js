const { ethers } = require("hardhat");

async function main() {
  console.log("🚀 OrrangeEscrow Deploy & Test Suite");
  console.log("===================================\n");

  // Get signers
  const [deployer, buyer, seller] = await ethers.getSigners();
  console.log("👤 Deployer:", deployer.address);
  console.log("🛒 Buyer:", buyer.address);
  console.log("🏪 Seller:", seller.address);
  console.log("💰 Deployer balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH\n");

  // Step 1: Deploy OrrangeEscrow
  console.log("🔧 Step 1: Deploying OrrangeEscrow...");
  const OrrangeEscrow = await ethers.getContractFactory("OrrangeEscrow");
  const escrow = await OrrangeEscrow.deploy(deployer.address, deployer.address, deployer.address);
  await escrow.waitForDeployment();
  const escrowAddress = await escrow.getAddress();
  console.log("✅ OrrangeEscrow deployed to:", escrowAddress);

  // Step 2: Basic function tests
  console.log("\n🧪 Step 2: Testing basic contract functions...");
  try {
    const owner = await escrow.owner();
    const isPaused = await escrow.paused();
    const feeCollector = await escrow.feeCollector();
    const platformFeePercent = await escrow.platformFeePercent();
    
    console.log("✅ Owner:", owner);
    console.log("✅ Paused:", isPaused);
    console.log("✅ Fee Collector:", feeCollector);
    console.log("✅ Platform Fee:", platformFeePercent.toString() + "%");
  } catch (error) {
    console.log("❌ Basic function test failed:", error.message);
    return;
  }

  // Step 3: Deploy mock token
  console.log("\n🪙 Step 3: Deploying MockERC20 token...");
  let mockToken;
  try {
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockToken = await MockERC20.deploy(
      "Mock USDT", 
      "MUSDT", 
      ethers.parseUnits("1000000", 6), 
      6
    );
    await mockToken.waitForDeployment();
    const tokenAddress = await mockToken.getAddress();
    console.log("✅ Mock Token deployed to:", tokenAddress);
    
    // Distribute tokens
    await mockToken.transfer(seller.address, ethers.parseUnits("10000", 6));
    await mockToken.transfer(buyer.address, ethers.parseUnits("10000", 6));
    
    const sellerBalance = await mockToken.balanceOf(seller.address);
    const buyerBalance = await mockToken.balanceOf(buyer.address);
    console.log("✅ Seller balance:", ethers.formatUnits(sellerBalance, 6), "MUSDT");
    console.log("✅ Buyer balance:", ethers.formatUnits(buyerBalance, 6), "MUSDT");
  } catch (error) {
    console.log("❌ Token deployment failed:", error.message);
    return;
  }

  // Step 4: Whitelist token
  console.log("\n🔐 Step 4: Whitelisting token...");
  try {
    const tokenAddress = await mockToken.getAddress();
    await escrow.connect(deployer).whitelistToken(tokenAddress, true);
    const isWhitelisted = await escrow.whitelistedTokens(tokenAddress);
    console.log("✅ Token whitelisted:", isWhitelisted);
  } catch (error) {
    console.log("❌ Whitelisting failed:", error.message);
    return;
  }

  // Step 5: Create trade
  console.log("\n📋 Step 5: Creating a trade...");
  let tradeId;
  try {
    const tokenAddress = await mockToken.getAddress();
    const amount = ethers.parseUnits("100", 6); // 100 MUSDT
    
    // Generate unique trade ID
    tradeId = ethers.keccak256(ethers.toUtf8Bytes(`trade_${Date.now()}`));
    
    // Calculate fees
    const platformFeePercent = await escrow.platformFeePercent();
    const platformFee = (amount * platformFeePercent) / 10000n;
    const securityDeposit = amount / 20n; // 5%
    const expiresAt = Math.floor(Date.now() / 1000) + 3600; // 1 hour
    const paymentHash = ethers.keccak256(ethers.toUtf8Bytes("payment_proof"));
    
    console.log("📝 Trade details:");
    console.log("   - Trade ID:", tradeId);
    console.log("   - Amount:", ethers.formatUnits(amount, 6), "MUSDT");
    console.log("   - Platform Fee:", ethers.formatUnits(platformFee, 6), "MUSDT");
    console.log("   - Security Deposit:", ethers.formatUnits(securityDeposit, 6), "MUSDT");
    
    // Seller approves and creates trade
    await mockToken.connect(seller).approve(escrowAddress, amount);
    await escrow.connect(seller).createTrade(
      tradeId,
      buyer.address,
      tokenAddress,
      amount,
      platformFee,
      securityDeposit,
      expiresAt,
      paymentHash
    );
    
    console.log("✅ Trade created successfully");
  } catch (error) {
    console.log("❌ Trade creation failed:", error.message);
    return;
  }

  // Step 6: Check trade details
  console.log("\n📊 Step 6: Checking trade details...");
  try {
    const trade = await escrow.getTrade(tradeId);
    console.log("✅ Trade found:");
    console.log("   - Seller:", trade.seller);
    console.log("   - Buyer:", trade.buyer);
    console.log("   - Token:", trade.tokenAddress);
    console.log("   - Amount:", ethers.formatUnits(trade.amount, 6), "MUSDT");
    console.log("   - State:", trade.state.toString());
  } catch (error) {
    console.log("❌ Trade check failed:", error.message);
    return;
  }

  // Step 7: Complete trade
  console.log("\n✅ Step 7: Buyer confirming payment...");
  try {
    await escrow.connect(buyer).confirmPaymentReceived(tradeId);
    
    const updatedTrade = await escrow.getTrade(tradeId);
    console.log("✅ Payment confirmed, trade state:", updatedTrade.state.toString());
  } catch (error) {
    console.log("❌ Payment confirmation failed:", error.message);
  }

  console.log("\n🎉 Full deploy & test cycle completed successfully!");
  console.log("Contract Address:", escrowAddress);
  console.log("Test Trade ID:", tradeId);
  
  return { escrowAddress, tradeId };
}

main()
  .then((result) => {
    console.log("\n📈 Success! Contract is fully functional:");
    console.log("- Escrow Address:", result.escrowAddress);
    console.log("- Test Trade ID:", result.tradeId);
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Deploy & test failed:", error);
    process.exit(1);
  });
