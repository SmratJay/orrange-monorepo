import { Pool, PoolClient } from 'pg';
import { sqliteDb } from './sqlite';

const USE_SQLITE = !process.env.DATABASE_URL || process.env.NODE_ENV === 'development';

class Database {
  private static instance: Database;
  private pool?: Pool;

  private constructor() {
    if (!USE_SQLITE) {
      this.pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      });

      this.pool.on('error', (err) => {
        console.error('Database pool error:', err);
      });
    }
  }

  public static getInstance(): Database {
    if (!Database.instance) {
      Database.instance = new Database();
    }
    return Database.instance;
  }

  public async query<T = any>(text: string, params?: any[]): Promise<T[]> {
    if (USE_SQLITE) {
      return sqliteDb.query<T>(text, params);
    }

    if (!this.pool) throw new Error('PostgreSQL pool not initialized');
    
    const client = await this.pool.connect();
    try {
      const result = await client.query(text, params);
      return result.rows;
    } finally {
      client.release();
    }
  }

  public async transaction<T>(
    callback: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    if (USE_SQLITE) {
      return sqliteDb.transaction(callback as any);
    }

    if (!this.pool) throw new Error('PostgreSQL pool not initialized');

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  public async end(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
    }
  }
}

export const db = Database.getInstance();
