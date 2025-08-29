import { db } from '@/lib/db/connection';

export async function GET() {
  try {
    // Test database connection
    const result = await db.query('SELECT 1 as test');
    
    // Check if tables exist
    const tables = await db.query(`
      SELECT name FROM sqlite_master 
      WHERE type='table' 
      ORDER BY name
    `);
    
    return Response.json({
      success: true,
      connection: 'active',
      testQuery: result,
      tables: tables.map((t: any) => t.name)
    });
  } catch (error) {
    return Response.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
