import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { storage } from "./storage";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

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
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on port 5000
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = 5000;
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
    
    // Set up scheduler to check for scheduled price changes
    // Run every 5 minutes (300000 ms)
    const checkInterval = 5 * 60 * 1000;
    
    // Initial check after server starts (wait 10 seconds to let everything initialize)
    setTimeout(async () => {
      try {
        log('Running initial scheduled price check...');
        const appliedCount = await storage.applyDueScheduledPrices();
        if (appliedCount > 0) {
          log(`Applied ${appliedCount} scheduled price changes during initial check`);
        } else {
          log('No scheduled price changes were due during initial check');
        }
      } catch (error) {
        console.error('Error during initial scheduled price check:', error);
      }
      
      // Then set up recurring interval
      setInterval(async () => {
        try {
          log('Running scheduled price check...');
          const appliedCount = await storage.applyDueScheduledPrices();
          if (appliedCount > 0) {
            log(`Applied ${appliedCount} scheduled price changes`);
          }
        } catch (error) {
          console.error('Error checking scheduled prices:', error);
        }
      }, checkInterval);
    }, 10000);
  });
})();
