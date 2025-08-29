/**
 * Database initialization script
 * Run this to ensure all tables are created
 */

import { db } from '../lib/db/connection';
import fs from 'fs';
import path from 'path';

async function initializeDatabase() {
  try {
    console.log('🗄️ Initializing database...');
    
    // Read the schema
    const schemaPath = path.join(process.cwd(), 'lib/db/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    
    // Split schema into individual statements
    const statements = schema
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
    // Execute each statement
    for (const statement of statements) {
      try {
        await db.query(statement);
        console.log('✅ Executed:', statement.split('\n')[0] + '...');
      } catch (error: any) {
        if (!error.message.includes('already exists')) {
          console.error('❌ Error executing statement:', error.message);
        } else {
          console.log('ℹ️ Table already exists, skipping...');
        }
      }
    }
    
    // Verify tables exist
    const tables = await db.query(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `);
    
    console.log('\n📋 Database tables:');
    tables.forEach((table: any) => {
      console.log(`  - ${table.name}`);
    });
    
    console.log('\n✅ Database initialization complete!');
    
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  initializeDatabase()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
}

export { initializeDatabase };
