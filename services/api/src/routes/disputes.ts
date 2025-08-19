// Dispute Routes for Orrange P2P API
import { FastifyInstance } from 'fastify';

export default async function disputeRoutes(fastify: FastifyInstance) {
  // Get disputes for user
  fastify.get('/', {
    schema: {
      description: 'Get user disputes',
      tags: ['Disputes'],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'array' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      // TODO: Implement actual dispute fetching
      return {
        success: true,
        data: []
      };
    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: 'Failed to get disputes'
      });
    }
  });

  // Create new dispute
  fastify.post('/', {
    schema: {
      description: 'Create new dispute',
      tags: ['Disputes'],
      body: {
        type: 'object',
        properties: {
          orderId: { type: 'string' },
          reason: { type: 'string' },
          description: { type: 'string' }
        },
        required: ['orderId', 'reason']
      }
    }
  }, async (request, reply) => {
    try {
      // TODO: Implement actual dispute creation
      return {
        success: true,
        message: 'Dispute created successfully',
        data: {
          id: 'mock-dispute-id',
          status: 'PENDING'
        }
      };
    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: 'Failed to create dispute'
      });
    }
  });
}
