/**
 * Critical Path Authentication Tests
 * Tests the core authentication flows that protect user funds
 */

import { NextRequest } from 'next/server';
import { POST as registerPOST } from '../app/api/auth/register/route';
import { POST as loginPOST } from '../app/api/auth/login/route';
import { db } from '../lib/db/connection';
import { JWTUtils } from '../lib/auth/jwt';

describe('🔐 Critical Auth Flow Tests', () => {
  beforeAll(async () => {
    // Ensure database is ready
    await db.query('DELETE FROM users WHERE email LIKE ?', ['test%@example.com']);
  });

  afterAll(async () => {
    // Clean up test data
    await db.query('DELETE FROM users WHERE email LIKE ?', ['test%@example.com']);
  });

  describe('Registration Flow', () => {
    it('should create user with valid data', async () => {
      const request = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Test User',
          email: 'test1@example.com',
          password: 'SecurePass123!'
        }),
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const response = await registerPOST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.token).toBeDefined();
      expect(data.user.email).toBe('test1@example.com');
      expect(data.user.id).toBeDefined();
    });

    it('should reject weak passwords', async () => {
      const request = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Test User',
          email: 'test2@example.com',
          password: 'weak'
        }),
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const response = await registerPOST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('should prevent duplicate email registration', async () => {
      // First registration
      const request1 = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Test User 1',
          email: 'test3@example.com',
          password: 'SecurePass123!'
        }),
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      await registerPOST(request1);

      // Duplicate registration attempt
      const request2 = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Test User 2',
          email: 'test3@example.com',
          password: 'AnotherPass123!'
        }),
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const response = await registerPOST(request2);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('EMAIL_EXISTS');
    });
  });

  describe('Login Flow', () => {
    beforeAll(async () => {
      // Create a test user for login tests
      const request = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Login Test User',
          email: 'login@example.com',
          password: 'LoginPass123!'
        }),
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      await registerPOST(request);
    });

    it('should authenticate valid credentials', async () => {
      const request = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: 'login@example.com',
          password: 'LoginPass123!'
        }),
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const response = await loginPOST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.token).toBeDefined();
      expect(data.user.email).toBe('login@example.com');
      
      // Verify JWT token structure
      const tokenPayload = await JWTUtils.verify(data.token);
      expect(tokenPayload).not.toBeNull();
      if (tokenPayload) {
        expect(tokenPayload.userId).toBeDefined();
        expect(tokenPayload.email).toBe('login@example.com');
      }
    });

    it('should reject invalid passwords', async () => {
      const request = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: 'login@example.com',
          password: 'WrongPassword!'
        }),
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const response = await loginPOST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('should reject non-existent users', async () => {
      const request = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: 'nonexistent@example.com',
          password: 'AnyPassword123!'
        }),
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const response = await loginPOST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('INVALID_CREDENTIALS');
    });
  });

  describe('Security Headers', () => {
    it('should include security headers in responses', async () => {
      const request = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: 'login@example.com',
          password: 'LoginPass123!'
        }),
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const response = await loginPOST(request);

      // Check for security headers
      expect(response.headers.get('X-Frame-Options')).toBeTruthy();
      expect(response.headers.get('X-Content-Type-Options')).toBeTruthy();
      expect(response.headers.get('X-XSS-Protection')).toBeTruthy();
    });
  });
});
