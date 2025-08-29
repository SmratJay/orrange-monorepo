import { db } from './connection';

export async function healthCheck(): Promise<boolean> {
  try {
    await db.query('SELECT 1');
    return true;
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
}

export async function checkTables(): Promise<string[]> {
  try {
    const tables = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    return tables.map((row: any) => row.table_name);
  } catch (error) {
    console.error('Table check failed:', error);
    return [];
  }
}

// Quick test script
if (require.main === module) {
  (async () => {
    console.log('🔍 Testing database connection...');
    
    const isHealthy = await healthCheck();
    if (!isHealthy) {
      console.log('❌ Database connection failed');
      process.exit(1);
    }
    
    console.log('✅ Database connection successful');
    
    const tables = await checkTables();
    console.log('📋 Available tables:', tables);
    
    process.exit(0);
  })();
}
