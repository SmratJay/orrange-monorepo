/**
 * Real-time Security Dashboard - Phase 3C Implementation
 * Live Security Monitoring & Analytics System
 * 
 * Features:
 * - Real-time threat monitoring
 * - Security metrics & analytics
 * - Fraud detection alerts
 * - Compliance dashboard
 * - Incident response tracking
 * - Performance monitoring
 * - Advanced visualization data
 */

import { EventEmitter } from 'events';
import { SecurityService, SecurityEventType, RiskLevel } from './SecurityService.js';
import { FraudDetectionService, FraudAnalysisResult } from './FraudDetectionService.js';
import { AuditService, AuditEventType, AuditSeverity, ComplianceStandard } from './AuditService.js';

/**
 * Dashboard Metric Interfaces
 */
export interface SecurityMetrics {
  timestamp: Date;
  totalUsers: number;
  activeUsers: number;
  activeSessions: number;
  securityAlerts: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  fraudDetection: {
    totalTransactions: number;
    suspiciousTransactions: number;
    blockedTransactions: number;
    falsePositiveRate: number;
    averageRiskScore: number;
  };
  authentication: {
    totalLogins: number;
    successfulLogins: number;
    failedLogins: number;
    mfaEnabled: number;
    mfaUsage: number;
  };
  systemHealth: {
    uptime: number;
    responseTime: number;
    errorRate: number;
    throughput: number;
  };
}

export interface ThreatEvent {
  id: string;
  timestamp: Date;
  type: ThreatType;
  severity: ThreatSeverity;
  source: string;
  target?: string;
  description: string;
  metadata: Record<string, any>;
  status: ThreatStatus;
  resolution?: string;
}

export enum ThreatType {
  FRAUD_ATTEMPT = 'FRAUD_ATTEMPT',
  BRUTE_FORCE = 'BRUTE_FORCE',
  SUSPICIOUS_LOGIN = 'SUSPICIOUS_LOGIN',
  ACCOUNT_TAKEOVER = 'ACCOUNT_TAKEOVER',
  DATA_EXFILTRATION = 'DATA_EXFILTRATION',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  MALICIOUS_IP = 'MALICIOUS_IP',
  SESSION_HIJACKING = 'SESSION_HIJACKING',
  PRIVILEGE_ESCALATION = 'PRIVILEGE_ESCALATION',
  COMPLIANCE_VIOLATION = 'COMPLIANCE_VIOLATION'
}

export enum ThreatSeverity {
  CRITICAL = 'CRITICAL',
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
  INFO = 'INFO'
}

export enum ThreatStatus {
  ACTIVE = 'ACTIVE',
  INVESTIGATING = 'INVESTIGATING',
  MITIGATED = 'MITIGATED',
  RESOLVED = 'RESOLVED',
  FALSE_POSITIVE = 'FALSE_POSITIVE'
}

export interface ComplianceMetrics {
  standard: ComplianceStandard;
  complianceScore: number;
  violations: number;
  requirements: {
    total: number;
    met: number;
    pending: number;
    failed: number;
  };
  lastAudit: Date;
  nextAudit: Date;
}

export interface PerformanceMetrics {
  endpoint: string;
  avgResponseTime: number;
  requestCount: number;
  errorRate: number;
  throughput: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
}

/**
 * Real-time Security Dashboard Service
 */
export class SecurityDashboardService extends EventEmitter {
  private metricsBuffer: SecurityMetrics[] = [];
  private threatEvents: Map<string, ThreatEvent> = new Map();
  private performanceMetrics: Map<string, PerformanceMetrics> = new Map();
  private complianceMetrics: Map<ComplianceStandard, ComplianceMetrics> = new Map();
  private isMonitoring = false;
  private monitoringInterval?: NodeJS.Timeout;

  // Real-time counters
  private counters = {
    totalLogins: 0,
    successfulLogins: 0,
    failedLogins: 0,
    totalTransactions: 0,
    suspiciousTransactions: 0,
    blockedTransactions: 0,
    securityAlerts: 0,
    fraudAttempts: 0,
    responseTimeSum: 0,
    requestCount: 0,
    errorCount: 0
  };

  constructor(
    private securityService: SecurityService,
    private fraudDetectionService: FraudDetectionService,
    private auditService: AuditService
  ) {
    super();
    console.log('📊 Initializing Security Dashboard Service...');
    
    this.setupEventListeners();
    this.initializeCompliance();
  }

