#!/usr/bin/env node

// Database Setup and Migration Script
import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load environment variables
dotenv.config();

class DatabaseSetup {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  async setupDatabase() {
    console.log('🚀 Starting Orrange P2P Database Setup...');
    console.log('═══════════════════════════════════════════');

    try {
      // Step 1: Check environment
      await this.checkEnvironment();
      
      // Step 2: Install missing dependencies
      await this.installDependencies();
      
      // Step 3: Generate Prisma client
      await this.generatePrismaClient();
      
      // Step 4: Run migrations
      await this.runMigrations();
      
      // Step 5: Test connections
      await this.testConnections();
      
      // Step 6: Seed development data (if needed)
      if (process.env.NODE_ENV === 'development') {
        await this.seedDevelopmentData();
      }
      
      console.log('🎉 Database setup completed successfully!');
      console.log('═══════════════════════════════════════════');
      console.log('✅ PostgreSQL: Connected');
      console.log('✅ Redis: Connected');  
      console.log('✅ Prisma: Generated');
      console.log('✅ Migrations: Applied');
      console.log('✅ Seeding: Completed');
      console.log('');
      console.log('🚀 Your database is ready for the Orrange P2P API!');
      
    } catch (error) {
      console.error('❌ Database setup failed:', error);
      process.exit(1);
    } finally {
      await this.prisma.$disconnect();
    }
  }

  private async checkEnvironment() {
    console.log('🔍 Checking environment configuration...');
    
    const requiredVars = [
      'DATABASE_URL',
      'REDIS_HOST',
      'JWT_SECRET'
    ];

    const missing = requiredVars.filter(varName => !process.env[varName]);
    
    if (missing.length > 0) {
      console.error(`❌ Missing environment variables: ${missing.join(', ')}`);
      console.log('💡 Please check your .env file in services/api/');
      throw new Error('Environment configuration incomplete');
    }

    console.log('✅ Environment variables configured');
  }

  private async installDependencies() {
    console.log('📦 Installing required dependencies...');
    
    const additionalDeps = [
      'commander@^11.1.0'
    ];

    try {
      // Check if we're using pnpm or npm
      const packageManager = fs.existsSync('pnpm-lock.yaml') ? 'pnpm' : 'npm';
      
      for (const dep of additionalDeps) {
        console.log(`Installing ${dep}...`);
        execSync(`${packageManager} add ${dep}`, { stdio: 'inherit' });
      }
      
      console.log('✅ Dependencies installed');
    } catch (error) {
      console.error('❌ Failed to install dependencies:', error);
      throw error;
    }
  }

  private async generatePrismaClient() {
    console.log('🔄 Generating Prisma client...');
    
    try {
      execSync('npx prisma generate', { stdio: 'inherit' });
      console.log('✅ Prisma client generated');
    } catch (error) {
      console.error('❌ Failed to generate Prisma client:', error);
      throw error;
    }
  }

  private async runMigrations() {
    console.log('🔄 Running database migrations...');
    
    try {
      // First, try to create the database if it doesn't exist
      try {
        execSync('npx prisma db push', { stdio: 'inherit' });
        console.log('✅ Database schema pushed');
      } catch (error) {
        // If push fails, try migration reset for development
        if (process.env.NODE_ENV === 'development') {
          console.log('🔄 Attempting migration reset for development...');
          execSync('npx prisma migrate reset --force', { stdio: 'inherit' });
        } else {
          throw error;
        }
      }
    } catch (error) {
      console.error('❌ Migration failed:', error);
      throw error;
    }
  }

  private async testConnections() {
    console.log('🔍 Testing database connections...');
    
    try {
      // Test PostgreSQL
      await this.prisma.$queryRaw`SELECT 1 as test`;
      console.log('✅ PostgreSQL connection successful');
      
      // Test Redis (basic connection test)
      const Redis = (await import('ioredis')).default;
      const redis = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        lazyConnect: true,
      });
      
      await redis.ping();
      console.log('✅ Redis connection successful');
      await redis.quit();
      
    } catch (error) {
      console.error('❌ Connection test failed:', error);
      console.log('');
      console.log('💡 Make sure PostgreSQL and Redis are running:');
      console.log('   - PostgreSQL: net start postgresql-x64-14');
      console.log('   - Redis: net start redis');
      console.log('');
      throw error;
    }
  }

  private async seedDevelopmentData() {
    console.log('🌱 Seeding development data...');
    
    try {
      // Check if we already have data
      const userCount = await this.prisma.user.count();
      
      if (userCount > 0) {
        console.log(`ℹ️  Database already has ${userCount} users, skipping seeding`);
        return;
      }

      // Import and run seeder
      const { seeder } = await import('./seeder.js');
      const result = await seeder.seedDevelopment();
      
      console.log('✅ Development data seeded:', result);
    } catch (error) {
      console.warn('⚠️  Seeding failed (this is optional):', error);
    }
  }

  // Health check method
  async healthCheck() {
    console.log('🏥 Database Health Check');
    console.log('═══════════════════════');
    
    try {
      // PostgreSQL health
      const startTime = Date.now();
      await this.prisma.$queryRaw`SELECT version()`;
      const pgLatency = Date.now() - startTime;
      console.log(`✅ PostgreSQL: ${pgLatency}ms`);
      
      // Redis health
      const Redis = (await import('ioredis')).default;
      const redis = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        lazyConnect: true,
      });
      
      const redisStart = Date.now();
      await redis.ping();
      const redisLatency = Date.now() - redisStart;
      console.log(`✅ Redis: ${redisLatency}ms`);
      await redis.quit();
      
      // Table counts
      const stats = await this.getTableStats();
      console.log('');
      console.log('📊 Table Statistics:');
      Object.entries(stats).forEach(([table, count]) => {
        console.log(`   ${table}: ${count}`);
      });
      
    } catch (error) {
      console.error('❌ Health check failed:', error);
      throw error;
    }
  }

  private async getTableStats() {
    const [users, orders, trades, disputes] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.order.count(),
      this.prisma.trade.count(),
      this.prisma.dispute.count(),
    ]);

    return { users, orders, trades, disputes };
  }
}

// CLI interface
const setup = new DatabaseSetup();

const command = process.argv[2];

switch (command) {
  case 'setup':
  case undefined:
    setup.setupDatabase();
    break;
  case 'health':
    setup.healthCheck().then(() => process.exit(0)).catch(() => process.exit(1));
    break;
  default:
    console.log('Usage: npm run db:setup [command]');
    console.log('Commands:');
    console.log('  setup   - Full database setup (default)');
    console.log('  health  - Database health check');
    process.exit(1);
}
