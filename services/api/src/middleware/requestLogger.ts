// Request Logger Middleware for Orrange P2P API
import { FastifyRequest, FastifyReply } from 'fastify';

export async function requestLogger(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const startTime = Date.now();

  // Log request
  console.log('Request:', {
    method: request.method,
    url: request.url,
    headers: {
      'user-agent': request.headers['user-agent'],
      'x-forwarded-for': request.headers['x-forwarded-for'],
    },
    query: request.query,
  });

  // Hook into response to log completion
  reply.raw.on('finish', () => {
    const duration = Date.now() - startTime;
    
    console.log('Response:', {
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      duration: `${duration}ms`,
    });
  });
}
