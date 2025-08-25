/**
 * Week 4: End-to-End Production Testing Suite
 * Comprehensive testing of all production systems
 */

import fetch from 'node-fetch';
import { performance } from 'perf_hooks';

interface E2ETestResult {
  testSuite: string;
  testName: string;
  passed: boolean;
  duration: number;
  error?: string;
  details?: any;
}

class EndToEndTester {
  private baseUrl: string;
  private results: E2ETestResult[] = [];

  constructor(baseUrl: string = 'http://localhost:3001') {
    this.baseUrl = baseUrl;
  }

  async runFullE2ETest(): Promise<E2ETestResult[]> {
    console.log('🚀 WEEK 4: END-TO-END PRODUCTION TESTING');
    console.log('=========================================');
    console.log(`🎯 Target: ${this.baseUrl}`);
    console.log('');

    // Health System Tests
    await this.testHealthEndpoints();
    
    // Monitoring System Tests
    await this.testMonitoringEndpoints();
    
    // Dashboard System Tests
    await this.testDashboardEndpoints();
    
    // Performance Tests
    await this.testPerformanceRequirements();
    
    // Security Tests
    await this.testSecurityMeasures();
    
    // API Functionality Tests
    await this.testAPIFunctionality();

    this.printE2EReport();
    return this.results;
  }

  private async testHealthEndpoints(): Promise<void> {
    console.log('🔍 Testing Health System...');
    
    await this.runTest('Health System', 'Basic Health Check', async () => {
      const response = await fetch(`${this.baseUrl}/health`);
      const data = await response.json();
      
      if (!response.ok) throw new Error(`Health check failed: ${response.status}`);
      if (data.status !== 'healthy') throw new Error('System not healthy');
      
      return { status: data.status, uptime: data.uptime };
    });

    await this.runTest('Health System', 'Detailed Health Check', async () => {
      const response = await fetch(`${this.baseUrl}/health/detailed`);
      const data = await response.json();
      
      if (!response.ok) throw new Error(`Detailed health check failed: ${response.status}`);
      
      const requiredServices = ['database', 'redis', 'blockchain', 'websocket'];
      const missingServices = requiredServices.filter(service => !data.services[service]);
      
      if (missingServices.length > 0) {
        throw new Error(`Missing service checks: ${missingServices.join(', ')}`);
      }
      
      return { services: Object.keys(data.services).length };
    });

    await this.runTest('Health System', 'Readiness Probe', async () => {
      const response = await fetch(`${this.baseUrl}/ready`);
      const data = await response.json();
      
      if (!response.ok) throw new Error(`Readiness check failed: ${response.status}`);
      
      return { status: data.status };
    });

    await this.runTest('Health System', 'Liveness Probe', async () => {
      const response = await fetch(`${this.baseUrl}/live`);
      const data = await response.json();
      
      if (!response.ok) throw new Error(`Liveness check failed: ${response.status}`);
      
      return { status: data.status };
    });
  }

  private async testMonitoringEndpoints(): Promise<void> {
    console.log('🔍 Testing Monitoring System...');
    
    await this.runTest('Monitoring System', 'Prometheus Metrics', async () => {
      const response = await fetch(`${this.baseUrl}/metrics`);
      const metricsText = await response.text();
      
      if (!response.ok) throw new Error(`Metrics endpoint failed: ${response.status}`);
      if (response.headers.get('content-type') !== 'text/plain; version=0.0.4; charset=utf-8') {
        throw new Error('Invalid metrics content type');
      }
      
      const metricLines = metricsText.split('\n').filter(line => line && !line.startsWith('#'));
      if (metricLines.length === 0) throw new Error('No metrics found');
      
      return { metricsCount: metricLines.length };
    });

    await this.runTest('Monitoring System', 'Metrics Summary', async () => {
      const response = await fetch(`${this.baseUrl}/metrics/summary`);
      const data = await response.json();
      
      if (!response.ok) throw new Error(`Metrics summary failed: ${response.status}`);
      if (!data.summary) throw new Error('No metrics summary found');
      
      return { metricsCount: data.metricsCount };
    });
  }

