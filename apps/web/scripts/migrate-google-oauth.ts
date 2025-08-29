import { db } from '../lib/db/connection';

/**
 * Migration script to add Google OAuth support to existing database
 * Adds google_id and auth_provider columns to users table
 */
async function migrateForGoogleOAuth() {
  console.log('🔄 Starting Google OAuth migration...');

  try {
    // Check if columns already exist
    const tableInfo = await db.query("PRAGMA table_info(users)");
    const columnNames = tableInfo.map((col: any) => col.name);
    
    const hasGoogleId = columnNames.includes('google_id');
    const hasAuthProvider = columnNames.includes('auth_provider');

    if (!hasGoogleId) {
      console.log('📝 Adding google_id column...');
      await db.query(`
        ALTER TABLE users 
        ADD COLUMN google_id TEXT
      `);
    } else {
      console.log('ℹ️  google_id column already exists');
    }

    if (!hasAuthProvider) {
      console.log('📝 Adding auth_provider column...');
      await db.query(`
        ALTER TABLE users 
        ADD COLUMN auth_provider TEXT DEFAULT 'email'
      `);
    } else {
      console.log('ℹ️  auth_provider column already exists');
    }

    // Update existing users to have auth_provider = 'email'
    if (!hasAuthProvider) {
      console.log('📝 Updating existing users auth_provider...');
      await db.query(`
        UPDATE users 
        SET auth_provider = 'email' 
        WHERE auth_provider IS NULL
      `);
    }

    // Create indexes for new columns if they don't exist
    try {
      await db.query('CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id)');
      await db.query('CREATE INDEX IF NOT EXISTS idx_users_auth_provider ON users(auth_provider)');
      console.log('📝 Created indexes for Google OAuth columns');
    } catch (error) {
      console.log('ℹ️  Indexes already exist');
    }

    console.log('✅ Google OAuth migration completed successfully!');
    
    // Show updated table schema
    const updatedTableInfo = await db.query("PRAGMA table_info(users)");
    console.log('\n📋 Updated users table schema:');
    updatedTableInfo.forEach((col: any) => {
      console.log(`  - ${col.name}: ${col.type}${col.notnull === 1 ? ' NOT NULL' : ''}${col.dflt_value ? ` DEFAULT ${col.dflt_value}` : ''}`);
    });

  } catch (error: any) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  }
}

async function main() {
  try {
    await migrateForGoogleOAuth();
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
