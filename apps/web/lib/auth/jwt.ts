import jwt from 'jsonwebtoken';
import { db } from '../db/connection';

export interface JWTPayload {
  userId: string;
  email: string;
  iat?: number;
  exp?: number;
}

export class JWTUtils {
  private static readonly SECRET = process.env.JWT_SECRET!;
  private static readonly EXPIRES_IN = '7d';

  static async generate(payload: Omit<JWTPayload, 'iat' | 'exp'>): Promise<string> {
    if (!this.SECRET) {
      throw new Error('JWT_SECRET environment variable is required');
    }

    const token = jwt.sign(payload, this.SECRET, { 
      expiresIn: this.EXPIRES_IN 
    });

    // Store token hash in sessions table
    const tokenHash = await this.hashToken(token);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await db.query(
      `INSERT INTO user_sessions (user_id, token_hash, expires_at) 
       VALUES (?, ?, ?)`,
      [payload.userId, tokenHash, expiresAt.toISOString()]
    );

    return token;
  }

  static async verify(token: string): Promise<JWTPayload | null> {
    if (!this.SECRET) {
      throw new Error('JWT_SECRET environment variable is required');
    }

    try {
      const payload = jwt.verify(token, this.SECRET) as JWTPayload;
      
      // Check if session exists and is not expired
      const tokenHash = await this.hashToken(token);
      const sessions = await db.query(
        `SELECT id FROM user_sessions 
         WHERE token_hash = ? AND expires_at > datetime('now')`,
        [tokenHash]
      );

      if (sessions.length === 0) {
        return null;
      }

      return payload;
    } catch (error) {
      return null;
    }
  }

  static async revoke(token: string): Promise<void> {
    const tokenHash = await this.hashToken(token);
    await db.query(
      'DELETE FROM user_sessions WHERE token_hash = ?',
      [tokenHash]
    );
  }

  static async revokeAllUserSessions(userId: string): Promise<void> {
    await db.query(
      'DELETE FROM user_sessions WHERE user_id = ?',
      [userId]
    );
  }

  private static async hashToken(token: string): Promise<string> {
    const crypto = await import('crypto');
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
