const hre = require("hardhat");

async function main() {
  console.log("🔍 Verifying OrrangeEscrow Contract on Etherscan...");
  console.log("================================================");

  // Contract address from deployment (update this with actual address)
  const contractAddress = process.env.CONTRACT_ADDRESS;
  
  if (!contractAddress) {
    console.error("❌ CONTRACT_ADDRESS environment variable not set!");
    console.error("📋 Set it with: export CONTRACT_ADDRESS=0x...");
    process.exit(1);
  }

  // Deployment parameters (should match deployment script)
  const constructorArguments = [
    process.env.PLATFORM_FEE_BASIS_POINTS || 50,
    process.env.SECURITY_DEPOSIT_BASIS_POINTS || 100,
    process.env.MIN_TRADE_AMOUNT || "1000000000000000", // 0.001 ETH
    process.env.MAX_TRADE_AMOUNT || "1000000000000000000000", // 1000 ETH
    process.env.EMERGENCY_DELAY_HOURS || 24
  ];

  console.log("📋 Verification Details:");
  console.log(`   Contract Address: ${contractAddress}`);
  console.log(`   Constructor Arguments: ${JSON.stringify(constructorArguments)}`);

  try {
    // Verify contract on Etherscan
    await hre.run("verify:verify", {
      address: contractAddress,
      constructorArguments: constructorArguments,
      contract: "contracts/OrrangeEscrow.sol:OrrangeEscrow"
    });

    console.log("✅ Contract verification successful!");
    console.log(`🌐 View on Etherscan: https://sepolia.etherscan.io/address/${contractAddress}#code`);
    
  } catch (error) {
    if (error.message.includes("Already Verified")) {
      console.log("✅ Contract already verified on Etherscan");
      console.log(`🌐 View on Etherscan: https://sepolia.etherscan.io/address/${contractAddress}#code`);
    } else {
      console.error("❌ Verification failed:", error.message);
      throw error;
    }
  }
}

main()
  .then(() => {
    console.log("\n🎉 ETHERSCAN VERIFICATION COMPLETE!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ VERIFICATION FAILED!");
    console.error("Error:", error.message);
    process.exit(1);
  });
