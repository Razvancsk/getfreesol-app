import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { db } from "./db";
import { sql } from "drizzle-orm";
import fs from "fs";
import path from "path";
import { getShareTitle, getShareDescription, lamportsToSol } from "../shared/shareMessages";
import cron from "node-cron";
import { checkAllWalletAlerts } from "./services/alertService";

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

    // Initialize Discord bot for wallet scanning (production only to avoid double responses)
    if (process.env.NODE_ENV === 'production' || process.env.REPL_DEPLOYMENT) {
      try {
        const { initializeDiscordBot } = await import('./discordBot.js');
        await initializeDiscordBot();
      } catch (discordError) {
        log(`Discord bot initialization failed: ${discordError instanceof Error ? discordError.message : String(discordError)}`);
        log(`Server will continue without Discord bot functionality`);
      }
    } else {
      log(`Discord bot disabled in development mode to avoid double responses`);
    }

    // Initialize Telegram bot for wallet scanning
    try {
      const { initializeTelegramBot } = await import('./telegramBot.js');
      await initializeTelegramBot();
    } catch (telegramError) {
      log(`Telegram bot initialization failed: ${telegramError instanceof Error ? telegramError.message : String(telegramError)}`);
      log(`Server will continue without Telegram bot functionality`);
    }

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
      // Handle /share path for Twitter card previews
      const isSharePath = req.path === '/share';
      // Only handle HTML requests to root path or /share path
      const isHtmlRequest = req.accepts('html') && (req.path === '/' || req.path === '/index.html' || isSharePath);
      const claimedParam = req.query.claimed as string;
      const solParam = req.query.sol as string; // For /share path
      
      // Need either claimed param (old format) or sol param (/share format)
      if (!isHtmlRequest || (!claimedParam && !solParam)) {
        return next();
      }

      try {
        // Support both formats: ?claimed=lamports (old) and ?sol=lamports (/share)
        const lamports = parseInt(claimedParam || solParam, 10);
        if (isNaN(lamports) || lamports <= 0) {
          return next();
        }

        // Generate dynamic OG content
        const solAmount = lamportsToSol(lamports);
        const ogTitle = getShareTitle(lamports);
        const ogDescription = getShareDescription();
        const ogUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
        
        // Get additional share parameters
        const claimType = (req.query.type as string) || 'accounts';
        const itemCount = parseInt(req.query.count as string) || 1;
        const cacheParam = req.query.t || Date.now();
        
        // Generate OG image URL with cache-busting parameter
        const ogImage = `${req.protocol}://${req.get('host')}/api/share/card?sol=${solAmount}&type=${claimType}&count=${itemCount}&t=${cacheParam}`;

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
            /<meta property="og:image" content="[^"]*" id="og-image" \/>/,
            `<meta property="og:image" content="${escapeHtml(ogImage)}" id="og-image" />`
          )
          .replace(
            /<meta name="twitter:title" content="[^"]*" id="twitter-title" \/>/,
            `<meta name="twitter:title" content="${escapeHtml(ogTitle)}" id="twitter-title" />`
          )
          .replace(
            /<meta name="twitter:description" content="[^"]*" id="twitter-description" \/>/,
            `<meta name="twitter:description" content="${escapeHtml(ogDescription)}" id="twitter-description" />`
          )
          .replace(
            /<meta name="twitter:image" content="[^"]*" id="twitter-image" \/>/,
            `<meta name="twitter:image" content="${escapeHtml(ogImage)}" id="twitter-image" />`
          )
          .replace(
            /<meta name="twitter:card" content="[^"]*" id="twitter-card" \/>/,
            `<meta name="twitter:card" content="summary_large_image" id="twitter-card" />`
          );

        res.setHeader('Content-Type', 'text/html');
        res.send(html);
        log(`Injected dynamic OG tags for ${solAmount} SOL claim with image`);
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
      let staticPath: string;
      try {
        staticPath = getStaticAssetsPath();
        log(`Using static assets from: ${staticPath}`);
      } catch (staticErr) {
        log(`Warning: ${staticErr instanceof Error ? staticErr.message : String(staticErr)}`);
        staticPath = path.resolve(import.meta.dirname, "public");
        log(`Falling back to: ${staticPath}`);
      }
      
      // Serve static files from the resolved path
      app.use(express.static(staticPath));
      
      // SPA catch-all - always return 200 so health checks pass
      const indexHtmlPath = path.resolve(staticPath, "index.html");
      app.use("*", (_req, res) => {
        if (fs.existsSync(indexHtmlPath)) {
          res.sendFile(indexHtmlPath, (err) => {
            if (err) {
              log(`sendFile error: ${err.message}, serving fallback`);
              res.status(200).send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>GetFreeSol</title></head><body><div id="root"></div></body></html>`);
            }
          });
        } else {
          log(`index.html not found at ${indexHtmlPath}, serving fallback`);
          res.status(200).send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>GetFreeSol</title></head><body><div id="root"></div></body></html>`);
        }
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
      
      // Start alert monitoring cron job
      let isAlertJobRunning = false;
      const alertCronSchedule = process.env.ALERT_CRON || '*/5 * * * *'; // Default: every 5 minutes
      
      const alertTask = cron.schedule(alertCronSchedule, async () => {
        if (isAlertJobRunning) {
          log('⏭️ Alert check already running, skipping this interval');
          return;
        }
        
        isAlertJobRunning = true;
        const startTime = Date.now();
        
        try {
          await checkAllWalletAlerts();
          const duration = Date.now() - startTime;
          log(`✅ Alert check completed in ${duration}ms`);
        } catch (error) {
          const duration = Date.now() - startTime;
          log(`❌ Alert check failed after ${duration}ms: ${error instanceof Error ? error.message : String(error)}`);
          console.error('Alert check error details:', error);
        } finally {
          isAlertJobRunning = false;
        }
      }, {
        scheduled: false,
        timezone: "UTC"
      });
      
      // Run initial alert check on startup
      log(`🔔 Starting alert monitoring system (schedule: ${alertCronSchedule})`);
      (async () => {
        try {
          log('🔔 Running initial alert check...');
          await checkAllWalletAlerts();
          log('✅ Initial alert check complete, starting scheduled checks');
          alertTask.start();
        } catch (error) {
          log(`⚠️ Initial alert check failed: ${error instanceof Error ? error.message : String(error)}`);
          log('Starting scheduled checks anyway');
          alertTask.start();
        }
      })();
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

// Global error handlers — log but never crash the server for third-party service errors
process.on('uncaughtException', (error: Error) => {
  console.error('Uncaught Exception (server kept alive):', error.message);
  console.error(error.stack);
});

process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  console.error('Unhandled Rejection (server kept alive):', reason?.message || reason);
});
