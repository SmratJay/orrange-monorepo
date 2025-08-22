// Database Administration CLI Tools
import { Command } from 'commander';
import { PrismaClient } from '@prisma/client';
import { dbManager } from '../database/manager.js';
import { seeder } from '../database/seeder.js';

const program = new Command();
const prisma = new PrismaClient();

program
  .name('db-admin')
  .description('Orrange P2P Database Administration Tools')
  .version('1.0.0');

// Database seeding commands
program
  .command('seed')
  .description('Seed database with test data')
  .option('-e, --env <environment>', 'Environment (development/production)', 'development')
  .action(async (options) => {
    console.log(`🌱 Seeding database for ${options.env} environment...`);
    
    if (options.env === 'production') {
      console.error('❌ Cannot seed production database with test data!');
      process.exit(1);
    }

    try {
      const result = await seeder.seedDevelopment();
      console.log('✅ Seeding completed:', result);
    } catch (error) {
      console.error('❌ Seeding failed:', error);
      process.exit(1);
    } finally {
      await prisma.$disconnect();
    }
  });

// Database validation
program
  .command('validate')
  .description('Validate database integrity and performance')
  .action(async () => {
    console.log('🔍 Running database validation...');
    
    try {
      const isValid = await seeder.validateDatabase();
      
      if (isValid) {
        console.log('✅ Database validation passed');
      } else {
        console.error('❌ Database validation failed');
        process.exit(1);
      }
    } catch (error) {
      console.error('❌ Validation error:', error);
      process.exit(1);
    } finally {
      await prisma.$disconnect();
    }
  });

// Database statistics
program
  .command('stats')
  .description('Display database statistics')
  .action(async () => {
    console.log('📊 Gathering database statistics...');
    
    try {
      const stats = await gatherDatabaseStats();
      displayStats(stats);
    } catch (error) {
      console.error('❌ Failed to gather stats:', error);
      process.exit(1);
    } finally {
      await prisma.$disconnect();
    }
  });

// Database cleanup
program
  .command('cleanup')
  .description('Clean up old data and optimize database')
  .option('--days <days>', 'Days to keep (default: 90)', '90')
  .option('--dry-run', 'Show what would be deleted without actually deleting')
  .action(async (options) => {
    console.log(`🧹 Database cleanup (${options.dryRun ? 'DRY RUN' : 'LIVE'})...`);
    
    try {
      const result = await cleanupDatabase(parseInt(options.days), options.dryRun);
      console.log('✅ Cleanup completed:', result);
    } catch (error) {
      console.error('❌ Cleanup failed:', error);
      process.exit(1);
    } finally {
      await prisma.$disconnect();
    }
  });

// Cache management
program
  .command('cache')
  .description('Cache management operations')
  .option('--clear', 'Clear all cache')
  .option('--stats', 'Show cache statistics')
  .option('--warmup', 'Warm up cache with common queries')
  .action(async (options) => {
    try {
      if (options.clear) {
        await dbManager.cache.flushall();
        console.log('✅ Cache cleared');
      }
      
      if (options.stats) {
        const info = await dbManager.cache.info('memory');
        console.log('📊 Cache Statistics:');
        console.log(info);
      }
      
      if (options.warmup) {
        console.log('🔥 Warming up cache...');
        await warmupCache();
        console.log('✅ Cache warmed up');
      }
    } catch (error) {
      console.error('❌ Cache operation failed:', error);
      process.exit(1);
    }
  });

// Database migration status
program
  .command('migration')
  .description('Show migration status and pending migrations')
  .action(async () => {
    console.log('🔄 Checking migration status...');
    
    try {
      // This would require direct database queries to check migration table
      console.log('Migration status check would be implemented here');
    } catch (error) {
      console.error('❌ Migration check failed:', error);
      process.exit(1);
    }
  });

// Helper functions
async function gatherDatabaseStats() {
  const [
    userCount,
    orderCount,
    tradeCount,
    disputeCount,
    activeOrders,
    completedTrades,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.order.count(),
    prisma.trade.count(),
    prisma.dispute.count(),
    prisma.order.count({ where: { status: 'ACTIVE' } }),
    prisma.trade.count({ where: { status: 'COMPLETED' } }),
  ]);

  const totalVolume = await prisma.trade.aggregate({
    where: { status: 'COMPLETED' },
    _sum: { totalValue: true },
  });

  return {
    users: userCount,
    orders: { total: orderCount, active: activeOrders },
    trades: { total: tradeCount, completed: completedTrades },
    disputes: disputeCount,
    totalVolume: totalVolume._sum.totalValue || '0',
  };
}

function displayStats(stats: any) {
  console.log('\n📊 Database Statistics:');
  console.log('════════════════════════');
  console.log(`👥 Users: ${stats.users.toLocaleString()}`);
  console.log(`📋 Orders: ${stats.orders.total.toLocaleString()} (${stats.orders.active} active)`);
  console.log(`🤝 Trades: ${stats.trades.total.toLocaleString()} (${stats.trades.completed} completed)`);
  console.log(`⚖️  Disputes: ${stats.disputes.toLocaleString()}`);
  console.log(`💰 Total Volume: $${parseFloat(stats.totalVolume).toLocaleString()}`);
}

async function cleanupDatabase(daysToKeep: number, dryRun: boolean) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

  console.log(`Cleaning data older than ${cutoffDate.toISOString()}`);

  // Find old completed trades
  const oldTrades = await prisma.trade.findMany({
    where: {
      status: 'COMPLETED',
      completedAt: {
        lt: cutoffDate,
      },
    },
    select: { id: true },
  });

  // Find expired orders
  const expiredOrders = await prisma.order.findMany({
    where: {
      status: 'EXPIRED',
      updatedAt: {
        lt: cutoffDate,
      },
    },
    select: { id: true },
  });

  const result = {
    tradesDeleted: oldTrades.length,
    ordersDeleted: expiredOrders.length,
  };

  if (!dryRun) {
    // Delete old trades
    if (oldTrades.length > 0) {
      await prisma.trade.deleteMany({
        where: {
          id: { in: oldTrades.map(t => t.id) },
        },
      });
    }

    // Delete expired orders
    if (expiredOrders.length > 0) {
      await prisma.order.deleteMany({
        where: {
          id: { in: expiredOrders.map(o => o.id) },
        },
      });
    }

    // Optimize database (this would be database-specific)
    console.log('🔧 Running database optimization...');
  }

  return result;
}

async function warmupCache() {
  // Warm up common order book queries
  const commonPairs = ['BTC-USD', 'ETH-USD', 'BTC-EUR'];
  
  for (const pair of commonPairs) {
    await dbManager.getOrderBook(pair, 50);
    console.log(`📈 Warmed up order book for ${pair}`);
  }

  // Warm up user stats for active users
  const activeUsers = await prisma.user.findMany({
    where: {
      lastActivity: {
        gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
      },
    },
    select: { id: true },
    take: 100,
  });

  for (const user of activeUsers) {
    await dbManager.getUserStats(user.id);
  }
  
  console.log(`👥 Warmed up stats for ${activeUsers.length} active users`);
}

// Export for programmatic use
export { gatherDatabaseStats, cleanupDatabase, warmupCache };

// Run CLI if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  program.parse();
}
