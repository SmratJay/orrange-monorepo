// Error Handler Middleware for Orrange P2P API
import { FastifyRequest, FastifyReply, FastifyError } from 'fastify';

export async function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
) {
  const isDevelopment = process.env.NODE_ENV === 'development';

  // Log error
  request.log.error({
    error: error.message,
    stack: error.stack,
    url: request.url,
    method: request.method,
  });

  // Validation errors
  if (error.validation) {
    return reply.code(400).send({
      success: false,
      error: 'Validation error',
      details: error.validation
    });
  }

  // JWT errors
  if (error.code === 'FST_JWT_NO_AUTHORIZATION_IN_HEADER') {
    return reply.code(401).send({
      success: false,
      error: 'No authorization header'
    });
  }

  if (error.code === 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED') {
    return reply.code(401).send({
      success: false,
      error: 'Token expired'
    });
  }

  // Rate limit errors
  if (error.statusCode === 429) {
    return reply.code(429).send({
      success: false,
      error: 'Rate limit exceeded'
    });
  }

  // Generic error response
  const statusCode = error.statusCode || 500;
  
  return reply.code(statusCode).send({
    success: false,
    error: isDevelopment ? error.message : 'Internal server error',
    ...(isDevelopment && { stack: error.stack })
  });
}
