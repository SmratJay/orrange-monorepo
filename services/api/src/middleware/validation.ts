// Validation Middleware for Orrange P2P API
import { FastifyRequest, FastifyReply } from 'fastify';

export async function validationMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  // Basic validation middleware - extend as needed
  try {
    // Validate content type for POST/PUT requests
    if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
      const contentType = request.headers['content-type'];
      
      if (!contentType?.includes('application/json')) {
        return reply.code(400).send({
          success: false,
          error: 'Content-Type must be application/json'
        });
      }
    }

    // Add more validation logic here as needed
  } catch (error) {
    return reply.code(400).send({
      success: false,
      error: 'Validation failed'
    });
  }
}

export function validateWalletAddress(address: string): boolean {
  // Basic Ethereum address validation
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

export function validateOrderAmount(amount: number): boolean {
  return typeof amount === 'number' && amount > 0 && isFinite(amount);
}

export function validatePrice(price: number): boolean {
  return typeof price === 'number' && price > 0 && isFinite(price);
}