  private async testDashboardEndpoints(): Promise<void> {
    console.log('🔍 Testing Dashboard System...');
    
    await this.runTest('Dashboard System', 'Main Dashboard', async () => {
      const response = await fetch(`${this.baseUrl}/api/dashboard`);
      const data = await response.json();
      
      if (!response.ok) throw new Error(`Dashboard failed: ${response.status}`);
      if (!data.success) throw new Error('Dashboard returned unsuccessful response');
      if (!data.data.systemHealth) throw new Error('No system health data');
      if (!data.data.metrics) throw new Error('No metrics data');
      if (!data.data.charts) throw new Error('No charts data');
      
      return { 
        metricsCount: data.data.metrics.length,
        chartsCount: data.data.charts.length,
        systemHealth: data.data.systemHealth.overall
      };
    });

    await this.runTest('Dashboard System', 'Real-time Metrics', async () => {
      const response = await fetch(`${this.baseUrl}/api/dashboard/realtime`);
      const data = await response.json();
      
      if (!response.ok) throw new Error(`Real-time metrics failed: ${response.status}`);
      if (!data.memory) throw new Error('No memory metrics');
      if (typeof data.uptime !== 'number') throw new Error('Invalid uptime data');
      
      return { 
        memoryUsage: data.memory.usage,
        uptime: data.uptime
      };
    });

    await this.runTest('Dashboard System', 'Health Summary', async () => {
      const response = await fetch(`${this.baseUrl}/api/dashboard/health`);
      const data = await response.json();
      
      if (!response.ok) throw new Error(`Health summary failed: ${response.status}`);
      if (!data.overall) throw new Error('No overall health status');
      
      return { 
        overall: data.overall,
        uptime: data.uptime
      };
    });
  }

  private async testPerformanceRequirements(): Promise<void> {
    console.log('🔍 Testing Performance Requirements...');
    
    await this.runTest('Performance', 'Response Time < 200ms', async () => {
      const iterations = 10;
      const responseTimes: number[] = [];
      
      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        const response = await fetch(`${this.baseUrl}/health`);
        const end = performance.now();
        
        if (!response.ok) throw new Error('Health check failed during performance test');
        responseTimes.push(end - start);
        
        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      const maxResponseTime = Math.max(...responseTimes);
      
      if (avgResponseTime > 200) {
        throw new Error(`Average response time too high: ${avgResponseTime.toFixed(2)}ms`);
      }
      
      return {
        avgResponseTime: Math.round(avgResponseTime),
        maxResponseTime: Math.round(maxResponseTime),
        iterations
      };
    });

    await this.runTest('Performance', 'Concurrent Request Handling', async () => {
      const concurrentRequests = 50;
      const promises = [];
      
      const start = performance.now();
      
      for (let i = 0; i < concurrentRequests; i++) {
        promises.push(fetch(`${this.baseUrl}/health`));
      }
      
      const responses = await Promise.all(promises);
      const end = performance.now();
      
      const failedRequests = responses.filter(r => !r.ok).length;
      const successRate = ((concurrentRequests - failedRequests) / concurrentRequests) * 100;
      
      if (successRate < 99) {
        throw new Error(`Success rate too low: ${successRate.toFixed(2)}%`);
      }
      
      return {
        totalTime: Math.round(end - start),
        successRate: Math.round(successRate),
        failedRequests
      };
    });
  }

  private async testSecurityMeasures(): Promise<void> {
    console.log('🔍 Testing Security Measures...');
    
    await this.runTest('Security', 'Rate Limiting', async () => {
      const requests = [];
      
      // Send rapid requests to trigger rate limiting
      for (let i = 0; i < 30; i++) {
        requests.push(fetch(`${this.baseUrl}/api/status`, { method: 'GET' }));
      }
      
      const responses = await Promise.all(requests.map(p => p.catch(e => ({ ok: false, status: 0 }))));
      const rateLimited = responses.some((r: any) => r.status === 429);
      
      if (!rateLimited) {
        throw new Error('Rate limiting not detected');
      }
      
      return { rateLimitedRequests: responses.filter((r: any) => r.status === 429).length };
    });

    await this.runTest('Security', 'Security Headers', async () => {
      const response = await fetch(`${this.baseUrl}/health`);
      
      const securityHeaders = [
        'x-content-type-options',
        'x-frame-options',
        'x-xss-protection'
      ];
      
      const missingHeaders = securityHeaders.filter(header => !response.headers.get(header));
      
      if (missingHeaders.length > 0) {
        throw new Error(`Missing security headers: ${missingHeaders.join(', ')}`);
      }
      
      return { securityHeadersCount: securityHeaders.length };
    });
  }

  private async testAPIFunctionality(): Promise<void> {
    console.log('🔍 Testing API Functionality...');
    
    await this.runTest('API Functionality', 'Status Endpoint', async () => {
      const response = await fetch(`${this.baseUrl}/api/status`);
      const data = await response.json();
      
      if (!response.ok) throw new Error(`Status endpoint failed: ${response.status}`);
      if (!data.service) throw new Error('No service information');
      if (!data.version) throw new Error('No version information');
      
      return { 
        service: data.service,
        version: data.version,
        environment: data.environment
      };
    });

    await this.runTest('API Functionality', 'Trades Endpoint', async () => {
      const response = await fetch(`${this.baseUrl}/api/trades`);
      const data = await response.json();
      
      if (!response.ok) throw new Error(`Trades endpoint failed: ${response.status}`);
      
      return { message: data.message };
    });

    await this.runTest('API Functionality', 'Users Endpoint', async () => {
      const response = await fetch(`${this.baseUrl}/api/users`);
      const data = await response.json();
      
      if (!response.ok) throw new Error(`Users endpoint failed: ${response.status}`);
      
      return { message: data.message };
    });
  }

