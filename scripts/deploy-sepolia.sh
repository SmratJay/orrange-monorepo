#!/bin/bash

# ===============================================
# ORRANGE P2P - SEPOLIA TESTNET DEPLOYMENT
# ===============================================

set -e

echo "🌐 Deploying OrrangeEscrow Contract to Sepolia Testnet"
echo "===================================================="

# Check if we're in the contracts directory
if [ ! -f "hardhat.config.js" ]; then
    echo "📁 Changing to contracts directory..."
    cd contracts
fi

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "❌ .env file not found in contracts directory!"
    echo "📋 Create .env file with:"
    echo "SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_PROJECT_ID"
    echo "PRIVATE_KEY=your_deployer_private_key"
    echo "ETHERSCAN_API_KEY=your_etherscan_api_key"
    exit 1
fi

# Load environment variables
source .env

# Validate required environment variables
if [ -z "$SEPOLIA_RPC_URL" ]; then
    echo "❌ SEPOLIA_RPC_URL not set in .env file!"
    exit 1
fi

if [ -z "$PRIVATE_KEY" ]; then
    echo "❌ PRIVATE_KEY not set in .env file!"
    exit 1
fi

echo "✅ Environment validation passed"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Compile contracts
echo "🏗️  Compiling contracts..."
npx hardhat compile

# Deploy to Sepolia testnet
echo "🚀 Deploying to Sepolia testnet..."
npx hardhat run scripts/deploy.js --network sepolia > deployment-log.txt 2>&1

# Extract contract address from deployment log
CONTRACT_ADDRESS=$(grep "OrrangeEscrow deployed to:" deployment-log.txt | awk '{print $4}')

if [ -z "$CONTRACT_ADDRESS" ]; then
    echo "❌ Failed to extract contract address from deployment!"
    echo "📋 Check deployment-log.txt for errors"
    cat deployment-log.txt
    exit 1
fi

echo "✅ Contract deployed successfully!"
echo "📋 Contract Address: $CONTRACT_ADDRESS"

# Verify contract on Etherscan (if API key provided)
if [ -n "$ETHERSCAN_API_KEY" ]; then
    echo "🔍 Verifying contract on Etherscan..."
    npx hardhat verify --network sepolia $CONTRACT_ADDRESS || echo "⚠️  Verification failed or already verified"
fi

# Update environment files with contract address
echo ""
echo "🔧 Updating environment configuration files..."

# Update .env.staging
if [ -f "../.env.staging" ]; then
    sed -i.bak "s/ESCROW_CONTRACT_ADDRESS=.*/ESCROW_CONTRACT_ADDRESS=$CONTRACT_ADDRESS/" ../.env.staging
    sed -i.bak "s/NEXT_PUBLIC_CONTRACT_ADDRESS=.*/NEXT_PUBLIC_CONTRACT_ADDRESS=$CONTRACT_ADDRESS/" ../.env.staging
    echo "✅ Updated .env.staging"
fi

# Update .env.production.example
if [ -f "../.env.production.example" ]; then
    sed -i.bak "s/ESCROW_CONTRACT_ADDRESS=.*/ESCROW_CONTRACT_ADDRESS=$CONTRACT_ADDRESS/" ../.env.production.example
    sed -i.bak "s/NEXT_PUBLIC_CONTRACT_ADDRESS=.*/NEXT_PUBLIC_CONTRACT_ADDRESS=$CONTRACT_ADDRESS/" ../.env.production.example
    echo "✅ Updated .env.production.example"
fi

# Test deployed contract
echo "🧪 Testing deployed contract..."
npx hardhat run scripts/test-contract.js --network sepolia

echo ""
echo "🎉 SEPOLIA DEPLOYMENT COMPLETE!"
echo "==============================="
echo "📋 Deployment Summary:"
echo "  🌐 Network: Sepolia Testnet"
echo "  📍 Contract Address: $CONTRACT_ADDRESS"
echo "  🔗 Etherscan: https://sepolia.etherscan.io/address/$CONTRACT_ADDRESS"
echo "  ⛽ Gas Used: Check deployment-log.txt for details"
echo ""
echo "📋 Next Steps:"
echo "  1. Update your API service configuration with the new contract address"
echo "  2. Update your frontend Web3 configuration"
echo "  3. Test the complete integration flow"
echo "  4. Fund your test accounts with Sepolia ETH from faucets"
echo ""
echo "🚰 Sepolia Testnet Faucets:"
echo "  - https://sepoliafaucet.com/"
echo "  - https://faucet.sepolia.dev/"
echo ""

# Save deployment information
cat > deployment-info.json << EOF
{
  "network": "sepolia",
  "contractAddress": "$CONTRACT_ADDRESS",
  "deploymentDate": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "deployer": "$(npx hardhat run scripts/get-deployer-address.js --network sepolia 2>/dev/null || echo 'unknown')",
  "etherscanUrl": "https://sepolia.etherscan.io/address/$CONTRACT_ADDRESS",
  "transactionHash": "$(grep 'Transaction hash:' deployment-log.txt | awk '{print $3}' || echo 'not found')"
}
EOF

echo "💾 Deployment information saved to deployment-info.json"
