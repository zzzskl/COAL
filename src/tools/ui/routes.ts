import type { Express } from "express";
import { getBuiltinToolDefs } from "../core/index.js";

export function registerToolsRoutes(app: Express) {
  app.get("/api/tools", (_req, res) => {
    res.json({ builtin: getBuiltinToolDefs() });
  });
}
