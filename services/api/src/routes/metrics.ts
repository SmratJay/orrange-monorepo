/**
 * Week 3 Day 3: Production Metrics API Endpoint
 * Prometheus-compatible metrics endpoint for monitoring
 */

import { Request, Response } from 'express';
import { getMetrics } from '../utils/metrics.js';
import { log } from '../utils/logger.js';

// Metrics endpoint for Prometheus scraping
export const metricsEndpoint = async (req: Request, res: Response) => {
  try {
    const metrics = await getMetrics();
    
    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(metrics);
    
    log.debug('Metrics endpoint accessed', {
      endpoint: '/metrics',
      userAgent: req.get('User-Agent'),
      ip: req.ip
    });
  } catch (error: any) {
    log.error('Failed to generate metrics', { 
      error: error.message,
      endpoint: '/metrics'
    });
    
    res.status(500).json({
      error: 'Failed to generate metrics',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

// Metrics summary endpoint (human-readable JSON)
export const metricsSummary = async (req: Request, res: Response) => {
  try {
    const rawMetrics = await getMetrics();
    
    // Parse Prometheus metrics into a more readable format
    const lines = rawMetrics.split('\n').filter(line => line.trim() && !line.startsWith('#'));
    const summary: Record<string, any> = {};
    
    lines.forEach(line => {
      const [nameAndLabels, value] = line.split(' ');
      const [name] = nameAndLabels.split('{');
      
      if (!summary[name]) {
        summary[name] = [];
      }
      
      summary[name].push({
        labels: nameAndLabels.includes('{') ? nameAndLabels.split('{')[1].replace('}', '') : '',
        value: parseFloat(value)
      });
    });
    
    res.json({
      timestamp: new Date().toISOString(),
      metricsCount: Object.keys(summary).length,
      summary
    });
    
    log.info('Metrics summary generated', {
      endpoint: '/metrics/summary',
      metricsCount: Object.keys(summary).length
    });
  } catch (error: any) {
    log.error('Failed to generate metrics summary', { 
      error: error.message,
      endpoint: '/metrics/summary'
    });
    
    res.status(500).json({
      error: 'Failed to generate metrics summary',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
};