  /**
   * Start real-time monitoring
   */
  async startMonitoring(intervalMs: number = 5000): Promise<void> {
    if (this.isMonitoring) {
      console.log('Security monitoring already active');
      return;
    }

    console.log('🔍 Starting real-time security monitoring...');
    this.isMonitoring = true;

    // Collect metrics every interval
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.collectMetrics();
        this.emit('metricsUpdated', await this.getCurrentMetrics());
      } catch (error) {
        console.error('Error collecting security metrics:', error);
      }
    }, intervalMs);

    // Initial metrics collection
    await this.collectMetrics();
    this.emit('monitoringStarted');
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (!this.isMonitoring) {
      return;
    }

    console.log('🛑 Stopping security monitoring...');
    this.isMonitoring = false;

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }

    this.emit('monitoringStopped');
  }

  /**
   * Get current security metrics
   */
  async getCurrentMetrics(): Promise<SecurityMetrics> {
    const now = new Date();

    return {
      timestamp: now,
      totalUsers: await this.getTotalUsers(),
      activeUsers: await this.getActiveUsers(),
      activeSessions: await this.getActiveSessions(),
      securityAlerts: await this.getSecurityAlerts(),
      fraudDetection: await this.getFraudMetrics(),
      authentication: await this.getAuthMetrics(),
      systemHealth: await this.getSystemHealth()
    };
  }

  /**
   * Get real-time threat events
   */
  getActiveThreatEvents(): ThreatEvent[] {
    return Array.from(this.threatEvents.values())
      .filter(event => event.status === ThreatStatus.ACTIVE || event.status === ThreatStatus.INVESTIGATING)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Get compliance metrics
   */
  getComplianceMetrics(): ComplianceMetrics[] {
    return Array.from(this.complianceMetrics.values());
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): PerformanceMetrics[] {
    return Array.from(this.performanceMetrics.values())
      .sort((a, b) => b.requestCount - a.requestCount);
  }

  /**
   * Create threat event
   */
  async createThreatEvent(
    type: ThreatType,
    severity: ThreatSeverity,
    source: string,
    description: string,
    metadata: Record<string, any> = {},
    target?: string
  ): Promise<string> {
    const eventId = `threat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const threatEvent: ThreatEvent = {
      id: eventId,
      timestamp: new Date(),
      type,
      severity,
      source,
      target,
      description,
      metadata,
      status: ThreatStatus.ACTIVE
    };

    this.threatEvents.set(eventId, threatEvent);
    this.counters.securityAlerts++;

    // Emit real-time alert
    this.emit('threatDetected', threatEvent);

    // Log to audit system
    await this.auditService.logAuditEvent({
      eventType: AuditEventType.SECURITY_ALERT,
      severity: this.mapThreatSeverityToAuditSeverity(severity),
      userId: target,
      sessionId: metadata.sessionId,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      resource: 'security-dashboard',
      action: 'threat-detected',
      details: {
        threatId: eventId,
        threatType: type,
        description,
        source,
        metadata
      }
    });

    console.log(`🚨 Threat detected: ${type} (${severity}) from ${source}`);
    return eventId;
  }

  /**
   * Update threat event status
   */
  async updateThreatStatus(
    eventId: string,
    status: ThreatStatus,
    resolution?: string
  ): Promise<void> {
    const event = this.threatEvents.get(eventId);
    if (!event) {
      throw new Error(`Threat event ${eventId} not found`);
    }

    event.status = status;
    if (resolution) {
      event.resolution = resolution;
    }

    this.threatEvents.set(eventId, event);
    this.emit('threatUpdated', event);

    // Log status update
    await this.auditService.logAuditEvent({
      eventType: AuditEventType.SECURITY_ALERT,
      severity: AuditSeverity.INFO,
      userId: event.target,
      sessionId: event.metadata.sessionId,
      ipAddress: event.metadata.ipAddress,
      userAgent: event.metadata.userAgent,
      resource: 'security-dashboard',
      action: 'threat-status-updated',
      details: {
        threatId: eventId,
        oldStatus: event.status,
        newStatus: status,
        resolution
      }
    });
  }

  /**
   * Record API performance metrics
   */
  recordPerformanceMetric(
    endpoint: string,
    responseTime: number,
    success: boolean
  ): void {
    const existing = this.performanceMetrics.get(endpoint) || {
      endpoint,
      avgResponseTime: 0,
      requestCount: 0,
      errorRate: 0,
      throughput: 0,
      p95ResponseTime: 0,
      p99ResponseTime: 0
    };

    existing.requestCount++;
    existing.avgResponseTime = (existing.avgResponseTime * (existing.requestCount - 1) + responseTime) / existing.requestCount;
    
    if (!success) {
      existing.errorRate = ((existing.errorRate * (existing.requestCount - 1)) + 1) / existing.requestCount;
    } else {
      existing.errorRate = (existing.errorRate * (existing.requestCount - 1)) / existing.requestCount;
    }

    // Update counters for system metrics
    this.counters.responseTimeSum += responseTime;
    this.counters.requestCount++;
    if (!success) {
      this.counters.errorCount++;
    }

    this.performanceMetrics.set(endpoint, existing);
  }

  /**
   * Record authentication event
   */
  recordAuthEvent(type: 'login' | 'logout' | 'mfa', success: boolean): void {
    if (type === 'login') {
      this.counters.totalLogins++;
      if (success) {
        this.counters.successfulLogins++;
      } else {
        this.counters.failedLogins++;
      }
    }
  }

  /**
   * Record fraud detection result
   */
  recordFraudResult(result: FraudAnalysisResult): void {
    this.counters.totalTransactions++;
    
    if (result.riskLevel === 'HIGH' || result.riskLevel === 'CRITICAL') {
      this.counters.suspiciousTransactions++;
    }
    
    if (result.riskLevel === 'CRITICAL') {
      this.counters.blockedTransactions++;
      this.counters.fraudAttempts++;
    }
  }

  /**
   * Get system health dashboard
   */
  async getSystemHealthDashboard(): Promise<{
    status: 'healthy' | 'warning' | 'critical';
    uptime: number;
    services: Record<string, 'operational' | 'degraded' | 'down'>;
    metrics: SecurityMetrics;
    alerts: ThreatEvent[];
    performance: PerformanceMetrics[];
  }> {
    const metrics = await this.getCurrentMetrics();
    const alerts = this.getActiveThreatEvents();
    const performance = this.getPerformanceMetrics();

    const criticalAlerts = alerts.filter(a => a.severity === ThreatSeverity.CRITICAL).length;
    const errorRate = this.counters.requestCount > 0 ? (this.counters.errorCount / this.counters.requestCount) : 0;

    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (criticalAlerts > 0 || errorRate > 0.05) {
      status = 'critical';
    } else if (alerts.length > 10 || errorRate > 0.02) {
      status = 'warning';
    }

    return {
      status,
      uptime: process.uptime(),
      services: {
        security: 'operational',
        fraudDetection: 'operational',
        audit: 'operational',
        database: 'operational'
      },
      metrics,
      alerts: alerts.slice(0, 10), // Latest 10 alerts
      performance: performance.slice(0, 10) // Top 10 endpoints
    };
  }

  // ===================
  // PRIVATE METHODS
  // ===================

  private setupEventListeners(): void {
    // Listen for security events (would integrate with actual services)
    this.on('loginAttempt', (data: { userId: string; success: boolean; ip: string }) => {
      this.recordAuthEvent('login', data.success);
      
      if (!data.success) {
        this.createThreatEvent(
          ThreatType.BRUTE_FORCE,
          ThreatSeverity.MEDIUM,
          data.ip,
          'Failed login attempt detected',
          { userId: data.userId, ipAddress: data.ip },
          data.userId
        );
      }
    });
  }

  private async collectMetrics(): Promise<void> {
    const metrics = await this.getCurrentMetrics();
    this.metricsBuffer.push(metrics);

    // Keep only last 1000 metrics (about 1.4 hours at 5s intervals)
    if (this.metricsBuffer.length > 1000) {
      this.metricsBuffer = this.metricsBuffer.slice(-1000);
    }

    // Update compliance metrics
    await this.updateComplianceMetrics();
  }

  private async getTotalUsers(): Promise<number> {
    // TODO: Get from actual user service
    return 1250;
  }

  private async getActiveUsers(): Promise<number> {
    // TODO: Get from actual session service
    return 89;
  }

  private async getActiveSessions(): Promise<number> {
    // TODO: Get from actual session service
    return 124;
  }

  private async getSecurityAlerts(): Promise<SecurityMetrics['securityAlerts']> {
    const events = Array.from(this.threatEvents.values());
    
    return {
      total: events.length,
      critical: events.filter(e => e.severity === ThreatSeverity.CRITICAL).length,
      high: events.filter(e => e.severity === ThreatSeverity.HIGH).length,
      medium: events.filter(e => e.severity === ThreatSeverity.MEDIUM).length,
      low: events.filter(e => e.severity === ThreatSeverity.LOW).length
    };
  }

  private async getFraudMetrics(): Promise<SecurityMetrics['fraudDetection']> {
    const suspiciousRate = this.counters.totalTransactions > 0 
      ? this.counters.suspiciousTransactions / this.counters.totalTransactions 
      : 0;

    return {
      totalTransactions: this.counters.totalTransactions,
      suspiciousTransactions: this.counters.suspiciousTransactions,
      blockedTransactions: this.counters.blockedTransactions,
      falsePositiveRate: Math.max(0, 1 - suspiciousRate - 0.95), // Simulated
      averageRiskScore: 0.15 // Simulated
    };
  }

  private async getAuthMetrics(): Promise<SecurityMetrics['authentication']> {
    return {
      totalLogins: this.counters.totalLogins,
      successfulLogins: this.counters.successfulLogins,
      failedLogins: this.counters.failedLogins,
      mfaEnabled: 45, // Simulated
      mfaUsage: 38 // Simulated
    };
  }

  private async getSystemHealth(): Promise<SecurityMetrics['systemHealth']> {
    const avgResponseTime = this.counters.requestCount > 0 
      ? this.counters.responseTimeSum / this.counters.requestCount 
      : 0;

    const errorRate = this.counters.requestCount > 0 
      ? this.counters.errorCount / this.counters.requestCount 
      : 0;

    return {
      uptime: process.uptime(),
      responseTime: avgResponseTime,
      errorRate: errorRate * 100, // As percentage
      throughput: this.counters.requestCount / (process.uptime() / 60) // Requests per minute
    };
  }

  private async updateComplianceMetrics(): Promise<void> {
    const standards = [ComplianceStandard.SOX, ComplianceStandard.GDPR, ComplianceStandard.PCI_DSS];

    for (const standard of standards) {
      const metrics: ComplianceMetrics = {
        standard,
        complianceScore: this.calculateComplianceScore(standard),
        violations: this.getComplianceViolations(standard),
        requirements: {
          total: this.getComplianceRequirements(standard),
          met: this.getMetRequirements(standard),
          pending: this.getPendingRequirements(standard),
          failed: this.getFailedRequirements(standard)
        },
        lastAudit: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
        nextAudit: new Date(Date.now() + 23 * 24 * 60 * 60 * 1000) // 23 days from now
      };

      this.complianceMetrics.set(standard, metrics);
    }
  }

  private calculateComplianceScore(standard: ComplianceStandard): number {
    // Simulated compliance scores
    switch (standard) {
      case ComplianceStandard.SOX: return 94.5;
      case ComplianceStandard.GDPR: return 97.8;
      case ComplianceStandard.PCI_DSS: return 92.1;
      default: return 90.0;
    }
  }

  private getComplianceViolations(standard: ComplianceStandard): number {
    // Simulated violation counts
    switch (standard) {
      case ComplianceStandard.SOX: return 2;
      case ComplianceStandard.GDPR: return 1;
      case ComplianceStandard.PCI_DSS: return 3;
      default: return 0;
    }
  }

  private getComplianceRequirements(standard: ComplianceStandard): number {
    // Simulated requirement counts
    switch (standard) {
      case ComplianceStandard.SOX: return 45;
      case ComplianceStandard.GDPR: return 67;
      case ComplianceStandard.PCI_DSS: return 89;
      default: return 50;
    }
  }

  private getMetRequirements(standard: ComplianceStandard): number {
    const total = this.getComplianceRequirements(standard);
    const score = this.calculateComplianceScore(standard) / 100;
    return Math.floor(total * score);
  }

  private getPendingRequirements(standard: ComplianceStandard): number {
    const total = this.getComplianceRequirements(standard);
    const met = this.getMetRequirements(standard);
    const failed = this.getFailedRequirements(standard);
    return Math.max(0, total - met - failed);
  }

  private getFailedRequirements(standard: ComplianceStandard): number {
    return this.getComplianceViolations(standard);
  }

  private initializeCompliance(): void {
    // Initialize compliance tracking
    this.updateComplianceMetrics();
  }

  private mapThreatSeverityToAuditSeverity(severity: ThreatSeverity): AuditSeverity {
    switch (severity) {
      case ThreatSeverity.CRITICAL: return AuditSeverity.CRITICAL;
      case ThreatSeverity.HIGH: return AuditSeverity.ERROR;
      case ThreatSeverity.MEDIUM: return AuditSeverity.WARNING;
      case ThreatSeverity.LOW: return AuditSeverity.INFO;
      case ThreatSeverity.INFO: return AuditSeverity.DEBUG;
      default: return AuditSeverity.INFO;
    }
  }
}

/**
 * Security Dashboard Factory
 */
export function createSecurityDashboard(
  securityService: SecurityService,
  fraudDetectionService: FraudDetectionService,
  auditService: AuditService
): SecurityDashboardService {
  return new SecurityDashboardService(securityService, fraudDetectionService, auditService);
}

console.log('📊 Security Dashboard Service module loaded');
export default SecurityDashboardService;