  private async runTest(suite: string, name: string, testFn: () => Promise<any>): Promise<void> {
    const start = performance.now();
    
    try {
      const details = await testFn();
      const end = performance.now();
      
      this.results.push({
        testSuite: suite,
        testName: name,
        passed: true,
        duration: Math.round(end - start),
        details
      });
      
      console.log(`   ✅ ${name} (${Math.round(end - start)}ms)`);
    } catch (error: any) {
      const end = performance.now();
      
      this.results.push({
        testSuite: suite,
        testName: name,
        passed: false,
        duration: Math.round(end - start),
        error: error.message
      });
      
      console.log(`   ❌ ${name} - ${error.message} (${Math.round(end - start)}ms)`);
    }
  }

  private printE2EReport(): void {
    console.log('\n📊 END-TO-END TEST REPORT');
    console.log('==========================');
    
    const totalTests = this.results.length;
    const passedTests = this.results.filter(r => r.passed).length;
    const failedTests = totalTests - passedTests;
    const avgDuration = this.results.reduce((sum, r) => sum + r.duration, 0) / totalTests;
    
    console.log(`\n📈 SUMMARY`);
    console.log(`Total Tests: ${totalTests}`);
    console.log(`Passed: ${passedTests} ✅`);
    console.log(`Failed: ${failedTests} ❌`);
    console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
    console.log(`Average Duration: ${Math.round(avgDuration)}ms`);
    
    // Group by test suite
    const suites = [...new Set(this.results.map(r => r.testSuite))];
    
    console.log('\n📋 BY TEST SUITE');
    console.log('================');
    
    suites.forEach(suite => {
      const suiteResults = this.results.filter(r => r.testSuite === suite);
      const suitePassed = suiteResults.filter(r => r.passed).length;
      const suiteTotal = suiteResults.length;
      
      console.log(`\n${suite}: ${suitePassed}/${suiteTotal} passed`);
      
      const failedInSuite = suiteResults.filter(r => !r.passed);
      if (failedInSuite.length > 0) {
        failedInSuite.forEach(test => {
          console.log(`   ❌ ${test.testName}: ${test.error}`);
        });
      }
    });
    
    // Production readiness assessment
    console.log('\n🎯 PRODUCTION READINESS ASSESSMENT');
    console.log('===================================');
    
    const criticalSuites = ['Health System', 'Performance', 'Security'];
    const criticalResults = this.results.filter(r => criticalSuites.includes(r.testSuite));
    const criticalPassed = criticalResults.filter(r => r.passed).length;
    const criticalTotal = criticalResults.length;
    
    const isProductionReady = criticalPassed === criticalTotal && failedTests <= 1;
    
    if (isProductionReady) {
      console.log('🎉 PRODUCTION READY!');
      console.log('====================');
      console.log('✅ All critical systems operational');
      console.log('✅ Performance requirements met');
      console.log('✅ Security measures validated');
      console.log('✅ Ready for live production deployment');
    } else {
      console.log('⚠️  PRODUCTION READINESS ISSUES');
      console.log('===============================');
      if (criticalPassed < criticalTotal) {
        console.log(`❌ Critical system failures: ${criticalTotal - criticalPassed}`);
      }
      if (failedTests > 1) {
        console.log(`❌ Too many test failures: ${failedTests}`);
      }
      console.log('🔧 Address issues before production deployment');
    }
  }
}

// Execute E2E testing
async function executeE2ETesting() {
  const tester = new EndToEndTester();
  const results = await tester.runFullE2ETest();
  
  const failedTests = results.filter(r => !r.passed);
  if (failedTests.length > 1) {
    throw new Error(`E2E testing failed with ${failedTests.length} failures`);
  }
  
  return results;
}

// Only run if this file is executed directly
const isMainModule = process.argv[1]?.endsWith('e2e-test.ts') || process.argv[1]?.endsWith('e2e-test.js');

if (isMainModule) {
  executeE2ETesting()
    .then((results) => {
      console.log('\n✅ E2E testing completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ E2E testing failed:', error.message);
      process.exit(1);
    });
}

export { EndToEndTester, executeE2ETesting };
