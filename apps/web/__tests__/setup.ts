import { config } from 'dotenv';
import path from 'path';

// Load test environment variables
config({ path: path.resolve(process.cwd(), '.env.test') });

// Global test timeouts
global.setTimeout = global.setTimeout || setTimeout;

// Clean up after tests
const cleanup = async () => {
  // Close any database connections
  // Clean up test files if needed
};

// Export cleanup for tests that need it
export { cleanup };
