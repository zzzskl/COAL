import type { Express } from "express";
import { resolveUser, writeUserData, loadUser } from "../core/server.js";

export function registerUserRoutes(app: Express) {
  app.get("/api/user", resolveUser, (req, res) => {
    const entry = (req as any).user;
    const userName: string = (req as any).userName;
    res.json({ user: userName, config: entry.userData.configs[entry.userData.activeCfg] });
  });

  app.post("/api/user/switch", resolveUser, async (req, res) => {
    const entry = (req as any).user;
    const currentUser: string = (req as any).userName;
    const { user: targetUser } = req.body as { user?: string };
    if (!targetUser) { res.status(400).json({ error: "user is required" }); return; }
    writeUserData(currentUser, entry.userData, entry.contexts);
    const newEntry = loadUser(targetUser);
    (req as any).userName = targetUser;
    (req as any).user = newEntry;
    res.json({
      user: targetUser,
      context: newEntry.contexts[newEntry.userData.activeCtx].toJSON(),
      config: newEntry.userData.configs[newEntry.userData.activeCfg] ?? {},
    });
  });

  // UI preferences
  app.get("/api/ui", resolveUser, (req, res) => {
    const { userData } = (req as any).user;
    res.json(userData.ui ?? { collapsed: {}, context: {} });
  });

  app.put("/api/ui", resolveUser, (req, res) => {
    const entry = (req as any).user;
    const { collapsed, context: ctxNames } = req.body as {
      collapsed?: Record<number, number[]>;
      context?: Record<number, { name: string }>;
    };
    if (!entry.userData.ui) entry.userData.ui = { collapsed: {}, context: {} };
    if (collapsed !== undefined) entry.userData.ui.collapsed = collapsed;
    if (ctxNames !== undefined) entry.userData.ui.context = ctxNames;
    writeUserData((req as any).userName, entry.userData, entry.contexts);
    res.json(entry.userData.ui);
  });
}
