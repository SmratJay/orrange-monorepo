/**
 * Fastify Type Declarations for Advanced P2P Services
 * MIT-Level Engineering - Pure P2P Crypto Platform
 */

import P2PMatchingEngine from '../services/P2PMatchingEngine';
import P2POrderManagementService from '../services/P2POrderManagementService';
import P2PMarketDataService from '../services/P2PMarketDataService';
import P2PRealtimeService from '../services/P2PRealtimeService';

declare module 'fastify' {
  interface FastifyInstance {
    // Phase 3 Advanced P2P Trading Services
    p2pEngine: P2PMatchingEngine;
    orderManagementService: P2POrderManagementService;
    marketDataService: P2PMarketDataService;
    realtimeService: P2PRealtimeService;
  }
}
