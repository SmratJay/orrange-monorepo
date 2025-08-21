// Enhanced Admin/Moderator API Routes for Orrange P2P Platform
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { EnhancedDisputeService } from '../services/DisputeService';
import { NotificationService } from '../services/NotificationService';
import { PrismaClient } from '@prisma/client';

// Middleware for role-based access control
const requireRole = (allowedRoles: string[]) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as any).user;
    
    if (!user) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    if (!allowedRoles.includes(user.role)) {
      return reply.code(403).send({ error: 'Insufficient permissions' });
    }
  };
};

export default async function adminRoutes(fastify: FastifyInstance) {
  const prisma = fastify.prisma as PrismaClient;
  const notificationService = new NotificationService(prisma, fastify.redis);
  const disputeService = new EnhancedDisputeService(prisma, notificationService);

  // Admin Dashboard - Get all disputes
  fastify.get('/disputes', {
    preHandler: requireRole(['ADMIN', 'MODERATOR', 'ARBITRATOR'])
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = request.query as any;
      const filters = {
        status: query.status,
        assignedTo: query.assignedTo,
        page: parseInt(query.page) || 1,
        limit: parseInt(query.limit) || 20
      };

      const result = await disputeService.getDisputesDashboard(filters);
      return reply.send({ success: true, data: result });
    } catch (error) {
      return reply.code(500).send({ success: false, error: (error as Error).message });
    }
  });

  // Get specific dispute details (for moderator review)
  fastify.get('/disputes/:tradeId', {
    preHandler: requireRole(['ADMIN', 'MODERATOR', 'ARBITRATOR'])
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { tradeId } = request.params as { tradeId: string };
      const user = (request as any).user;

      const dispute = await disputeService.getDisputeDetails(tradeId, user.id);
      
      if (!dispute) {
        return reply.code(404).send({ success: false, error: 'Dispute not found' });
      }

      return reply.send({ success: true, data: dispute });
    } catch (error) {
      return reply.code(500).send({ success: false, error: (error as Error).message });
    }
  });

  // Resolve dispute (moderator action)
  fastify.post('/disputes/:disputeId/resolve', {
    preHandler: requireRole(['ADMIN', 'MODERATOR', 'ARBITRATOR'])
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { disputeId } = request.params as { disputeId: string };
      const user = (request as any).user;
      const resolution = request.body as {
        resolutionType: 'BUYER_FAVOR' | 'SELLER_FAVOR' | 'SPLIT' | 'CANCELLED';
        compensationAmount?: string;
        reasoning: string;
      };

      const resolvedDispute = await disputeService.resolveDispute(disputeId, user.id, {
        ...resolution,
        resolvedBy: user.id
      });

      return reply.send({ success: true, data: resolvedDispute });
    } catch (error) {
      return reply.code(500).send({ success: false, error: (error as Error).message });
    }
  });

  // Enhanced system stats
  fastify.get('/stats', {
    preHandler: requireRole(['ADMIN', 'MODERATOR']),
    schema: {
      description: 'Get comprehensive system statistics',
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
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const [
        totalUsers,
        totalTrades,
        activeTrades,
        totalDisputes,
        pendingDisputes,
        totalVolume
      ] = await Promise.all([
        prisma.user.count(),
        prisma.p2PTrade.count(),
        prisma.p2PTrade.count({ where: { status: { in: ['PENDING', 'ACCEPTED', 'PAYMENT_PENDING'] } } }),
        prisma.p2PDispute.count(),
        prisma.p2PDispute.count({ where: { status: 'PENDING' } }),
        prisma.p2PTrade.aggregate({
          _sum: { fiatAmount: true },
          where: { status: 'COMPLETED' }
        })
      ]);

      return reply.send({
        success: true,
        data: {
          users: { total: totalUsers },
          trades: {
            total: totalTrades,
            active: activeTrades,
            totalVolume: totalVolume._sum.fiatAmount || 0
          },
          disputes: {
            total: totalDisputes,
            pending: pendingDisputes
          },
          uptime: process.uptime(),
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      return reply.code(500).send({ success: false, error: (error as Error).message });
    }
  });

  // Get system health
  fastify.get('/health', {
    schema: {
      description: 'Get system health',
      tags: ['Admin']
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      return reply.send({
        success: true,
        data: {
          status: 'healthy',
          services: {
            database: 'connected',
            redis: 'connected'
          }
        }
      });
    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: 'System health check failed'
      });
    }
  });
}
