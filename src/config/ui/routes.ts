import type { Express } from "express";
import type { Config } from "../type.js";
import { resolveUser } from "../../user/core/server.js";
import { writeUserData, logger } from "../../user/core/server.js";

export function registerConfigRoutes(app: Express) {
  app.get("/api/configs", resolveUser, (req, res) => {
    const { userData } = (req as any).user;
    res.json({ configs: userData.configs, activeCfg: userData.activeCfg });
  });

  app.put("/api/configs", resolveUser, (req, res) => {
    const entry = (req as any).user;
    const { configs, activeCfg } = req.body as { configs: Config[]; activeCfg: number };
    entry.userData.configs = configs;
    entry.userData.activeCfg = activeCfg;
    writeUserData((req as any).userName, entry.userData, entry.contexts);
    res.json({ configs: entry.userData.configs, activeCfg: entry.userData.activeCfg });
  });

  // Backward-compat: single config
  app.get("/api/config", resolveUser, (req, res) => {
    const { userData } = (req as any).user;
    res.json(userData.configs[userData.activeCfg] ?? {});
  });

  app.put("/api/config", resolveUser, (req, res) => {
    const entry = (req as any).user;
    const userName: string = (req as any).userName;
    const cfg = entry.userData.configs[entry.userData.activeCfg];
    if (!cfg) { res.status(404).json({ error: "no config" }); return; }
    const body = req.body as Partial<Config>;
    if (body.model !== undefined) cfg.model = body.model;
    if (body.temperature !== undefined) cfg.temperature = body.temperature;
    if (body.maxTokens !== undefined) cfg.maxTokens = body.maxTokens;
    if (body.topP !== undefined) cfg.topP = body.topP;
    if (body.thinking !== undefined) cfg.thinking = body.thinking;
    if (body.stop !== undefined) cfg.stop = body.stop;
    if (body.autoExecute !== undefined) cfg.autoExecute = body.autoExecute;
    writeUserData(userName, entry.userData, entry.contexts);
    res.json(cfg);
  });
}
