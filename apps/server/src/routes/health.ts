// Health check endpoint

import { Hono } from "hono";
import packageJson from "../../package.json" assert { type: "json" };

const health = new Hono();

health.get("/health", (c) => {
  const version = process.env.npm_package_version ?? packageJson.version;

  return c.json({
    status: "ok",
    version,
    timestamp: new Date().toISOString(),
  });
});

health.get("/ready", async (c) => {
  // In the future, we can check DB connectivity here
  return c.json({
    status: "ready",
    timestamp: new Date().toISOString(),
  });
});

export default health;
