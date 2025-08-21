// Auth Middleware for Orrange P2P API
import { FastifyRequest, FastifyReply } from 'fastify';

export interface AuthRequest extends FastifyRequest {
  user: {
    id: string;
    address: string;
  };
}

export async function authMiddleware(
  request: AuthRequest,
  reply: FastifyReply
) {
  try {
    const token = request.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return reply.code(401).send({
        success: false,
        error: 'No token provided'
      });
    }

    // TODO: Implement actual JWT verification
    // For now, mock authentication
    request.user = {
      id: 'mock-user-id',
      address: '0x...'
    };

  } catch (error) {
    return reply.code(401).send({
      success: false,
      error: 'Invalid token'
    });
  }
}

export async function optionalAuthMiddleware(
  request: AuthRequest,
  reply: FastifyReply
) {
  try {
    const token = request.headers.authorization?.replace('Bearer ', '');
    
    if (token) {
      // TODO: Implement actual JWT verification
      request.user = {
        id: 'mock-user-id',
        address: '0x...'
      };
    }
  } catch (error) {
    // Optional auth - just continue without user
  }
}
