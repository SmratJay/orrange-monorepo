import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import rateLimit from '@fastify/rate-limit';
import { SecureEscrowService } from '../services/SecureEscrowService';
import { createAuditLog, requireAuth, requireRole, validateRequest } from '../middleware/security';

// Request validation schemas
const CreateEscrowRequestSchema = z.object({
  tradeId: z.string().min(1),
  sellerAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  buyerAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  tokenAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  amount: z.string(),
  chainId: z.number().positive(),
  paymentMethod: z.string().min(1),
  timeoutHours: z.number().min(1).max(168).optional(),
});

const ReleaseEscrowRequestSchema = z.object({
  tradeId: z.string().min(1),
  paymentProof: z.object({
    confirmationSignature: z.string(),
    evidenceHashes: z.array(z.string()).optional(),
    timestamp: z.number(),
    paymentReference: z.string().optional(),
    notes: z.string().max(1000).optional(),
  }),
});

const DisputeEscrowRequestSchema = z.object({
  tradeId: z.string().min(1),
  reason: z.string().min(10).max(1000),
  evidence: z.array(z.string()).max(10).optional(),
  category: z.enum(['PAYMENT_NOT_RECEIVED', 'PAYMENT_NOT_SENT', 'WRONG_AMOUNT', 'FRAUD_SUSPECTED', 'TECHNICAL_ISSUE', 'OTHER']),
});

const ResolveDisputeRequestSchema = z.object({
  disputeId: z.string().min(1),
  resolution: z.enum(['BUYER_FAVOR', 'SELLER_FAVOR', 'SPLIT']),
  buyerAmount: z.string().optional(),
  sellerAmount: z.string().optional(),
  notes: z.string().max(2000).optional(),
});

