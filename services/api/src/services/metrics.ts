// Prometheus Metrics for Production Monitoring
export class PrometheusMetrics {
  private securityEvents: Map<string, number> = new Map();
  private tradeEvents: Map<string, number> = new Map();
  private apiCalls: Array<{ method: string; path: string; statusCode: number; responseTime: number; timestamp: number }> = [];
  private errors: Map<string, number> = new Map();
  private businessEvents: Map<string, number> = new Map();
  private healthChecks: Map<string, { status: string; responseTime?: number; timestamp: number }> = new Map();

  incrementSecurityEvent(event: string) {
    this.securityEvents.set(event, (this.securityEvents.get(event) || 0) + 1);
  }

  incrementTradeEvent(action: string) {
    this.tradeEvents.set(action, (this.tradeEvents.get(action) || 0) + 1);
  }

  recordApiCall(method: string, path: string, statusCode: number, responseTime: number) {
    this.apiCalls.push({ method, path, statusCode, responseTime, timestamp: Date.now() });
    // Keep only last 10000 entries for memory management
    if (this.apiCalls.length > 10000) {
      this.apiCalls = this.apiCalls.slice(-5000);
    }
  }

  incrementError(errorName: string) {
    this.errors.set(errorName, (this.errors.get(errorName) || 0) + 1);
  }

  incrementBusinessEvent(event: string) {
    this.businessEvents.set(event, (this.businessEvents.get(event) || 0) + 1);
  }

  recordHealthCheck(component: string, status: string, responseTime?: number) {
    this.healthChecks.set(component, { status, responseTime, timestamp: Date.now() });
  }

  getMetricsString(): string {
    const metrics: string[] = [];
    
    // Security events metrics
    metrics.push('# HELP orrange_security_events_total Total number of security events');
    metrics.push('# TYPE orrange_security_events_total counter');
    for (const [event, count] of this.securityEvents) {
      metrics.push(`orrange_security_events_total{event="${event}"} ${count}`);
    }

    // Trade events metrics
    metrics.push('# HELP orrange_trade_events_total Total number of trade events');
    metrics.push('# TYPE orrange_trade_events_total counter');
    for (const [action, count] of this.tradeEvents) {
      metrics.push(`orrange_trade_events_total{action="${action}"} ${count}`);
    }

    // API response times
    if (this.apiCalls.length > 0) {
      const avgResponseTime = this.apiCalls.reduce((sum, call) => sum + call.responseTime, 0) / this.apiCalls.length;
      metrics.push('# HELP orrange_api_response_time_avg Average API response time');
      metrics.push('# TYPE orrange_api_response_time_avg gauge');
      metrics.push(`orrange_api_response_time_avg ${avgResponseTime.toFixed(2)}`);
    }

    // Error metrics
    metrics.push('# HELP orrange_errors_total Total number of errors');
    metrics.push('# TYPE orrange_errors_total counter');
    for (const [errorName, count] of this.errors) {
      metrics.push(`orrange_errors_total{error="${errorName}"} ${count}`);
    }

    // Health check metrics
    metrics.push('# HELP orrange_health_status Health status of components');
    metrics.push('# TYPE orrange_health_status gauge');
    for (const [component, check] of this.healthChecks) {
      const status = check.status === 'healthy' ? 1 : 0;
      metrics.push(`orrange_health_status{component="${component}"} ${status}`);
    }

    return metrics.join('\n') + '\n';
  }
}
