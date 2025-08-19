import { config } from 'dotenv';
import { join } from 'path';

// Load test environment variables
config({ path: join(__dirname, '..', '.env.test') });

// Set test database URL if not provided
if (!process.env.TEST_DATABASE_URL) {
  process.env.TEST_DATABASE_URL = 'postgresql://test:test@localhost:5432/orrange_test';
}

// Set JWT secret for testing
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'test-secret-key-do-not-use-in-production';
}

// Set other test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.RATE_LIMIT_MAX = '1000'; // Higher limit for tests

// Global test setup
beforeAll(async () => {
  // Global setup if needed
});

afterAll(async () => {
  // Global cleanup if needed
});

// Increase test timeout for integration tests
jest.setTimeout(30000);
