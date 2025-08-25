/**
 * Week 4: Live Production Smart Contract Deployment
 * Deploy OrrangeEscrow to live Sepolia testnet with production configuration
 */

const { ethers } = require('hardhat');
require('dotenv').config({ path: '.env.production' });

async function deployToLiveSepolia() {
    console.log('🚀 WEEK 4: LIVE SEPOLIA PRODUCTION DEPLOYMENT');
    console.log('===============================================');
    
    // Verify network
    const network = await ethers.provider.getNetwork();
    console.log(`🌐 Network: ${network.name} (Chain ID: ${network.chainId})`);
    
    if (network.chainId !== 11155111) {
        throw new Error(`❌ Wrong network! Expected Sepolia (11155111), got ${network.chainId}`);
    }
    
    // Get deployer account
    const [deployer] = await ethers.getSigners();
    const balance = await deployer.getBalance();
    
    console.log(`📝 Deploying with account: ${deployer.address}`);
    console.log(`💰 Account balance: ${ethers.utils.formatEther(balance)} ETH`);
    
    if (balance.lt(ethers.utils.parseEther('0.1'))) {
        throw new Error('❌ Insufficient ETH balance for deployment (need at least 0.1 ETH)');
    }
    
    // Production deployment configuration
    const deploymentConfig = {
        feeCollector: process.env.FEE_COLLECTOR || deployer.address,
        emergencyMultisig: process.env.EMERGENCY_MULTISIG || deployer.address,
        initialAdmin: process.env.INITIAL_ADMIN || deployer.address,
        platformFee: 50, // 0.5% (50 basis points)
        minTradeAmount: ethers.utils.parseEther('0.001'), // 0.001 ETH minimum
        maxTradeAmount: ethers.utils.parseEther('100'), // 100 ETH maximum
        securityDeposit: 100, // 1% (100 basis points)
        emergencyDelay: 24 * 60 * 60 // 24 hours
    };
    
    console.log('\n⚙️  Production Configuration:');
    console.log(`   Fee Collector: ${deploymentConfig.feeCollector}`);
    console.log(`   Emergency Multisig: ${deploymentConfig.emergencyMultisig}`);
    console.log(`   Initial Admin: ${deploymentConfig.initialAdmin}`);
    console.log(`   Platform Fee: ${deploymentConfig.platformFee / 100}%`);
    console.log(`   Min Trade: ${ethers.utils.formatEther(deploymentConfig.minTradeAmount)} ETH`);
    console.log(`   Max Trade: ${ethers.utils.formatEther(deploymentConfig.maxTradeAmount)} ETH`);
    console.log(`   Security Deposit: ${deploymentConfig.securityDeposit / 100}%`);
    console.log(`   Emergency Delay: ${deploymentConfig.emergencyDelay / 3600} hours`);
    
    try {
        // Deploy OrrangeEscrow contract
        console.log('\n🚀 Deploying OrrangeEscrow contract...');
        const OrrangeEscrow = await ethers.getContractFactory('OrrangeEscrow');
        
        const estimatedGas = await OrrangeEscrow.signer.estimateGas(
            OrrangeEscrow.getDeployTransaction(
                deploymentConfig.feeCollector,
                deploymentConfig.emergencyMultisig,
                deploymentConfig.initialAdmin
            )
        );
        
        console.log(`⛽ Estimated Gas: ${estimatedGas.toString()}`);
        
        const orrangeEscrow = await OrrangeEscrow.deploy(
            deploymentConfig.feeCollector,
            deploymentConfig.emergencyMultisig,
            deploymentConfig.initialAdmin,
            {
                gasLimit: estimatedGas.mul(120).div(100) // 20% buffer
            }
        );
        
        console.log('⏳ Waiting for deployment confirmation...');
        await orrangeEscrow.deployed();
        
        console.log(`✅ OrrangeEscrow deployed to: ${orrangeEscrow.address}`);
        console.log(`📄 Transaction hash: ${orrangeEscrow.deployTransaction.hash}`);
        
        // Wait for additional confirmations
        console.log('⏳ Waiting for additional confirmations...');
        await orrangeEscrow.deployTransaction.wait(3);
        
        // Verify deployment
        console.log('\n🔍 Verifying deployment...');
        const owner = await orrangeEscrow.owner();
        const feeCollector = await orrangeEscrow.feeCollector();
        const paused = await orrangeEscrow.paused();
        
        console.log(`   Owner: ${owner}`);
        console.log(`   Fee Collector: ${feeCollector}`);
        console.log(`   Paused: ${paused}`);
        
        // Configure contract parameters
        console.log('\n⚙️  Configuring contract parameters...');
        
        // Set platform fee
        if ((await orrangeEscrow.platformFee()).toNumber() !== deploymentConfig.platformFee) {
            console.log('   Setting platform fee...');
            const setPlatformFeeTx = await orrangeEscrow.setPlatformFee(deploymentConfig.platformFee);
            await setPlatformFeeTx.wait();
            console.log('   ✅ Platform fee set');
        }
        
        // Set trade limits
        const currentMinTrade = await orrangeEscrow.minTradeAmount();
        const currentMaxTrade = await orrangeEscrow.maxTradeAmount();
        
        if (!currentMinTrade.eq(deploymentConfig.minTradeAmount)) {
            console.log('   Setting minimum trade amount...');
            const setMinTradeTx = await orrangeEscrow.setMinTradeAmount(deploymentConfig.minTradeAmount);
            await setMinTradeTx.wait();
            console.log('   ✅ Minimum trade amount set');
        }
        
        if (!currentMaxTrade.eq(deploymentConfig.maxTradeAmount)) {
            console.log('   Setting maximum trade amount...');
            const setMaxTradeTx = await orrangeEscrow.setMaxTradeAmount(deploymentConfig.maxTradeAmount);
            await setMaxTradeTx.wait();
            console.log('   ✅ Maximum trade amount set');
        }
        
        // Final verification
        console.log('\n📊 Final Contract Status:');
        const finalPlatformFee = await orrangeEscrow.platformFee();
        const finalMinTrade = await orrangeEscrow.minTradeAmount();
        const finalMaxTrade = await orrangeEscrow.maxTradeAmount();
        
        console.log(`   Platform Fee: ${finalPlatformFee.toNumber() / 100}% (${finalPlatformFee} basis points)`);
        console.log(`   Min Trade Amount: ${ethers.utils.formatEther(finalMinTrade)} ETH`);
        console.log(`   Max Trade Amount: ${ethers.utils.formatEther(finalMaxTrade)} ETH`);
        console.log(`   Emergency Halt: ${await orrangeEscrow.paused()}`);
        
        // Save deployment information
        const deploymentInfo = {
            network: 'sepolia',
            chainId: network.chainId,
            contractAddress: orrangeEscrow.address,
            transactionHash: orrangeEscrow.deployTransaction.hash,
            deployer: deployer.address,
            blockNumber: orrangeEscrow.deployTransaction.blockNumber,
            gasUsed: (await orrangeEscrow.deployTransaction.wait()).gasUsed.toString(),
            timestamp: new Date().toISOString(),
            configuration: deploymentConfig
        };
        
        // Write deployment info to file
        const fs = require('fs');
        const path = require('path');
        const deploymentPath = path.join(__dirname, '..', 'deployments', 'sepolia-production.json');
        
        // Ensure deployments directory exists
        const deploymentDir = path.dirname(deploymentPath);
        if (!fs.existsSync(deploymentDir)) {
            fs.mkdirSync(deploymentDir, { recursive: true });
        }
        
        fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
        
        console.log('\n🎉 LIVE SEPOLIA DEPLOYMENT SUCCESSFUL!');
        console.log('=====================================');
        console.log(`✅ Contract Address: ${orrangeEscrow.address}`);
        console.log(`✅ Transaction Hash: ${orrangeEscrow.deployTransaction.hash}`);
        console.log(`✅ Deployment saved to: ${deploymentPath}`);
        console.log(`✅ Block Explorer: https://sepolia.etherscan.io/address/${orrangeEscrow.address}`);
        console.log('\n📋 Next Steps:');
        console.log('   1. Verify contract on Etherscan');
        console.log('   2. Update backend configuration with new contract address');
        console.log('   3. Execute end-to-end testing with live contract');
        console.log('   4. Begin production monitoring setup');
        
        return {
            address: orrangeEscrow.address,
            transactionHash: orrangeEscrow.deployTransaction.hash,
            deploymentInfo
        };
        
    } catch (error) {
        console.error('\n❌ DEPLOYMENT FAILED!');
        console.error('=====================');
        console.error(`Error: ${error.message}`);
        
        if (error.code === 'INSUFFICIENT_FUNDS') {
            console.error('\n💡 SOLUTION: Add more ETH to the deployment account');
            console.error(`   Account: ${deployer.address}`);
            console.error('   Required: At least 0.1 ETH for deployment');
        } else if (error.code === 'NETWORK_ERROR') {
            console.error('\n💡 SOLUTION: Check network connection and RPC endpoint');
        } else if (error.message.includes('gas')) {
            console.error('\n💡 SOLUTION: Increase gas limit or wait for lower gas prices');
        }
        
        throw error;
    }
}

// Execute deployment if called directly
if (require.main === module) {
    deployToLiveSepolia()
        .then((result) => {
            console.log('\n✅ Deployment script completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Deployment script failed');
            process.exit(1);
        });
}

module.exports = { deployToLiveSepolia };
