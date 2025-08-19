import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { PrismaClient } from '@prisma/client';
import { securityMiddleware } from './middleware/security-enhanced';
import { escrowRoutes } from './routes/escrow';

export interface AppOptions {
  logger?: boolean;
  trustProxy?: boolean;
}

export async function buildApp(opts: AppOptions = {}): Promise<FastifyInstance> {
  const app = fastify({
    logger: opts.logger !== false,
    trustProxy: opts.trustProxy || true,
  });

  // Initialize Prisma client
  const prisma = new PrismaClient();

  // Security plugins
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
  });

  await app.register(cors, {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
  });

  await app.register(rateLimit, {
    max: parseInt(process.env.RATE_LIMIT_MAX || '100'),
    timeWindow: parseInt(process.env.RATE_LIMIT_WINDOW || '60000'),
  });

  // Security middleware
  app.addHook('preHandler', securityMiddleware);

  // Health check route (public)
  app.get('/health', async () => {
    return { status: 'healthy', timestamp: new Date().toISOString() };
  });

  // API routes
  await app.register(escrowRoutes, { 
    prefix: '/api/escrow',
    prisma,
  } as FastifyPluginOptions & { prisma: PrismaClient });

  // Enhanced authentication routes
  const { authRoutes } = await import('./routes/auth-enhanced');
  await app.register(authRoutes, {
    prefix: '/api/auth',
    prisma,
  } as FastifyPluginOptions & { prisma: PrismaClient });

  // Global error handler
  app.setErrorHandler(async (error, request, reply) => {
    app.log.error(error);

    // Don't expose internal errors in production
    const isDevelopment = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
    
    if (error.validation) {
      return reply.status(400).send({
        error: 'Validation Error',
        message: 'Invalid input data',
        details: isDevelopment ? error.validation : undefined,
      });
    }

    if (error.statusCode) {
      return reply.status(error.statusCode).send({
        error: error.name,
        message: error.message,
      });
    }

    return reply.status(500).send({
      error: 'Internal Server Error',
      message: isDevelopment ? error.message : 'An unexpected error occurred',
    });
  });

  // Graceful shutdown
  app.addHook('onClose', async () => {
    await prisma.$disconnect();
  });

  return app;
}

// Start server (if not in test environment)
if (require.main === module && process.env.NODE_ENV !== 'test') {
  const start = async () => {
    try {
      const app = await buildApp();
      const port = parseInt(process.env.PORT || '3001');
      const host = process.env.HOST || '0.0.0.0';
      
      await app.listen({ port, host });
      console.log(`🚀 Server running at http://${host}:${port}`);
    } catch (err) {
      console.error('Error starting server:', err);
      process.exit(1);
    }
  };

  start();
}
