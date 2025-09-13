import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

// Configure WebSocket for Node.js environments
neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Configure connection pool with optimized settings for Neon serverless
const connectionString = process.env.DATABASE_URL;
export const pool = new Pool({ 
  connectionString,
  max: 10, // Reduced from 20 to avoid hitting connection limits
  idleTimeoutMillis: 20000, // Reduced to 20 seconds
  connectionTimeoutMillis: 10000, // Increased timeout
  maxUses: 1000, // Add max uses per connection
  allowExitOnIdle: false
});

// Handle pool errors to prevent crashes
pool.on('error', (err) => {
  console.error('Database pool error:', err);
  // Don't throw here - let queries handle their own retries
});

// Handle connection errors
pool.on('connect', (client) => {
  client.on('error', (err) => {
    console.error('Database client error:', err);
    // Client will be removed from pool automatically
  });
});

export const db = drizzle({ client: pool, schema });

// Utility function to handle database operations with retry logic
export async function withDatabaseRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      
      // Check if it's a connection-related error that should be retried
      const isRetriableError = 
        error.code === '57P01' || // admin_shutdown
        error.code === '08006' || // connection_failure
        error.code === '08003' || // connection_does_not_exist
        error.message?.includes('terminating connection') ||
        error.message?.includes('connection closed') ||
        error.message?.includes('connection lost');
      
      if (!isRetriableError || attempt === maxRetries) {
        throw error;
      }
      
      // Exponential backoff with jitter
      const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
      console.log(`Database operation failed (attempt ${attempt}/${maxRetries}), retrying in ${Math.round(delay)}ms:`, error.message);
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError!;
}