// GetProfile Proxy - LLM Memory Proxy Server
// OpenAI-compatible endpoint with profile injection

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger as honoLogger } from "hono/logger";
import { initDatabase, closeDatabase } from "@getprofile/db";
import { getConfig } from "@getprofile/config";
import { createLogger } from "@getprofile/core";
import { authMiddleware, rateLimitMiddleware } from "./middleware";
import {
  chatRoutes,
  modelsRoutes,
  healthRoutes,
  profileRoutes,
} from "./routes";

// Initialize structured logger
const logger = createLogger({ name: "proxy" });

// Load configuration (from config/getprofile.json or environment variables)
let config;
try {
  config = getConfig();
} catch (error) {
  logger.warn(
    { error: error instanceof Error ? error.message : String(error) },
    "Config loading failed, using environment variables"
  );
  // Continue with environment variables as fallback
}

// Initialize database connection
const databaseUrl = config?.database?.url || process.env.DATABASE_URL;
if (databaseUrl) {
  logger.info("Initializing database connection");
  initDatabase({ url: databaseUrl });
} else {
  logger.warn("DATABASE_URL not set. Database features will fail.");
}

// Create Hono app
const app = new Hono();

// Global middleware - use Hono logger for HTTP requests, Pino for application logs
app.use(
  "*",
  honoLogger((message, ...rest) => {
    logger.debug({ rest }, message);
  })
);

// CORS configuration with environment variable support
const allowedOrigins =
  process.env.ALLOWED_ORIGINS?.split(",").map((o) => o.trim()) || "*";
app.use(
  "*",
  cors({
    origin: allowedOrigins,
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: [
      "Content-Type",
      "Authorization",
      "X-GetProfile-Id",
      "X-Upstream-Provider",
      "X-Upstream-Key",
      "X-Upstream-Base-URL",
    ],
  })
);

// Health endpoints (no auth required)
app.route("/", healthRoutes);

// OpenAI-compatible endpoints (auth required)
app.use("/v1/*", authMiddleware);
app.use("/api/*", authMiddleware);
app.use("/v1/*", rateLimitMiddleware);
app.use("/api/*", rateLimitMiddleware);
app.route("/", chatRoutes);
app.route("/", modelsRoutes);
app.route("/", profileRoutes);

// 404 handler
app.notFound(async (c) => {
  const { sendError } = await import("./lib/errors");
  return sendError(c, 404, "Not found", "not_found_error", "not_found");
});

// Error handler
app.onError(async (err, c) => {
  logger.error(
    { err, path: c.req.path, method: c.req.method },
    "Unhandled error"
  );
  const { handleError, sendError } = await import("./lib/errors");
  const errorInfo = handleError(err);
  return sendError(c, 500, errorInfo.message, errorInfo.type);
});

// Start server
const port = config?.server?.port || parseInt(process.env.PORT || "3100", 10);
const host = config?.server?.host || process.env.HOST || "0.0.0.0";

logger.info(
  {
    version: process.env.npm_package_version || "0.1.0",
    host,
    port,
  },
  "GetProfile Proxy starting"
);

const server = serve({
  fetch: app.fetch,
  port,
  hostname: host,
});

// Graceful shutdown handlers
let isShuttingDown = false;

async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  logger.info({ signal }, "Starting graceful shutdown");

  try {
    // Close database connections
    logger.info("Closing database connections");
    await closeDatabase();
    logger.info("Database connections closed");

    // Close HTTP server
    // @hono/node-server's serve returns a Server instance with close method
    logger.info("Closing HTTP server");
    if (server && typeof server.close === "function") {
      await new Promise<void>((resolve) => {
        server.close(() => {
          logger.info("HTTP server closed");
          resolve();
        });
        // Force close after 10 seconds if graceful close doesn't complete
        setTimeout(() => {
          logger.warn("Forcing server shutdown after timeout");
          resolve();
        }, 10000);
      });
    } else {
      logger.info("HTTP server closed (no explicit close method)");
    }

    logger.info("Graceful shutdown completed");
    process.exit(0);
  } catch (error) {
    logger.error({ err: error }, "Error during graceful shutdown");
    process.exit(1);
  }
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  logger.fatal({ err: error }, "Uncaught Exception");
  gracefulShutdown("uncaughtException").catch(() => {
    process.exit(1);
  });
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  logger.fatal({ reason, promise }, "Unhandled Rejection");
  gracefulShutdown("unhandledRejection").catch(() => {
    process.exit(1);
  });
});
