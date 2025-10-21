import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { db } from "./db";
import { sql } from "drizzle-orm";
import fs from "fs";
import path from "path";
import { getShareMessage, getShareTitle, lamportsToSol } from "../shared/shareMessages";
import { autoClaimScanner } from "./workers/auto-claim-scanner";
import { autoClaimExecutor } from "./workers/auto-claim-executor";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Helper function to escape HTML special characters
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Lightweight health check endpoint - always returns 200
app.get('/health', async (req, res) => {
  let databaseStatus = 'unknown';
  if (process.env.DATABASE_URL) {
    try {
      await db.execute(sql`SELECT 1`);
      databaseStatus = 'connected';
    } catch (error) {
      databaseStatus = 'error';
    }
  } else {
    databaseStatus = 'not_configured';
  }
  
  const healthData = { 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'unknown',
    port: process.env.PORT || '5000',
    databaseStatus
  };
  
  log(`Health check requested - Status: ${healthData.status}, DB: ${databaseStatus}, Env: ${healthData.environment}`);
  res.status(200).json(healthData);
});

// Readiness check endpoint - validates static assets and optional DB
app.get('/ready', async (req, res) => {
  const readyData = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'unknown',
    staticAssets: 'unknown',
    database: 'unknown',
    ready: false,
    issues: [] as string[]
  };

  // Check static assets
  try {
    const staticPath = getStaticAssetsPath();
    const indexPath = path.resolve(staticPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      readyData.staticAssets = 'ready';
      log(`Readiness check - Static assets ready at: ${staticPath}`);
    } else {
      readyData.staticAssets = 'missing_index';
      readyData.issues.push(`index.html not found at ${staticPath}`);
    }
  } catch (error) {
    readyData.staticAssets = 'error';
    readyData.issues.push(`Static assets error: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Check database if configured
  if (process.env.DATABASE_URL) {
    try {
      await db.execute(sql`SELECT 1`);
      readyData.database = 'ready';
    } catch (error) {
      readyData.database = 'error';
      readyData.issues.push(`Database error: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else {
    readyData.database = 'not_configured';
  }

  // Overall readiness
  readyData.ready = readyData.staticAssets === 'ready' && 
                   (readyData.database === 'ready' || readyData.database === 'not_configured');

  const status = readyData.ready ? 200 : 503;
  log(`Readiness check - Ready: ${readyData.ready}, Static: ${readyData.staticAssets}, DB: ${readyData.database}`);
  
  res.status(status).json(readyData);
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

// Determine static assets directory with deterministic resolution (no runtime copying)
function getStaticAssetsPath() {
  // Support explicit override via environment variable
  if (process.env.STATIC_DIR) {
    const explicitPath = path.resolve(process.env.STATIC_DIR);
    log(`Using explicit static assets path from STATIC_DIR: ${explicitPath}`);
    return explicitPath;
  }
  
  // Primary: When running from built dist/index.js, look for adjacent public directory
  const distPublic = path.resolve(import.meta.dirname, "public");
  
  // Fallback: Original location in server/public
  const serverPublic = path.resolve(import.meta.dirname, "..", "server", "public");
  
  log(`Checking for static assets at: ${distPublic}`);
  
  if (fs.existsSync(distPublic)) {
    const indexPath = path.resolve(distPublic, 'index.html');
    if (fs.existsSync(indexPath)) {
      log(`Static assets found and verified at ${distPublic}`);
      return distPublic;
    } else {
      log(`Static assets directory exists but missing index.html at ${distPublic}`);
    }
  }
  
  log(`Static assets not found at ${distPublic}, checking fallback: ${serverPublic}`);
  
  if (fs.existsSync(serverPublic)) {
    const indexPath = path.resolve(serverPublic, 'index.html');
    if (fs.existsSync(indexPath)) {
      log(`Static assets found and verified at ${serverPublic}`);
      return serverPublic;
    } else {
      log(`Static assets directory exists but missing index.html at ${serverPublic}`);
    }
  }
  
  const errorMsg = `No valid static assets found. Checked: ${distPublic}, ${serverPublic}. Ensure 'npm run build' was executed successfully.`;
  log(errorMsg);
  throw new Error(errorMsg);
}

(async () => {
  try {
    log(`Initializing server...`);
    log(`NODE_ENV: ${process.env.NODE_ENV}`);
    log(`PORT: ${process.env.PORT || '5000'}`);
    log(`DATABASE_URL exists: ${!!process.env.DATABASE_URL}`);
    
    // Test database connectivity during startup if configured
    if (process.env.DATABASE_URL) {
      try {
        log(`Testing database connection...`);
        await db.execute(sql`SELECT 1`);
        log(`Database connection successful`);
      } catch (dbError) {
        log(`Database connection failed: ${dbError instanceof Error ? dbError.message : String(dbError)}`);
        log(`Server will continue starting without database connectivity`);
        // Don't exit - allow server to start and handle DB errors in endpoints
      }
    } else {
      log(`DATABASE_URL not configured - database features will be unavailable`);
    }
    
    const server = await registerRoutes(app);
    log(`Routes registered successfully`);

    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";

      console.error("Server error:", err);
      res.status(status).json({ message });
    });

    // Set NODE_ENV to production for deployment environment if not already set
    if (!process.env.NODE_ENV) {
      process.env.NODE_ENV = 'production';
    }
    
    // Ensure Express app environment matches NODE_ENV
    app.set('env', process.env.NODE_ENV);
    
    log(`Starting server in ${process.env.NODE_ENV} mode...`);

    // Dynamic Open Graph middleware for social sharing
    // This must be registered BEFORE static file serving or Vite setup
    app.use((req: Request, res: Response, next: NextFunction) => {
      // Only handle HTML requests to root path
      const isHtmlRequest = req.accepts('html') && (req.path === '/' || req.path === '/index.html');
      const claimedParam = req.query.claimed as string;
      
      if (!isHtmlRequest || !claimedParam) {
        return next();
      }

      try {
        const lamports = parseInt(claimedParam, 10);
        if (isNaN(lamports) || lamports <= 0) {
          return next();
        }

        // Generate dynamic OG content
        const solAmount = lamportsToSol(lamports);
        const ogTitle = getShareTitle(lamports);
        const ogDescription = getShareMessage(lamports);
        const ogUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

        // Read the index.html template
        const staticPath = process.env.NODE_ENV === 'development' 
          ? path.resolve(import.meta.dirname, "..", "client")
          : getStaticAssetsPath();
        const indexPath = path.resolve(staticPath, 'index.html');
        
        if (!fs.existsSync(indexPath)) {
          log(`Index.html not found at ${indexPath}, skipping OG injection`);
          return next();
        }

        let html = fs.readFileSync(indexPath, 'utf-8');

        // Inject dynamic OG tags
        html = html
          .replace(
            /<meta property="og:title" content="[^"]*" id="og-title" \/>/,
            `<meta property="og:title" content="${escapeHtml(ogTitle)}" id="og-title" />`
          )
          .replace(
            /<meta property="og:description" content="[^"]*" id="og-description" \/>/,
            `<meta property="og:description" content="${escapeHtml(ogDescription)}" id="og-description" />`
          )
          .replace(
            /<meta property="og:url" content="[^"]*" id="og-url" \/>/,
            `<meta property="og:url" content="${escapeHtml(ogUrl)}" id="og-url" />`
          )
          .replace(
            /<meta name="twitter:title" content="[^"]*" id="twitter-title" \/>/,
            `<meta name="twitter:title" content="${escapeHtml(ogTitle)}" id="twitter-title" />`
          )
          .replace(
            /<meta name="twitter:description" content="[^"]*" id="twitter-description" \/>/,
            `<meta name="twitter:description" content="${escapeHtml(ogDescription)}" id="twitter-description" />`
          );

        res.setHeader('Content-Type', 'text/html');
        res.send(html);
        log(`Injected dynamic OG tags for ${solAmount} SOL claim`);
      } catch (error) {
        log(`Error injecting OG tags: ${error instanceof Error ? error.message : String(error)}`);
        next();
      }
    });

    // Setup vite in development, static file serving in production
    if (process.env.NODE_ENV === "development") {
      log(`Setting up Vite for development mode...`);
      await setupVite(app, server);
      log(`Vite setup completed`);
    } else {
      log(`Setting up static file serving for production mode...`);
      const staticPath = getStaticAssetsPath();
      log(`Using static assets from: ${staticPath}`);
      
      // Serve static files from the resolved path
      app.use(express.static(staticPath));
      
      // Fall through to index.html if the file doesn't exist (SPA routing)
      app.use("*", (_req, res) => {
        res.sendFile(path.resolve(staticPath, "index.html"));
      });
      
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
      
      // Start Auto-Claim workers
      if (process.env.ENABLE_AUTO_CLAIM_WORKERS === 'true') {
        log(`Starting Auto-Claim workers...`);
        autoClaimScanner.start(15000); // Scan every 15 seconds - FAST like manual!
        autoClaimExecutor.start(10000); // Execute every 10 seconds - FAST!
        log(`Auto-Claim workers started`);
      } else {
        log(`Auto-Claim workers disabled (set ENABLE_AUTO_CLAIM_WORKERS=true to enable)`);
      }
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
