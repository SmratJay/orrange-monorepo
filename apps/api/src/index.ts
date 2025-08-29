import express from 'express';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { config, isDevelopment } from '@/config';
import { prisma } from '@/config/database';
import {
  securityMiddleware,
  rateLimitMiddleware,
  errorHandler,
  notFoundHandler,
  requestLogger,
} from '@/middleware/security.middleware';

// Import routes
import authRoutes from '@/routes/auth.routes';

const app = express();

// Trust proxy (for rate limiting and real IP detection)
app.set('trust proxy', 1);

// Security middleware
app.use(securityMiddleware);

// Request parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Logging middleware
if (isDevelopment) {
  app.use(requestLogger);
} else {
  app.use(morgan('combined'));
}

// Rate limiting
app.use(rateLimitMiddleware);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Orrange API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// API routes
app.use('/api/v1/auth', authRoutes);

// 404 handler
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

// Start server
const startServer = async () => {
  try {
    // Test database connection
    await prisma.$connect();
    console.log('📦 Database connected successfully');

    // Start listening
    app.listen(config.PORT, () => {
      console.log(`
🚀 Orrange API Server is running!

📍 Environment: ${config.NODE_ENV}
🌐 Port: ${config.PORT}
🔗 Health Check: http://localhost:${config.PORT}/health
📚 API Base URL: http://localhost:${config.PORT}/api/v1

🔐 Authentication endpoints:
   POST /api/v1/auth/register
   POST /api/v1/auth/login  
   POST /api/v1/auth/refresh
   POST /api/v1/auth/logout
   GET  /api/v1/auth/me
   PATCH /api/v1/auth/profile
   PATCH /api/v1/auth/password

Ready to handle requests! 🎯
      `);
    });

    // Cleanup expired tokens every hour
    setInterval(async () => {
      try {
        await prisma.refreshToken.deleteMany({
          where: {
            expiresAt: {
              lt: new Date(),
            },
          },
        });
      } catch (error) {
        console.error('Token cleanup error:', error);
      }
    }, 60 * 60 * 1000); // 1 hour

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);
  
  try {
    await prisma.$disconnect();
    console.log('📦 Database disconnected');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

startServer();

export default app;
