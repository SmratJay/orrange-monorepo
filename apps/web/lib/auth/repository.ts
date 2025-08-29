import { db } from '../db/connection';
import { PasswordUtils } from './password';
import { User, UserProfile } from './types';

export class UserRepository {
  static async createUser(
    email: string,
    password?: string,
    name?: string,
    googleId?: string,
    authProvider: 'email' | 'google' = 'email'
  ): Promise<{ user: User; profile: UserProfile }> {
    const passwordHash = password ? await PasswordUtils.hash(password) : null;
    const username = this.generateUsername(email);
    const displayName = name || email.split('@')[0];

    // Create user
    const insertResult = await db.query(
      `INSERT INTO users (email, password_hash, google_id, auth_provider, email_verified)
       VALUES (?, ?, ?, ?, ?)`,
      [email, passwordHash, googleId || null, authProvider, googleId ? true : false]
    );

    // Get the created user
    const userResult = await db.query(
      `SELECT id, email, email_verified, google_id, auth_provider, created_at, updated_at, last_login_at, status
       FROM users WHERE email = ?`,
      [email]
    );

    const user = this.mapUser(userResult[0]);

    // Create profile
    await db.query(
      `INSERT INTO user_profiles (user_id, username, display_name)
       VALUES (?, ?, ?)`,
      [user.id, username, displayName]
    );

    // Get the created profile
    const profileResult = await db.query(
      `SELECT id, user_id, username, display_name, bio, avatar_url, created_at, updated_at
       FROM user_profiles WHERE user_id = ?`,
      [user.id]
    );

    const profile = this.mapProfile(profileResult[0]);

    return { user, profile };
  }

  static async findByGoogleId(googleId: string): Promise<User | null> {
    const users = await db.query(
      `SELECT id, email, email_verified, google_id, auth_provider, created_at, updated_at, last_login_at, status
       FROM users WHERE google_id = ? AND status = 'active'`,
      [googleId]
    );

    return users.length > 0 ? this.mapUser(users[0]) : null;
  }

