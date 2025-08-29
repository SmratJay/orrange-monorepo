import { db } from '../lib/db/connection';

async function checkSchema() {
  try {
    const info = await db.query('PRAGMA table_info(users)');
    console.log('📋 Raw result:', JSON.stringify(info, null, 2));
    console.log('\n📋 Users table schema:');
    info.forEach((col: any) => {
      const nullable = col.notnull === 1 ? ' NOT NULL' : '';
      const defaultVal = col.dflt_value ? ` DEFAULT ${col.dflt_value}` : '';
      console.log(`  - ${col.name}: ${col.type}${nullable}${defaultVal}`);
    });
  } catch (error) {
    console.error('Error checking schema:', error);
  }
}

checkSchema();
