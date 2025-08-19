// Orrange P2P API - Simple working server
import Fastify from 'fastify';

async function start() {
  const fastify = Fastify({ logger: true });

  // Health check
  fastify.get('/health', async () => {
    return { status: 'OK', timestamp: new Date() };
  });

  // Simple API test
  fastify.get('/api/test', async () => {
    return { message: 'Orrange P2P API is running!' };
  });

  try {
    await fastify.listen({ port: 8080, host: '0.0.0.0' });
    console.log('🚀 Server running on http://localhost:8080');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();
