// Request Logger Middleware for Orrange P2P API
import { FastifyRequest, FastifyReply } from 'fastify';

export async function requestLogger(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const startTime = Date.now();

  // Log request
  request.log.info({
    method: request.method,
    url: request.url,
    headers: {
      'user-agent': request.headers['user-agent'],
      'x-forwarded-for': request.headers['x-forwarded-for'],
    },
    query: request.query,
  });

  // Hook into response to log completion
  reply.addHook('onSend', async (request, reply, payload) => {
    const duration = Date.now() - startTime;
    
    request.log.info({
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      duration: `${duration}ms`,
      responseSize: payload ? Buffer.byteLength(payload.toString()) : 0
    });

    return payload;
  });
}
