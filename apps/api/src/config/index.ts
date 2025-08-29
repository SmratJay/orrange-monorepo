import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables
dotenv.config();

// Define the configuration schema for validation
const configSchema = z.object({
  // Database
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  
  // JWT
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 characters"),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("30d"),
  
  // Server
  PORT: z.string().transform(Number).pipe(z.number().int().positive().default(8080)),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  
  // CORS
  FRONTEND_URL: z.string().url().default("http://localhost:3000"),
  
  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.string().transform(Number).pipe(z.number().int().positive().default(900000)),
  RATE_LIMIT_MAX_REQUESTS: z.string().transform(Number).pipe(z.number().int().positive().default(100)),
});

// Validate configuration
const configResult = configSchema.safeParse(process.env);

if (!configResult.success) {
  console.error("❌ Invalid environment configuration:");
  console.error(configResult.error.errors);
  process.exit(1);
}

export const config = configResult.data;

// Derived configuration
export const isDevelopment = config.NODE_ENV === 'development';
export const isProduction = config.NODE_ENV === 'production';
export const isTest = config.NODE_ENV === 'test';

console.log(`🔧 Configuration loaded for ${config.NODE_ENV} environment`);
