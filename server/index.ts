import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { db } from "./db";
import { sql } from "drizzle-orm";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Health check endpoint for deployment verification
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'unknown'
  });
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  try {
    log(`Initializing server...`);
    log(`NODE_ENV: ${process.env.NODE_ENV}`);
    log(`PORT: ${process.env.PORT || '5000'}`);
    log(`DATABASE_URL exists: ${!!process.env.DATABASE_URL}`);
    
    // Validate critical environment variables
    const requiredEnvVars = ['DATABASE_URL'];
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    if (missingVars.length > 0) {
      throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }
    
    // Test database connectivity during startup
    try {
      log(`Testing database connection...`);
      await db.execute(sql`SELECT 1`);
      log(`Database connection successful`);
    } catch (dbError) {
      console.error(`Database connection failed:`, dbError);
      throw new Error(`Database initialization failed: ${dbError}`);
    }
    
    const server = await registerRoutes(app);
    log(`Routes registered successfully`);

    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";

      console.error("Server error:", err);
      res.status(status).json({ message });
    });

    // Set NODE_ENV to production for deployment environment
    if (!process.env.NODE_ENV) {
      process.env.NODE_ENV = 'production';
    }
    
    log(`Starting server in ${process.env.NODE_ENV} mode...`);

    // importantly only setup vite in development and after
    // setting up all the other routes so the catch-all route
    // doesn't interfere with the other routes
    if (app.get("env") === "development" || process.env.NODE_ENV === "development") {
      log(`Setting up Vite for development mode...`);
      await setupVite(app, server);
      log(`Vite setup completed`);
    } else {
      log(`Setting up static file serving for production mode...`);
      serveStatic(app);
      log(`Static file serving setup completed`);
    }

    // ALWAYS serve the app on the port specified in the environment variable PORT
    // Other ports are firewalled. Default to 5000 if not specified.
    // this serves both the API and the client.
    // It is the only port that is not firewalled.
    const port = parseInt(process.env.PORT || '5000', 10);
    
    // Update server listening configuration to use port from environment variable without object parameter
    server.listen(port, "0.0.0.0", (error?: Error) => {
      if (error) {
        console.error(`Failed to start server on port ${port}:`, error);
        process.exit(1);
      }
      log(`Server started successfully on port ${port}`);
      log(`Environment: ${process.env.NODE_ENV}`);
    });

  } catch (error) {
    console.error("Failed to start server:", error);
    console.error("Error details:", JSON.stringify(error, null, 2));
    process.exit(1);
  }
})().catch((error) => {
  console.error("Unhandled error during server startup:", error);
  console.error("Error stack:", error.stack);
  process.exit(1);
});

// Enhanced global error handlers for database connection issues
process.on('uncaughtException', (error: Error) => {
  console.error('Uncaught Exception:', error);
  
  // Check if it's a database connection error
  const isDatabaseError = 
    error.message?.includes('terminating connection') ||
    error.message?.includes('connection closed') ||
    error.message?.includes('connection lost') ||
    (error as any).code === '57P01' || // admin_shutdown
    (error as any).code === '08006' || // connection_failure
    (error as any).code === '08003';   // connection_does_not_exist
  
  if (isDatabaseError) {
    console.error('Database connection error detected. The connection will be automatically retried on next request.');
    // Don't exit for database connection errors - let the retry logic handle it
    return;
  }
  
  // For other uncaught exceptions, exit gracefully
  console.error('Shutting down due to uncaught exception...');
  process.exit(1);
});

process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  
  // Check if it's a database connection error
  const isDatabaseError = 
    reason?.message?.includes('terminating connection') ||
    reason?.message?.includes('connection closed') ||
    reason?.message?.includes('connection lost') ||
    reason?.code === '57P01' || // admin_shutdown
    reason?.code === '08006' || // connection_failure
    reason?.code === '08003';   // connection_does_not_exist
  
  if (isDatabaseError) {
    console.error('Database connection rejection detected. The connection will be automatically retried on next request.');
    // Don't exit for database connection errors - let the retry logic handle it
    return;
  }
  
  // For other unhandled rejections, exit gracefully
  console.error('Shutting down due to unhandled rejection...');
  process.exit(1);
});