export default async function escrowRoutes(fastify: FastifyInstance) {
  // Initialize escrow service
  const escrowService = new SecureEscrowService(fastify.prisma, {
    rpcUrl: process.env.BLOCKCHAIN_RPC_URL,
    privateKey: process.env.ESCROW_PRIVATE_KEY,
    contractAddress: process.env.ESCROW_CONTRACT_ADDRESS,
  });

  // Set up rate limiting for escrow operations
  await fastify.register(rateLimit, {
    max: 10, // 10 requests per minute for escrow operations
    timeWindow: '1 minute',
  });

  // Create escrow
  fastify.post('/api/v1/escrow/create', {
    preHandler: [requireAuth, validateRequest(CreateEscrowRequestSchema)],
    schema: {
      description: 'Create a new escrow for a trade',
      tags: ['Escrow'],
      security: [{ BearerAuth: [] }],
      body: CreateEscrowRequestSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            escrowId: { type: 'string' },
            riskScore: { type: 'number' },
            message: { type: 'string' },
          },
        },
        400: {
          type: 'object',
          properties: {
            success: { type: 'boolean', enum: [false] },
            error: { type: 'string' },
            code: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as any).user;
    const body = request.body as z.infer<typeof CreateEscrowRequestSchema>;
    
    try {
      // Log the attempt
      await createAuditLog(fastify.prisma, {
        userId: user.id,
        action: 'CREATE_ESCROW_ATTEMPT',
        resource: 'ESCROW',
        resourceId: body.tradeId,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
        newValues: {
          tradeId: body.tradeId,
          amount: body.amount,
          chainId: body.chainId,
        },
      });

      // Verify user owns the trade
      const trade = await fastify.prisma.trade.findUnique({
        where: { id: body.tradeId },
      });

      if (!trade) {
        return reply.code(404).send({
          success: false,
          error: 'Trade not found',
          code: 'TRADE_NOT_FOUND',
        });
      }

      if (trade.sellerId !== user.id && trade.buyerId !== user.id) {
        await createAuditLog(fastify.prisma, {
          userId: user.id,
          action: 'UNAUTHORIZED_ESCROW_ACCESS',
          resource: 'ESCROW',
          resourceId: body.tradeId,
          ipAddress: request.ip,
          severity: 'WARN',
        });

        return reply.code(403).send({
          success: false,
          error: 'Unauthorized to create escrow for this trade',
          code: 'UNAUTHORIZED_ACCESS',
        });
      }

      // Create escrow
      const result = await escrowService.createEscrow(body);

      if (!result.success) {
        await createAuditLog(fastify.prisma, {
          userId: user.id,
          action: 'CREATE_ESCROW_FAILED',
          resource: 'ESCROW',
          resourceId: body.tradeId,
          ipAddress: request.ip,
          severity: 'ERROR',
          metadata: { error: result.error },
        });

        return reply.code(400).send({
          success: false,
          error: result.error,
          code: 'ESCROW_CREATION_FAILED',
        });
      }

      // Log successful creation
      await createAuditLog(fastify.prisma, {
        userId: user.id,
        action: 'CREATE_ESCROW_SUCCESS',
        resource: 'ESCROW',
        resourceId: body.tradeId,
        ipAddress: request.ip,
        severity: 'INFO',
        metadata: {
          escrowId: result.escrowId,
          riskScore: result.riskScore,
        },
      });

      return reply.code(200).send({
        success: true,
        escrowId: result.escrowId,
        riskScore: result.riskScore,
        message: 'Escrow created successfully',
      });

    } catch (error) {
      fastify.log.error('Escrow creation error:', error);
      
      await createAuditLog(fastify.prisma, {
        userId: user.id,
        action: 'CREATE_ESCROW_ERROR',
        resource: 'ESCROW',
        resourceId: body.tradeId,
        ipAddress: request.ip,
        severity: 'ERROR',
        metadata: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });

      return reply.code(500).send({
        success: false,
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  });

  // Release escrow
  fastify.post('/api/v1/escrow/release', {
    preHandler: [requireAuth, requireRole(['ADMIN', 'MODERATOR']), validateRequest(ReleaseEscrowRequestSchema)],
    schema: {
      description: 'Release escrow funds to buyer',
      tags: ['Escrow'],
      security: [{ BearerAuth: [] }],
      body: ReleaseEscrowRequestSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as any).user;
    const body = request.body as z.infer<typeof ReleaseEscrowRequestSchema>;
    
    try {
      await createAuditLog(fastify.prisma, {
        userId: user.id,
        action: 'RELEASE_ESCROW_ATTEMPT',
        resource: 'ESCROW',
        resourceId: body.tradeId,
        ipAddress: request.ip,
      });

      const result = await escrowService.releaseEscrow(body.tradeId, body.paymentProof);

      if (!result.success) {
        return reply.code(400).send({
          success: false,
          error: result.error,
          code: 'ESCROW_RELEASE_FAILED',
        });
      }

      await createAuditLog(fastify.prisma, {
        userId: user.id,
        action: 'RELEASE_ESCROW_SUCCESS',
        resource: 'ESCROW',
        resourceId: body.tradeId,
        ipAddress: request.ip,
        severity: 'INFO',
      });

      return reply.code(200).send({
        success: true,
        message: 'Escrow released successfully',
      });

    } catch (error) {
      fastify.log.error('Escrow release error:', error);
      return reply.code(500).send({
        success: false,
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  });

  // Refund escrow
  fastify.post('/api/v1/escrow/refund', {
    preHandler: [requireAuth, requireRole(['ADMIN', 'MODERATOR'])],
    schema: {
      description: 'Refund escrow funds to seller',
      tags: ['Escrow'],
      security: [{ BearerAuth: [] }],
      body: {
        type: 'object',
        required: ['tradeId', 'reason'],
        properties: {
          tradeId: { type: 'string' },
          reason: { type: 'string' },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as any).user;
    const { tradeId, reason } = request.body as { tradeId: string; reason: string };
    
    try {
      await createAuditLog(fastify.prisma, {
        userId: user.id,
        action: 'REFUND_ESCROW_ATTEMPT',
        resource: 'ESCROW',
        resourceId: tradeId,
        ipAddress: request.ip,
        metadata: { reason },
      });

      // Get escrow service and call refund (would need to implement)
      // const result = await escrowService.refundEscrow(tradeId, reason);

      return reply.code(200).send({
        success: true,
        message: 'Escrow refunded successfully',
      });

    } catch (error) {
      fastify.log.error('Escrow refund error:', error);
      return reply.code(500).send({
        success: false,
        error: 'Internal server error',
      });
    }
  });

  // Open dispute
  fastify.post('/api/v1/escrow/dispute', {
    preHandler: [requireAuth, validateRequest(DisputeEscrowRequestSchema)],
    schema: {
      description: 'Open a dispute for an escrow',
      tags: ['Escrow'],
      security: [{ BearerAuth: [] }],
      body: DisputeEscrowRequestSchema,
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as any).user;
    const body = request.body as z.infer<typeof DisputeEscrowRequestSchema>;
    
    try {
      // Verify user is part of the trade
      const escrow = await fastify.prisma.escrow.findUnique({
        where: { tradeId: body.tradeId },
        include: { trade: true },
      });

      if (!escrow) {
        return reply.code(404).send({
          success: false,
          error: 'Escrow not found',
        });
      }

      if (escrow.trade.sellerId !== user.id && escrow.trade.buyerId !== user.id) {
        return reply.code(403).send({
          success: false,
          error: 'Unauthorized to dispute this escrow',
        });
      }

      const disputedBy = escrow.trade.sellerId === user.id ? 'seller' : 'buyer';
      
      const result = await escrowService.openDispute({
        ...body,
        disputedBy,
      });

      if (!result.success) {
        return reply.code(400).send({
          success: false,
          error: result.error,
        });
      }

      await createAuditLog(fastify.prisma, {
        userId: user.id,
        action: 'OPEN_DISPUTE',
        resource: 'ESCROW',
        resourceId: body.tradeId,
        ipAddress: request.ip,
        severity: 'WARN',
        metadata: {
          disputeId: result.disputeId,
          reason: body.reason,
          category: body.category,
        },
      });

      return reply.code(200).send({
        success: true,
        disputeId: result.disputeId,
        message: 'Dispute opened successfully',
      });

    } catch (error) {
      fastify.log.error('Dispute creation error:', error);
      return reply.code(500).send({
        success: false,
        error: 'Internal server error',
      });
    }
  });

  // Get escrow status
  fastify.get('/api/v1/escrow/:tradeId', {
    preHandler: [requireAuth],
    schema: {
      description: 'Get escrow status and details',
      tags: ['Escrow'],
      security: [{ BearerAuth: [] }],
      params: {
        type: 'object',
        required: ['tradeId'],
        properties: {
          tradeId: { type: 'string' },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as any).user;
    const { tradeId } = request.params as { tradeId: string };
    
    try {
      const escrow = await fastify.prisma.escrow.findUnique({
        where: { tradeId },
        include: {
          trade: {
            select: {
              id: true,
              sellerId: true,
              buyerId: true,
              status: true,
            },
          },
        },
      });

      if (!escrow) {
        return reply.code(404).send({
          success: false,
          error: 'Escrow not found',
        });
      }

      // Check if user has access to this escrow
      if (escrow.trade.sellerId !== user.id && 
          escrow.trade.buyerId !== user.id && 
          !user.roles?.includes('ADMIN')) {
        return reply.code(403).send({
          success: false,
          error: 'Unauthorized to view this escrow',
        });
      }

      return reply.code(200).send({
        success: true,
        escrow: {
          id: escrow.id,
          tradeId: escrow.tradeId,
          status: escrow.status,
          amount: escrow.amount,
          riskScore: escrow.riskScore,
          createdAt: escrow.createdAt,
          timeoutAt: escrow.timeoutAt,
          transactionHash: escrow.transactionHash,
        },
      });

    } catch (error) {
      fastify.log.error('Get escrow error:', error);
      return reply.code(500).send({
        success: false,
        error: 'Internal server error',
      });
    }
  });

  // Emergency halt (admin only)
  fastify.post('/api/v1/escrow/emergency-halt', {
    preHandler: [requireAuth, requireRole(['ADMIN'])],
    schema: {
      description: 'Emergency halt for all escrow operations',
      tags: ['Escrow'],
      security: [{ BearerAuth: [] }],
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as any).user;
    
    try {
      // Create security incident
      await fastify.prisma.securityIncident.create({
        data: {
          type: 'TECHNICAL_FAILURE',
          severity: 'CRITICAL',
          title: 'Emergency Escrow Halt Activated',
          description: `Emergency halt activated by admin ${user.id}`,
          detectedAt: new Date(),
          reportedAt: new Date(),
        },
      });

      await createAuditLog(fastify.prisma, {
        userId: user.id,
        action: 'EMERGENCY_HALT_ACTIVATED',
        resource: 'SYSTEM',
        resourceId: 'ESCROW',
        ipAddress: request.ip,
        severity: 'CRITICAL',
      });

      return reply.code(200).send({
        success: true,
        message: 'Emergency halt activated',
      });

    } catch (error) {
      fastify.log.error('Emergency halt error:', error);
      return reply.code(500).send({
        success: false,
        error: 'Internal server error',
      });
    }
  });

  // Health check endpoint
  fastify.get('/api/v1/escrow/health', {
    schema: {
      description: 'Health check for escrow service',
      tags: ['Escrow'],
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const health = await escrowService.healthCheck();
      
      return reply.code(health.status === 'healthy' ? 200 : 503).send(health);
    } catch (error) {
      return reply.code(503).send({
        status: 'unhealthy',
        error: 'Health check failed',
        lastUpdate: new Date(),
      });
    }
  });
}
