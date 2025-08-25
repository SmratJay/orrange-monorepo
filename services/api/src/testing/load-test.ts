/**
 * Week 3 Day 4: Production Load Testing Suite
 * Comprehensive performance validation for production deployment
 */

import { performance } from 'perf_hooks';
import fetch from 'node-fetch';

interface LoadTestConfig {
  baseUrl: string;
  concurrent: number;
  duration: number; // seconds
  endpoints: string[];
}

interface TestResult {
  endpoint: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  requestsPerSecond: number;
  errorRate: number;
}

class LoadTester {
  private config: LoadTestConfig;
  private results: TestResult[] = [];

  constructor(config: LoadTestConfig) {
    this.config = config;
  }

  async runTest(): Promise<void> {
    console.log('🚀 WEEK 3 DAY 4: PRODUCTION LOAD TESTING');
    console.log('=========================================');
    console.log(`🎯 Target: ${this.config.baseUrl}`);
    console.log(`⚡ Concurrent Users: ${this.config.concurrent}`);
    console.log(`⏱️  Duration: ${this.config.duration}s`);
    console.log(`📋 Endpoints: ${this.config.endpoints.length}`);
    console.log('');

    for (const endpoint of this.config.endpoints) {
      console.log(`🔧 Testing endpoint: ${endpoint}`);
      const result = await this.testEndpoint(endpoint);
      this.results.push(result);
      
      // Wait between endpoint tests
      await this.sleep(1000);
    }

    this.printResults();
  }

  private async testEndpoint(endpoint: string): Promise<TestResult> {
    const url = `${this.config.baseUrl}${endpoint}`;
    const startTime = Date.now();
    const endTime = startTime + (this.config.duration * 1000);
    
    const responseTimes: number[] = [];
    let successCount = 0;
    let errorCount = 0;

    // Create concurrent workers
    const workers: Promise<void>[] = [];
    
    for (let i = 0; i < this.config.concurrent; i++) {
      workers.push(this.worker(url, endTime, responseTimes, () => successCount++, () => errorCount++));
    }

    await Promise.all(workers);

    const totalRequests = successCount + errorCount;
    const averageResponseTime = responseTimes.length > 0 
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length 
      : 0;
    
    return {
      endpoint,
      totalRequests,
      successfulRequests: successCount,
      failedRequests: errorCount,
      averageResponseTime,
      minResponseTime: Math.min(...responseTimes) || 0,
      maxResponseTime: Math.max(...responseTimes) || 0,
      requestsPerSecond: totalRequests / this.config.duration,
      errorRate: totalRequests > 0 ? (errorCount / totalRequests) * 100 : 0
    };
  }

  private async worker(
    url: string, 
    endTime: number, 
    responseTimes: number[],
    onSuccess: () => void,
    onError: () => void
  ): Promise<void> {
    while (Date.now() < endTime) {
      const startTime = performance.now();
      
      try {
        const response = await fetch(url, {
          timeout: 5000,
          headers: {
            'User-Agent': 'Orrange-LoadTest/1.0',
            'Accept': 'application/json'
          }
        });

        const endTime = performance.now();
        const responseTime = endTime - startTime;
        
        responseTimes.push(responseTime);

        if (response.ok) {
          onSuccess();
        } else {
          onError();
        }
      } catch (error) {
        const endTime = performance.now();
        responseTimes.push(endTime - startTime);
        onError();
      }

      // Small delay to prevent overwhelming
      await this.sleep(10);
    }
  }

  private printResults(): void {
    console.log('\n📊 LOAD TEST RESULTS');
    console.log('====================');
    
    this.results.forEach(result => {
      console.log(`\n🔍 Endpoint: ${result.endpoint}`);
      console.log(`   Total Requests: ${result.totalRequests}`);
      console.log(`   Successful: ${result.successfulRequests}`);
      console.log(`   Failed: ${result.failedRequests}`);
      console.log(`   Error Rate: ${result.errorRate.toFixed(2)}%`);
      console.log(`   Requests/sec: ${result.requestsPerSecond.toFixed(2)}`);
      console.log(`   Avg Response Time: ${result.averageResponseTime.toFixed(2)}ms`);
      console.log(`   Min Response Time: ${result.minResponseTime.toFixed(2)}ms`);
      console.log(`   Max Response Time: ${result.maxResponseTime.toFixed(2)}ms`);
      
      // Performance assessment
      if (result.averageResponseTime < 200) {
        console.log('   ✅ EXCELLENT performance (< 200ms)');
      } else if (result.averageResponseTime < 500) {
        console.log('   ⚠️  ACCEPTABLE performance (200-500ms)');
      } else {
        console.log('   ❌ POOR performance (> 500ms)');
      }
      
      if (result.errorRate < 0.1) {
        console.log('   ✅ EXCELLENT reliability (< 0.1% errors)');
      } else if (result.errorRate < 1) {
        console.log('   ⚠️  ACCEPTABLE reliability (0.1-1% errors)');
      } else {
        console.log('   ❌ POOR reliability (> 1% errors)');
      }
    });

    // Overall assessment
    console.log('\n🎯 OVERALL ASSESSMENT');
    console.log('=====================');
    
    const totalRequests = this.results.reduce((sum, r) => sum + r.totalRequests, 0);
    const totalErrors = this.results.reduce((sum, r) => sum + r.failedRequests, 0);
    const overallErrorRate = totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0;
    const avgResponseTime = this.results.reduce((sum, r) => sum + r.averageResponseTime, 0) / this.results.length;
    const totalRPS = this.results.reduce((sum, r) => sum + r.requestsPerSecond, 0);

    console.log(`Total Requests: ${totalRequests}`);
    console.log(`Overall Error Rate: ${overallErrorRate.toFixed(2)}%`);
    console.log(`Average Response Time: ${avgResponseTime.toFixed(2)}ms`);
    console.log(`Total RPS: ${totalRPS.toFixed(2)}`);

    // Production readiness assessment
    const isProductionReady = 
      overallErrorRate < 0.1 && 
      avgResponseTime < 200 && 
      totalRPS > 500;

    if (isProductionReady) {
      console.log('\n🎉 PRODUCTION READY!');
      console.log('====================');
      console.log('✅ Performance targets met');
      console.log('✅ Reliability standards achieved');
      console.log('✅ Ready for production deployment');
    } else {
      console.log('\n⚠️  OPTIMIZATION NEEDED');
      console.log('=======================');
      if (overallErrorRate >= 0.1) console.log('❌ Error rate too high (target: < 0.1%)');
      if (avgResponseTime >= 200) console.log('❌ Response time too slow (target: < 200ms)');
      if (totalRPS <= 500) console.log('❌ Throughput too low (target: > 500 RPS)');
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Production load test configuration
const productionConfig: LoadTestConfig = {
  baseUrl: 'http://localhost:3001',
  concurrent: 100,
  duration: 30, // 30 seconds
  endpoints: [
    '/health',
    '/health/detailed',
    '/ready',
    '/live',
    '/metrics',
    '/api/status',
    '/api/trades',
    '/api/users'
  ]
};

// Execute load test
async function executeLoadTest() {
  const tester = new LoadTester(productionConfig);
  await tester.runTest();
}

// Only run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  executeLoadTest()
    .then(() => {
      console.log('\n✅ Load testing completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Load testing failed:', error);
      process.exit(1);
    });
}

export { LoadTester, productionConfig };
