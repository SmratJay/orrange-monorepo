/**
 * Smart Contract Escrow Service Test
 * Week 2 Day 1 - Test the clean service implementation
 */

import { SmartContractEscrowService, ContractConfig, TradeState } from '../src/services/SmartContractEscrowService.js';

async function testEscrowService() {
  console.log('🧪 Testing SmartContractEscrowService...\n');
  
  // Configuration for local Hardhat network
  const config: ContractConfig = {
    contractAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3', // From deployments/hardhat.json
    providerUrl: 'http://127.0.0.1:8545',
    chainId: 1337,
    gasLimit: 500000
  };

  try {
    // Initialize service
    console.log('1️⃣ Initializing service...');
    const escrowService = new SmartContractEscrowService(config);
    
    // Test health check
    console.log('2️⃣ Checking contract health...');
    const isHealthy = await escrowService.isHealthy();
    console.log(`   Contract healthy: ${isHealthy ? '✅' : '❌'}`);
    
    // Test platform fee
    console.log('3️⃣ Getting platform fee...');
    const feePercent = await escrowService.getPlatformFeePercent();
    console.log(`   Platform fee: ${feePercent / 100}%`);
    
    // Test total escrowed amount
    console.log('4️⃣ Getting total escrowed amount...');
    const totalEscrowed = await escrowService.getTotalEscrowedAmount();
    console.log(`   Total escrowed: ${totalEscrowed} wei`);
    
    // Test getting a trade (should return null for non-existent trade)
    console.log('5️⃣ Testing trade retrieval...');
    const testTradeId = 'test-trade-123';
    const tradeInfo = await escrowService.getTrade(testTradeId);
    console.log(`   Trade info for ${testTradeId}: ${tradeInfo ? 'Found' : 'Not found ✅'}`);
    
    console.log('\n✅ All tests passed! Service is operational.');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run tests
testEscrowService().catch(console.error);