  static async updateOAuthUser(userId: string, data: {
    provider: string;
    providerId: string;
    emailVerified: boolean;
    avatarUrl?: string;
  }): Promise<void> {
    await db.query(
      `UPDATE users 
       SET provider = ?, provider_id = ?, email_verified = ?, avatar_url = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [data.provider, data.providerId, data.emailVerified ? 1 : 0, data.avatarUrl || null, userId]
    );
  }

  static async findByProvider(provider: string, providerId: string): Promise<User | null> {
    const users = await db.query(
      `SELECT id, email, email_verified, created_at, updated_at, last_login_at, status
       FROM users WHERE provider = ? AND provider_id = ? AND status = 'active'`,
      [provider, providerId]
    );

    return users.length > 0 ? this.mapUser(users[0]) : null;
  }

  static async findByEmail(email: string): Promise<User | null> {
    const users = await db.query(
      `SELECT id, email, email_verified, google_id, auth_provider, created_at, updated_at, last_login_at, status
       FROM users WHERE email = ? AND status = 'active'`,
      [email]
    );

    return users.length > 0 ? this.mapUser(users[0]) : null;
  }

  static async findById(id: string): Promise<User | null> {
    const users = await db.query(
      `SELECT id, email, email_verified, google_id, auth_provider, created_at, updated_at, last_login_at, status
       FROM users WHERE id = ? AND status = 'active'`,
      [id]
    );

    return users.length > 0 ? this.mapUser(users[0]) : null;
  }

  static async findWithProfile(id: string): Promise<(User & { profile?: UserProfile }) | null> {
    const result = await db.query(
      `SELECT 
         u.id, u.email, u.email_verified, u.created_at, u.updated_at, u.last_login_at, u.status,
         p.id as profile_id, p.username, p.display_name, p.bio, p.avatar_url,
         p.created_at as profile_created_at, p.updated_at as profile_updated_at
       FROM users u
       LEFT JOIN user_profiles p ON u.id = p.user_id
       WHERE u.id = ? AND u.status = 'active'`,
      [id]
    );

    if (result.length === 0) return null;

    const row = result[0];
    const user = this.mapUser(row);

    if (row.profile_id) {
      (user as any).profile = {
        id: row.profile_id,
        userId: row.id,
        username: row.username,
        displayName: row.display_name,
        bio: row.bio,
        avatarUrl: row.avatar_url,
        createdAt: row.profile_created_at,
        updatedAt: row.profile_updated_at,
      };
    }

    return user as User & { profile?: UserProfile };
  }

  static async verifyPassword(email: string, password: string): Promise<User | null> {
    const result = await db.query(
      `SELECT id, email, password_hash, email_verified, created_at, updated_at, last_login_at, status
       FROM users WHERE email = ? AND status = 'active'`,
      [email]
    );

    if (result.length === 0) return null;

    const row = result[0];
    const isValid = await PasswordUtils.verify(password, row.password_hash);

    if (!isValid) return null;

    // Update last login
    await db.query(
      'UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?',
      [row.id]
    );

    return this.mapUser(row);
  }

  static async emailExists(email: string): Promise<boolean> {
    const result = await db.query(
      'SELECT 1 FROM users WHERE email = ? AND status != ?',
      [email, 'deleted']
    );
    return result.length > 0;
  }

  private static generateUsername(email: string): string {
    const base = email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '');
    const suffix = Math.random().toString(36).substr(2, 4);
    return `${base}${suffix}`.toLowerCase();
  }

  private static mapUser(row: any): User {
    return {
      id: row.id,
      email: row.email,
      emailVerified: row.email_verified,
      googleId: row.google_id,
      authProvider: row.auth_provider,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastLoginAt: row.last_login_at,
      status: row.status,
    };
  }

  private static mapProfile(row: any): UserProfile {
    return {
      id: row.id,
      userId: row.user_id,
      username: row.username,
      displayName: row.display_name,
      bio: row.bio,
      avatarUrl: row.avatar_url,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  static async updateProfile(userId: string, updates: Partial<Pick<UserProfile, 'displayName' | 'bio' | 'avatarUrl'>>): Promise<void> {
    const fields = [];
    const values = [];
    
    if (updates.displayName !== undefined) {
      fields.push('display_name = ?');
      values.push(updates.displayName);
    }
    if (updates.bio !== undefined) {
      fields.push('bio = ?');
      values.push(updates.bio);
    }
    if (updates.avatarUrl !== undefined) {
      fields.push('avatar_url = ?');
      values.push(updates.avatarUrl);
    }
    
    if (fields.length > 0) {
      fields.push('updated_at = ?');
      values.push(new Date().toISOString());
      values.push(userId);
      
      await db.query(
        `UPDATE user_profiles SET ${fields.join(', ')} WHERE user_id = ?`,
        values
      );
    }
  }

  static async getProfile(userId: string): Promise<UserProfile | null> {
    const profiles = await db.query(
      `SELECT id, user_id, username, display_name, bio, avatar_url, created_at, updated_at
       FROM user_profiles WHERE user_id = ?`,
      [userId]
    );

    return profiles.length > 0 ? this.mapProfile(profiles[0]) : null;
  }

  static async updateLastLogin(userId: string): Promise<void> {
    await db.query(
      `UPDATE users SET last_login_at = ? WHERE id = ?`,
      [new Date().toISOString(), userId]
    );
  }

  static async createSession(userId: string, tokenHash: string, deviceInfo: Record<string, any>): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days from now

    await db.query(
      `INSERT INTO user_sessions (user_id, token_hash, device_info, ip_address, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
      [
        userId,
        tokenHash,
        JSON.stringify(deviceInfo),
        deviceInfo.ipAddress || null,
        expiresAt.toISOString()
      ]
    );
  }
}
