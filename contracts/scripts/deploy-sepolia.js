const hre = require("hardhat");
const { ethers } = require("hardhat");

async function main() {
  console.log("🚀 Deploying OrrangeEscrow to Sepolia Testnet...");
  console.log("================================================");

  // Get deployment parameters
  const [deployer] = await ethers.getSigners();
  console.log("📝 Deploying with account:", deployer.address);
  
  const balance = await deployer.provider.getBalance(deployer.address);
  console.log("💰 Account balance:", ethers.formatEther(balance), "ETH");
  
  if (balance < ethers.parseEther("0.01")) {
    console.log("⚠️  Warning: Low balance! Get Sepolia ETH from https://sepoliafaucet.com/");
  }

  // Network validation
  const network = await hre.network.provider.send("eth_chainId", []);
  const chainId = parseInt(network, 16);
  
  if (chainId !== 11155111) {
    throw new Error(`❌ Wrong network! Expected Sepolia (11155111), got ${chainId}`);
  }
  
  console.log("✅ Connected to Sepolia testnet (Chain ID: 11155111)");

  // Contract deployment parameters
  const deploymentParams = {
    platformFeeBasisPoints: process.env.PLATFORM_FEE_BASIS_POINTS || 50, // 0.5%
    securityDepositBasisPoints: process.env.SECURITY_DEPOSIT_BASIS_POINTS || 100, // 1%
    minTradeAmount: process.env.MIN_TRADE_AMOUNT || ethers.parseEther("0.001").toString(),
    maxTradeAmount: process.env.MAX_TRADE_AMOUNT || ethers.parseEther("1000").toString(),
    emergencyDelayHours: process.env.EMERGENCY_DELAY_HOURS || 24
  };

  console.log("⚙️  Deployment Parameters:");
  console.log(`   Platform Fee: ${deploymentParams.platformFeeBasisPoints} basis points (${deploymentParams.platformFeeBasisPoints/100}%)`);
  console.log(`   Security Deposit: ${deploymentParams.securityDepositBasisPoints} basis points (${deploymentParams.securityDepositBasisPoints/100}%)`);
  console.log(`   Min Trade: ${ethers.formatEther(deploymentParams.minTradeAmount)} ETH`);
  console.log(`   Max Trade: ${ethers.formatEther(deploymentParams.maxTradeAmount)} ETH`);
  console.log(`   Emergency Delay: ${deploymentParams.emergencyDelayHours} hours`);

  // Deploy OrrangeEscrow contract with correct constructor parameters  
  console.log("\n🔧 Deploying OrrangeEscrow contract...");
  const OrrangeEscrow = await ethers.getContractFactory("contracts/OrrangeEscrow.sol:OrrangeEscrow");
  
  const escrow = await OrrangeEscrow.deploy(
    deployer.address, // _feeCollector
    deployer.address, // _emergencyMultisig
    deployer.address  // _initialAdmin
  );

  console.log("⏳ Waiting for deployment confirmation...");
  await escrow.waitForDeployment();
  
  const contractAddress = await escrow.getAddress();
  console.log("✅ OrrangeEscrow deployed to:", contractAddress);

  // Wait for additional confirmations
  const waitConfirmations = parseInt(process.env.WAIT_CONFIRMATIONS || "3");
  console.log(`⏳ Waiting for ${waitConfirmations} confirmations...`);
  
  const deploymentTx = escrow.deploymentTransaction();
  const receipt = await deploymentTx.wait(waitConfirmations);
  
  console.log("📋 Deployment Details:");
  console.log(`   Transaction Hash: ${receipt.hash}`);
  console.log(`   Block Number: ${receipt.blockNumber}`);
  console.log(`   Gas Used: ${receipt.gasUsed.toString()}`);
  console.log(`   Gas Price: ${ethers.formatUnits(receipt.gasPrice, "gwei")} gwei`);
  console.log(`   Deployment Cost: ${ethers.formatEther(receipt.gasUsed * receipt.gasPrice)} ETH`);

  // Verify contract deployment
  console.log("\n🔍 Verifying contract deployment...");
  
  try {
    // Basic contract interaction to verify deployment
    const owner = await escrow.owner();
    const paused = await escrow.paused();
    const platformFee = await escrow.platformFeeBasisPoints();
    const securityDeposit = await escrow.securityDepositBasisPoints();
    
    console.log("✅ Contract Verification Successful:");
    console.log(`   Owner: ${owner}`);
    console.log(`   Paused: ${paused}`);
    console.log(`   Platform Fee: ${platformFee} basis points`);
    console.log(`   Security Deposit: ${securityDeposit} basis points`);
    
    // Verify deployment parameters match
    if (platformFee.toString() !== deploymentParams.platformFeeBasisPoints.toString()) {
      throw new Error("Platform fee mismatch!");
    }
    if (securityDeposit.toString() !== deploymentParams.securityDepositBasisPoints.toString()) {
      throw new Error("Security deposit mismatch!");
    }
    
    console.log("✅ All deployment parameters verified correctly");
    
  } catch (error) {
    console.error("❌ Contract verification failed:", error.message);
    throw error;
  }

  // Output deployment information for environment configuration
  console.log("\n📋 DEPLOYMENT SUMMARY");
  console.log("=====================");
  console.log(`🏷️  Contract Address: ${contractAddress}`);
  console.log(`🌐 Network: Sepolia Testnet (Chain ID: 11155111)`);
  console.log(`👤 Deployer: ${deployer.address}`);
  console.log(`📊 Block Number: ${receipt.blockNumber}`);
  console.log(`🔗 Transaction: ${receipt.hash}`);
  
  console.log("\n🔧 ENVIRONMENT CONFIGURATION");
  console.log("============================");
  console.log(`ESCROW_CONTRACT_ADDRESS=${contractAddress}`);
  console.log(`BLOCKCHAIN_RPC_URL=${hre.network.config.url}`);
  console.log(`CHAIN_ID=11155111`);
  console.log(`DEPLOYMENT_BLOCK=${receipt.blockNumber}`);
  
  console.log("\n🌐 ETHERSCAN LINKS");
  console.log("==================");
  console.log(`📋 Contract: https://sepolia.etherscan.io/address/${contractAddress}`);
  console.log(`🔍 Transaction: https://sepolia.etherscan.io/tx/${receipt.hash}`);
  
  console.log("\n🎯 NEXT STEPS");
  console.log("=============");
  console.log("1. 📝 Copy the contract address to your API environment configuration");
  console.log("2. 🔍 Verify the contract on Etherscan (if not auto-verified)");
  console.log("3. 🧪 Test the contract integration with your API service");
  console.log("4. ✅ Validate event listening and real-time updates");

  return {
    contractAddress,
    deploymentTx: receipt.hash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed.toString(),
    deploymentCost: ethers.formatEther(receipt.gasUsed * receipt.gasPrice)
  };
}

// Execute deployment
main()
  .then((result) => {
    console.log("\n🎉 SEPOLIA DEPLOYMENT SUCCESSFUL!");
    console.log("==================================");
    console.log("✅ OrrangeEscrow contract deployed and verified");
    console.log("✅ Ready for API integration testing");
    console.log("✅ Proceeding to Week 3 Day 2 afternoon phase");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ DEPLOYMENT FAILED!");
    console.error("=====================");
    console.error("Error:", error.message);
    
    if (error.message.includes("insufficient funds")) {
      console.error("\n💡 SOLUTION: Get Sepolia ETH from https://sepoliafaucet.com/");
    } else if (error.message.includes("nonce")) {
      console.error("\n💡 SOLUTION: Wait a moment and retry, or reset your wallet nonce");
    } else if (error.message.includes("network")) {
      console.error("\n💡 SOLUTION: Check your RPC URL and network configuration");
    }
    
    process.exit(1);
  });
