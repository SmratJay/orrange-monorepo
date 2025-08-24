const { ethers } = require("hardhat");

async function main() {
  console.log("🔍 OrrangeEscrow Contract Verification");
  console.log("====================================\n");

  try {
    // Get deployment info
    const deploymentInfo = require("../deployments/hardhat.json");
    console.log("📍 Contract Address:", deploymentInfo.contractAddress);
    
    // Get contract factory and attach
    const OrrangeEscrow = await ethers.getContractFactory("OrrangeEscrow");
    const escrow = OrrangeEscrow.attach(deploymentInfo.contractAddress);
    
    console.log("✅ Contract attached successfully");
    
    // Try to call a simple view function
    console.log("\n🧪 Testing basic contract functions...");
    
    // Test owner function
    try {
      const owner = await escrow.owner();
      console.log("✅ Owner:", owner);
    } catch (error) {
      console.log("❌ Owner call failed:", error.reason || error.message);
    }
    
    // Test paused function  
    try {
      const paused = await escrow.paused();
      console.log("✅ Paused:", paused);
    } catch (error) {
      console.log("❌ Paused call failed:", error.reason || error.message);
    }
    
    // Test feeCollector
    try {
      const feeCollector = await escrow.feeCollector();
      console.log("✅ Fee Collector:", feeCollector);
    } catch (error) {
      console.log("❌ Fee Collector call failed:", error.reason || error.message);
    }
    
    // Check if code exists at address
    const code = await ethers.provider.getCode(deploymentInfo.contractAddress);
    console.log("\n📝 Contract Code Length:", code.length);
    console.log("📝 Has Code:", code !== "0x");
    
    if (code === "0x") {
      console.log("❌ No contract code found at address - contract may not be deployed");
      return;
    }
    
    console.log("\n🎉 Contract verification complete!");
    
  } catch (error) {
    console.error("❌ Verification failed:", error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
  });
