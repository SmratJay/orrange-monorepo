import { db } from '../lib/db/connection';

async function manageDatabase() {
  const command = process.argv[2] || 'view';
  
  switch (command) {
    case 'view':
      await viewDatabase();
      break;
    case 'clear':
      await clearDatabase();
      break;
    case 'stats':
      await showStats();
      break;
    default:
      showHelp();
  }
  
  process.exit(0);
}

async function viewDatabase() {
  console.log('🗄️ ORRANGE DATABASE');
  console.log('-'.repeat(40));
  
  try {
    const users = await db.query('SELECT id, email, status, created_at FROM users ORDER BY created_at DESC');
    const profiles = await db.query('SELECT user_id, username, display_name FROM user_profiles');
    const sessions = await db.query('SELECT user_id, expires_at FROM user_sessions');
    
    console.log(`� Users: ${users.length}`);
    users.forEach((user: any, i: number) => {
      console.log(`  ${i+1}. ${user.email} (${user.status})`);
    });
    
    console.log(`\n� Active Sessions: ${sessions.filter((s: any) => new Date(s.expires_at) > new Date()).length}`);
    
  } catch (error) {
    console.error('❌ Database error:', error);
  }
}

async function clearDatabase() {
  try {
    console.log('🧹 Clearing database...');
    await db.query('DELETE FROM user_sessions');
    await db.query('DELETE FROM user_profiles'); 
    await db.query('DELETE FROM users');
    console.log('✅ Database cleared');
  } catch (error) {
    console.error('❌ Clear failed:', error);
  }
}

async function showStats() {
  try {
    const users = await db.query('SELECT COUNT(*) as count FROM users');
    const profiles = await db.query('SELECT COUNT(*) as count FROM user_profiles');
    const sessions = await db.query('SELECT COUNT(*) as count FROM user_sessions');
    
    console.log('📊 DATABASE STATS:');
    console.log(`   Users: ${users[0].count}`);
    console.log(`   Profiles: ${profiles[0].count}`);
    console.log(`   Sessions: ${sessions[0].count}`);
  } catch (error) {
    console.error('❌ Stats failed:', error);
  }
}

function showHelp() {
  console.log('🗄️ DATABASE MANAGER');
  console.log('Usage: npx tsx scripts/db.ts [command]');
  console.log('');
  console.log('Commands:');
  console.log('  view   - View database contents (default)');
  console.log('  clear  - Clear all data');
  console.log('  stats  - Show statistics');
}

manageDatabase();
