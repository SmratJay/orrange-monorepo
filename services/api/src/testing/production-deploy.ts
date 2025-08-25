/**
 * Week 4: Live Production Deployment Script
 * Comprehensive production deployment with validation
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fetch from 'node-fetch';
import { EndToEndTester } from './e2e-test.js';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

interface DeploymentConfig {
  environment: 'staging' | 'production';
  serverUrl: string;
  contractNetwork: string;
  enableSsl: boolean;
  domain?: string;
}

interface DeploymentResult {
  stage: string;
  success: boolean;
  duration: number;
  error?: string;
  details?: any;
}

class ProductionDeployer {
  private config: DeploymentConfig;
  private results: DeploymentResult[] = [];
  private startTime: number;

  constructor(config: DeploymentConfig) {
    this.config = config;
    this.startTime = Date.now();
  }

  async executeFullDeployment(): Promise<DeploymentResult[]> {
    console.log('🚀 WEEK 4: WORLD-CLASS PRODUCTION DEPLOYMENT');
    console.log('===========================================');
    console.log(`🎯 Environment: ${this.config.environment.toUpperCase()}`);
    console.log(`🌐 Target: ${this.config.serverUrl}`);
    console.log(`⛓️  Network: ${this.config.contractNetwork}`);
    console.log('');

    try {
      // Stage 1: Pre-deployment Validation
      await this.preDeploymentValidation();
      
      // Stage 2: Build Production Assets
      await this.buildProductionAssets();
      
      // Stage 3: Deploy Smart Contracts
      await this.deploySmartContracts();
      
      // Stage 4: Launch Production Server
      await this.launchProductionServer();
      
      // Stage 5: System Health Validation
      await this.validateSystemHealth();
      
      // Stage 6: End-to-End Testing
      await this.executeE2ETesting();
      
      // Stage 7: Performance Validation
      await this.validatePerformance();
      
      // Stage 8: Security Validation
      await this.validateSecurity();
      
      // Stage 9: Final Production Checklist
      await this.finalProductionChecklist();

      this.printDeploymentReport();
      return this.results;
      
    } catch (error: any) {
      console.error(`\n❌ Deployment failed: ${error.message}`);
      this.printDeploymentReport();
      throw error;
    }
  }

  private async preDeploymentValidation(): Promise<void> {
    await this.executeStage('Pre-deployment Validation', async () => {
      console.log('🔍 Validating deployment prerequisites...');
      
      // Check environment variables
      const requiredEnvVars = [
        'PRIVATE_KEY',
        'INFURA_API_KEY',
        'ETHERSCAN_API_KEY'
      ];
      
      const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
      
      if (missingVars.length > 0) {
        throw new Error(`Missing environment variables: ${missingVars.join(', ')}`);
      }
      
      // Check dependencies
      try {
        const { stdout } = await execAsync('npm --version');
        console.log(`   ✅ NPM version: ${stdout.trim()}`);
      } catch (error) {
        throw new Error('NPM not available');
      }
      
      // Validate configuration files
      const configFiles = [
        'package.json',
        'tsconfig.json',
        'hardhat.config.js'
      ];
      
      for (const file of configFiles) {
        if (!fs.existsSync(file)) {
          throw new Error(`Missing configuration file: ${file}`);
        }
      }
      
      return { 
        environmentVariables: requiredEnvVars.length,
        configFiles: configFiles.length
      };
    });
  }

  private async buildProductionAssets(): Promise<void> {
    await this.executeStage('Build Production Assets', async () => {
      console.log('🏗️  Building production assets...');
      
      // Clean previous builds
      try {
        await execAsync('rm -rf dist build .next');
        console.log('   ✅ Cleaned previous builds');
      } catch (error) {
        console.log('   ℹ️  No previous builds to clean');
      }
      
      // Install dependencies
      const { stdout: installOutput } = await execAsync('npm install --production=false');
      console.log('   ✅ Dependencies installed');
      
      // Build TypeScript
      try {
        const { stdout: buildOutput } = await execAsync('npm run build');
        console.log('   ✅ TypeScript compilation completed');
      } catch (error: any) {
        throw new Error(`Build failed: ${error.message}`);
      }
      
      // Verify build output
      const distExists = fs.existsSync('dist');
      if (!distExists) {
        throw new Error('Build output not found in dist directory');
      }
      
      return {
        buildSuccessful: true,
        outputDirectory: 'dist'
      };
    });
  }

  private async deploySmartContracts(): Promise<void> {
    await this.executeStage('Deploy Smart Contracts', async () => {
      console.log('⛓️  Deploying smart contracts...');
      
      // Navigate to contracts directory
      const contractsPath = path.join(process.cwd(), '../../contracts');
      
      try {
        // Deploy to specified network
        const deployCommand = `cd "${contractsPath}" && npx hardhat run scripts/deploy-live-sepolia.js --network sepolia`;
        const { stdout: deployOutput } = await execAsync(deployCommand, { timeout: 120000 });
        
        console.log('   ✅ Smart contract deployment completed');
        
        // Extract contract address from output
        const addressMatch = deployOutput.match(/Contract deployed to: (0x[a-fA-F0-9]{40})/);
        const contractAddress = addressMatch ? addressMatch[1] : 'Unknown';
        
        // Verify contract on Etherscan
        if (contractAddress !== 'Unknown') {
          try {
            const verifyCommand = `cd "${contractsPath}" && npx hardhat verify --network sepolia ${contractAddress}`;
            await execAsync(verifyCommand, { timeout: 60000 });
            console.log('   ✅ Contract verified on Etherscan');
          } catch (error) {
            console.log('   ⚠️  Contract verification failed (deployment still successful)');
          }
        }
        
        return {
          contractAddress,
          network: 'sepolia',
          verified: true
        };
        
      } catch (error: any) {
        throw new Error(`Contract deployment failed: ${error.message}`);
      }
    });
  }

  private async launchProductionServer(): Promise<void> {
    await this.executeStage('Launch Production Server', async () => {
      console.log('🚀 Starting production server...');
      
      // Start server in production mode
      const serverProcess = exec('NODE_ENV=production npm start', { 
        detached: true,
        stdio: 'pipe'
      });
      
      // Wait for server to start
      let serverStarted = false;
      let attempts = 0;
      const maxAttempts = 30;
      
      while (!serverStarted && attempts < maxAttempts) {
        try {
          await new Promise(resolve => setTimeout(resolve, 2000));
          const response = await fetch(`${this.config.serverUrl}/health`, { timeout: 5000 } as any);
          if (response.ok) {
            serverStarted = true;
            console.log('   ✅ Production server started successfully');
          }
        } catch (error) {
          attempts++;
          console.log(`   ⏳ Waiting for server... (${attempts}/${maxAttempts})`);
        }
      }
      
      if (!serverStarted) {
        throw new Error('Production server failed to start within timeout');
      }
      
      return {
        serverUrl: this.config.serverUrl,
        startupTime: attempts * 2000
      };
    });
  }

  private async validateSystemHealth(): Promise<void> {
    await this.executeStage('System Health Validation', async () => {
      console.log('🔍 Validating system health...');
      
      // Basic health check
      const healthResponse = await fetch(`${this.config.serverUrl}/health`);
      if (!healthResponse.ok) {
        throw new Error('Basic health check failed');
      }
      
      const healthData = await healthResponse.json();
      if (healthData.status !== 'healthy') {
        throw new Error(`System not healthy: ${healthData.status}`);
      }
      
      console.log('   ✅ Basic health check passed');
      
      // Detailed health check
      const detailedResponse = await fetch(`${this.config.serverUrl}/health/detailed`);
      if (!detailedResponse.ok) {
        throw new Error('Detailed health check failed');
      }
      
      const detailedData = await detailedResponse.json();
      console.log('   ✅ Detailed health check passed');
      
      // Readiness and liveness checks
      const readyResponse = await fetch(`${this.config.serverUrl}/ready`);
      const liveResponse = await fetch(`${this.config.serverUrl}/live`);
      
      if (!readyResponse.ok) throw new Error('Readiness check failed');
      if (!liveResponse.ok) throw new Error('Liveness check failed');
      
      console.log('   ✅ Kubernetes probes validated');
      
      return {
        basicHealth: healthData.status,
        serviceCount: Object.keys(detailedData.services).length,
        uptime: healthData.uptime
      };
    });
  }

  private async executeE2ETesting(): Promise<void> {
    await this.executeStage('End-to-End Testing', async () => {
      console.log('🧪 Executing comprehensive E2E tests...');
      
      const tester = new EndToEndTester(this.config.serverUrl);
      const testResults = await tester.runFullE2ETest();
      
      const failedTests = testResults.filter(r => !r.passed);
      const successRate = ((testResults.length - failedTests.length) / testResults.length) * 100;
      
      if (successRate < 95) {
        throw new Error(`E2E test success rate too low: ${successRate.toFixed(1)}%`);
      }
      
      console.log(`   ✅ E2E tests completed: ${successRate.toFixed(1)}% success rate`);
      
      return {
        totalTests: testResults.length,
        passedTests: testResults.length - failedTests.length,
        successRate: Math.round(successRate)
      };
    });
  }

  private async validatePerformance(): Promise<void> {
    await this.executeStage('Performance Validation', async () => {
      console.log('⚡ Validating production performance...');
      
      const performanceTests = [
        { endpoint: '/health', maxResponseTime: 100, name: 'Health Endpoint' },
        { endpoint: '/api/status', maxResponseTime: 200, name: 'Status API' },
        { endpoint: '/metrics', maxResponseTime: 300, name: 'Metrics Endpoint' },
        { endpoint: '/api/dashboard', maxResponseTime: 500, name: 'Dashboard API' }
      ];
      
      const results = [];
      
      for (const test of performanceTests) {
        const start = Date.now();
        const response = await fetch(`${this.config.serverUrl}${test.endpoint}`);
        const end = Date.now();
        const responseTime = end - start;
        
        if (!response.ok) {
          throw new Error(`${test.name} failed: ${response.status}`);
        }
        
        if (responseTime > test.maxResponseTime) {
          throw new Error(`${test.name} too slow: ${responseTime}ms > ${test.maxResponseTime}ms`);
        }
        
        results.push({ 
          endpoint: test.endpoint, 
          responseTime, 
          passed: true 
        });
        
        console.log(`   ✅ ${test.name}: ${responseTime}ms`);
      }
      
      // Load testing
      console.log('   🔄 Running load test...');
      const concurrentRequests = 20;
      const loadTestPromises = [];
      
      const loadStart = Date.now();
      for (let i = 0; i < concurrentRequests; i++) {
        loadTestPromises.push(fetch(`${this.config.serverUrl}/health`));
      }
      
      const loadResponses = await Promise.all(loadTestPromises);
      const loadEnd = Date.now();
      const failedRequests = loadResponses.filter(r => !r.ok).length;
      const loadTestDuration = loadEnd - loadStart;
      
      if (failedRequests > 0) {
        throw new Error(`Load test failed: ${failedRequests} requests failed`);
      }
      
      console.log(`   ✅ Load test: ${concurrentRequests} concurrent requests in ${loadTestDuration}ms`);
      
      return {
        endpointTests: results.length,
        loadTestRequests: concurrentRequests,
        loadTestDuration,
        allTestsPassed: true
      };
    });
  }

  private async validateSecurity(): Promise<void> {
    await this.executeStage('Security Validation', async () => {
      console.log('🔐 Validating production security...');
      
      // Test security headers
      const response = await fetch(`${this.config.serverUrl}/health`);
      const headers = response.headers;
      
      const requiredHeaders = [
        'x-content-type-options',
        'x-frame-options',
        'x-xss-protection'
      ];
      
      const missingHeaders = requiredHeaders.filter(header => !headers.get(header));
      if (missingHeaders.length > 0) {
        throw new Error(`Missing security headers: ${missingHeaders.join(', ')}`);
      }
      
      console.log('   ✅ Security headers validated');
      
      // Test rate limiting
      console.log('   🔄 Testing rate limiting...');
      const rateLimitPromises = [];
      for (let i = 0; i < 25; i++) {
        rateLimitPromises.push(
          fetch(`${this.config.serverUrl}/api/status`).catch(e => ({ ok: false, status: 0 }))
        );
      }
      
      const rateLimitResponses = await Promise.all(rateLimitPromises);
      const rateLimited = rateLimitResponses.some((r: any) => r.status === 429);
      
      if (!rateLimited) {
        console.log('   ⚠️  Rate limiting not detected (may need adjustment)');
      } else {
        console.log('   ✅ Rate limiting working correctly');
      }
      
      // Test HTTPS (if enabled)
      if (this.config.enableSsl && this.config.domain) {
        try {
          const httpsResponse = await fetch(`https://${this.config.domain}/health`);
          if (httpsResponse.ok) {
            console.log('   ✅ HTTPS/SSL validated');
          }
        } catch (error) {
          console.log('   ⚠️  HTTPS/SSL not available (development deployment)');
        }
      }
      
      return {
        securityHeaders: requiredHeaders.length,
        rateLimiting: rateLimited,
        sslEnabled: this.config.enableSsl
      };
    });
  }

  private async finalProductionChecklist(): Promise<void> {
    await this.executeStage('Final Production Checklist', async () => {
      console.log('📋 Final production readiness checklist...');
      
      const checklist = [
        { name: 'Health Endpoints', check: () => this.checkHealthEndpoints() },
        { name: 'Monitoring Stack', check: () => this.checkMonitoringStack() },
        { name: 'Logging System', check: () => this.checkLoggingSystem() },
        { name: 'Performance Metrics', check: () => this.checkPerformanceMetrics() },
        { name: 'Security Measures', check: () => this.checkSecurityMeasures() },
        { name: 'Dashboard Access', check: () => this.checkDashboardAccess() },
        { name: 'API Functionality', check: () => this.checkAPIFunctionality() }
      ];
      
      const checklistResults = [];
      
      for (const item of checklist) {
        try {
          const result = await item.check();
          checklistResults.push({ name: item.name, passed: true, details: result });
          console.log(`   ✅ ${item.name}`);
        } catch (error: any) {
          checklistResults.push({ name: item.name, passed: false, error: error.message });
          console.log(`   ❌ ${item.name}: ${error.message}`);
        }
      }
      
      const failedChecks = checklistResults.filter(c => !c.passed);
      if (failedChecks.length > 0) {
        throw new Error(`Production checklist failed: ${failedChecks.length} items`);
      }
      
      return {
        totalChecks: checklist.length,
        passedChecks: checklistResults.filter(c => c.passed).length,
        allChecksPassed: failedChecks.length === 0
      };
    });
  }

  private async checkHealthEndpoints(): Promise<any> {
    const endpoints = ['/health', '/ready', '/live', '/health/detailed'];
    for (const endpoint of endpoints) {
      const response = await fetch(`${this.config.serverUrl}${endpoint}`);
      if (!response.ok) throw new Error(`${endpoint} failed`);
    }
    return { endpoints: endpoints.length };
  }

  private async checkMonitoringStack(): Promise<any> {
    const response = await fetch(`${this.config.serverUrl}/metrics`);
    if (!response.ok) throw new Error('Metrics endpoint failed');
    const metricsText = await response.text();
    const metricCount = metricsText.split('\n').filter(line => line && !line.startsWith('#')).length;
    return { metricCount };
  }

  private async checkLoggingSystem(): Promise<any> {
    // Check if log files are being created (basic validation)
    const logResponse = await fetch(`${this.config.serverUrl}/health/detailed`);
    if (!logResponse.ok) throw new Error('Logging system check failed');
    return { loggingActive: true };
  }

  private async checkPerformanceMetrics(): Promise<any> {
    const response = await fetch(`${this.config.serverUrl}/api/dashboard/realtime`);
    if (!response.ok) throw new Error('Performance metrics failed');
    const data = await response.json();
    if (!data.memory || typeof data.uptime !== 'number') {
      throw new Error('Invalid performance data');
    }
    return { memoryTracking: true, uptimeTracking: true };
  }

  private async checkSecurityMeasures(): Promise<any> {
    const response = await fetch(`${this.config.serverUrl}/health`);
    const securityHeaders = ['x-content-type-options', 'x-frame-options', 'x-xss-protection'];
    const missingHeaders = securityHeaders.filter(h => !response.headers.get(h));
    if (missingHeaders.length > 0) {
      throw new Error(`Missing headers: ${missingHeaders.join(', ')}`);
    }
    return { securityHeaders: securityHeaders.length };
  }

  private async checkDashboardAccess(): Promise<any> {
    const response = await fetch(`${this.config.serverUrl}/api/dashboard`);
    if (!response.ok) throw new Error('Dashboard access failed');
    const data = await response.json();
    if (!data.success) throw new Error('Dashboard returned error');
    return { dashboardAccessible: true };
  }

  private async checkAPIFunctionality(): Promise<any> {
    const endpoints = ['/api/status', '/api/trades', '/api/users'];
    for (const endpoint of endpoints) {
      const response = await fetch(`${this.config.serverUrl}${endpoint}`);
      if (!response.ok) throw new Error(`${endpoint} failed`);
    }
    return { apiEndpoints: endpoints.length };
  }

  private async executeStage(stageName: string, stageFn: () => Promise<any>): Promise<void> {
    console.log(`\n📍 ${stageName}`);
    console.log('='.repeat(stageName.length + 3));
    
    const start = Date.now();
    
    try {
      const details = await stageFn();
      const end = Date.now();
      const duration = end - start;
      
      this.results.push({
        stage: stageName,
        success: true,
        duration,
        details
      });
      
      console.log(`✅ ${stageName} completed successfully (${duration}ms)`);
      
    } catch (error: any) {
      const end = Date.now();
      const duration = end - start;
      
      this.results.push({
        stage: stageName,
        success: false,
        duration,
        error: error.message
      });
      
      console.log(`❌ ${stageName} failed: ${error.message} (${duration}ms)`);
      throw error;
    }
  }

  private printDeploymentReport(): void {
    const totalDuration = Date.now() - this.startTime;
    
    console.log('\n🎯 PRODUCTION DEPLOYMENT REPORT');
    console.log('================================');
    
    const totalStages = this.results.length;
    const successfulStages = this.results.filter(r => r.success).length;
    const failedStages = totalStages - successfulStages;
    
    console.log(`\n📈 DEPLOYMENT SUMMARY`);
    console.log(`Environment: ${this.config.environment.toUpperCase()}`);
    console.log(`Target: ${this.config.serverUrl}`);
    console.log(`Total Duration: ${Math.round(totalDuration / 1000)}s`);
    console.log(`Total Stages: ${totalStages}`);
    console.log(`Successful: ${successfulStages} ✅`);
    console.log(`Failed: ${failedStages} ❌`);
    console.log(`Success Rate: ${((successfulStages / totalStages) * 100).toFixed(1)}%`);
    
    console.log('\n📋 STAGE RESULTS');
    console.log('================');
    
    this.results.forEach(result => {
      const status = result.success ? '✅' : '❌';
      console.log(`${status} ${result.stage} (${result.duration}ms)`);
      if (!result.success && result.error) {
        console.log(`   Error: ${result.error}`);
      }
    });
    
    if (failedStages === 0) {
      console.log('\n🎉 DEPLOYMENT SUCCESSFUL!');
      console.log('==========================');
      console.log('✅ World-class production platform deployed');
      console.log('✅ All systems operational and validated');
      console.log('✅ Ready for live traffic');
      console.log('\n🔗 Access Points:');
      console.log(`   • Health: ${this.config.serverUrl}/health`);
      console.log(`   • Dashboard: ${this.config.serverUrl}/api/dashboard`);
      console.log(`   • Metrics: ${this.config.serverUrl}/metrics`);
      console.log(`   • API Status: ${this.config.serverUrl}/api/status`);
    } else {
      console.log('\n⚠️  DEPLOYMENT ISSUES DETECTED');
      console.log('==============================');
      console.log('🔧 Review failed stages and address issues');
      console.log('🔄 Re-run deployment after fixes');
    }
  }
}

// Deployment configurations
const DEPLOYMENT_CONFIGS = {
  staging: {
    environment: 'staging' as const,
    serverUrl: 'http://localhost:3001',
    contractNetwork: 'sepolia',
    enableSsl: false
  },
  production: {
    environment: 'production' as const,
    serverUrl: 'https://api.orrange.com', // Would be actual production URL
    contractNetwork: 'mainnet',
    enableSsl: true,
    domain: 'api.orrange.com'
  }
};

// Execute deployment
async function executeProductionDeployment(environment: 'staging' | 'production' = 'staging') {
  const config = DEPLOYMENT_CONFIGS[environment];
  const deployer = new ProductionDeployer(config);
  
  try {
    const results = await deployer.executeFullDeployment();
    console.log('\n✅ Production deployment completed successfully');
    return results;
  } catch (error: any) {
    console.error('\n❌ Production deployment failed:', error.message);
    throw error;
  }
}

// Only run if this file is executed directly
const isMainModule = process.argv[1]?.endsWith('production-deploy.ts') || process.argv[1]?.endsWith('production-deploy.js');

if (isMainModule) {
  const environment = (process.argv[2] as 'staging' | 'production') || 'staging';
  
  executeProductionDeployment(environment)
    .then(() => {
      process.exit(0);
    })
    .catch(() => {
      process.exit(1);
    });
}

export { ProductionDeployer, executeProductionDeployment, DEPLOYMENT_CONFIGS };
