import type { Express } from "express";
import { resolveUser } from "../../user/core/server.js";
import { logger } from "../../logger/core/index.js";

export function registerLoggerRoutes(app: Express) {
  app.get("/api/logs", (_req, res) => {
    res.json({ entries: logger.getEntries() });
  });

  app.delete("/api/logs", (_req, res) => {
    logger.clear();
    res.json({ entries: [] });
  });

  app.get("/api/debug", resolveUser, (req, res) => {
    const entry = (req as any).user;
    res.json({
      sessionId: (req as any).sessionId,
      user: (req as any).userName,
      at: new Date().toISOString(),
      context: entry.contexts[entry.userData.activeCtx].toJSON(),
      config: entry.userData.configs[entry.userData.activeCfg] ?? {},
      recentLogs: logger.getRecent(50),
    });
  });
}
