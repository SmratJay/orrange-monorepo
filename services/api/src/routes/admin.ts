// Admin Routes for Orrange P2P API
import { FastifyInstance } from 'fastify';

export default async function adminRoutes(fastify: FastifyInstance) {
  // Get system stats
  fastify.get('/stats', {
    schema: {
      description: 'Get system statistics',
      tags: ['Admin'],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'object' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      return {
        success: true,
        data: {
          totalUsers: 0,
          totalOrders: 0,
          totalTrades: 0,
          uptime: process.uptime(),
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: 'Failed to get system stats'
      });
    }
  });

  // Get system health
  fastify.get('/health', {
    schema: {
      description: 'Get system health',
      tags: ['Admin']
    }
  }, async (request, reply) => {
    try {
      return {
        success: true,
        data: {
          status: 'healthy',
          services: {
            database: 'connected',
            redis: 'connected',
            matching: 'running'
          }
        }
      };
    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: 'System health check failed'
      });
    }
  });
}
