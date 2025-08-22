const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();
  
  console.log("🚀 Deploying OrrangeEscrow contract...");
  console.log("📡 Network:", await ethers.provider.getNetwork().then(n => n.name));
  console.log("👤 Deploying with account:", deployer.address);
  console.log("💰 Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

  // Deploy the contract
  console.log("\n📋 Deploying OrrangeEscrow...");
  const OrrangeEscrow = await ethers.getContractFactory("OrrangeEscrow");
  
  // Constructor parameters
  const feeCollector = process.env.FEE_COLLECTOR_ADDRESS || deployer.address;
  const emergencyMultisig = process.env.EMERGENCY_MULTISIG_ADDRESS || deployer.address;
  
  console.log("🏦 Fee Collector:", feeCollector);
  console.log("🔒 Emergency Multisig:", emergencyMultisig);
  
  const escrow = await OrrangeEscrow.deploy(feeCollector, emergencyMultisig);
  
  console.log("⏳ Waiting for deployment transaction...");
  await escrow.waitForDeployment();
  
  const contractAddress = await escrow.getAddress();
  console.log("✅ OrrangeEscrow deployed to:", contractAddress);
  
  // Save deployment information
  const deploymentInfo = {
    network: await ethers.provider.getNetwork().then(n => n.name),
    chainId: await ethers.provider.getNetwork().then(n => n.chainId.toString()),
    contractAddress: contractAddress,
    deployer: deployer.address,
    feeCollector: feeCollector,
    emergencyMultisig: emergencyMultisig,
    blockNumber: await ethers.provider.getBlockNumber(),
    timestamp: new Date().toISOString(),
    transactionHash: escrow.deploymentTransaction()?.hash,
  };
  
  // Create deployments directory if it doesn't exist
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }
  
  // Save deployment info
  const networkName = await ethers.provider.getNetwork().then(n => n.name);
  const deploymentFile = path.join(deploymentsDir, `${networkName}.json`);
  fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));
  
  console.log(`📄 Deployment info saved to: ${deploymentFile}`);
  
  // Update environment file template
  const envExample = `
# OrrangeEscrow Contract - ${networkName.toUpperCase()}
ESCROW_CONTRACT_ADDRESS_${networkName.toUpperCase()}=${contractAddress}
ESCROW_CONTRACT_DEPLOYER_${networkName.toUpperCase()}=${deployer.address}
ESCROW_CONTRACT_BLOCK_${networkName.toUpperCase()}=${await ethers.provider.getBlockNumber()}
`;
  
  const envFile = path.join(__dirname, "..", "..", ".env.contracts");
  fs.appendFileSync(envFile, envExample);
  
  console.log("\n🎉 Deployment Summary:");
  console.log("======================");
  console.log(`📍 Network: ${networkName} (Chain ID: ${deploymentInfo.chainId})`);
  console.log(`📬 Contract Address: ${contractAddress}`);
  console.log(`👤 Deployer: ${deployer.address}`);
  console.log(`🏦 Fee Collector: ${feeCollector}`);
  console.log(`🔒 Emergency Multisig: ${emergencyMultisig}`);
  console.log(`🧱 Block Number: ${deploymentInfo.blockNumber}`);
  console.log(`🕐 Timestamp: ${deploymentInfo.timestamp}`);
  
  if (networkName !== "hardhat" && networkName !== "localhost") {
    console.log("\n📝 Next Steps:");
    console.log("1. Verify the contract on Etherscan:");
    console.log(`   npx hardhat verify --network ${networkName} ${contractAddress} "${feeCollector}" "${emergencyMultisig}"`);
    console.log("2. Update your backend .env file with the contract address");
    console.log("3. Update your frontend configuration with the contract address");
    console.log("4. Test the deployment with the backend integration");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });
