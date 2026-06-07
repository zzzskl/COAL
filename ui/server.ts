import express from "express";
import { readdirSync, existsSync, unlinkSync, renameSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Context } from "../src/context/core/index.js";
import type { User, Config } from "../src/types/index.js";
import { logger } from "../src/logger/core/index.js";
import { DATA_DIR, writeUserData, loadUser } from "../src/user/core/server.js";
import { registerContextRoutes } from "../src/context/ui/routes.js";
import { registerConfigRoutes } from "../src/config/ui/routes.js";
import { registerUserRoutes } from "../src/user/ui/routes.js";
import { registerToolsRoutes } from "../src/tools/ui/routes.js";
import { registerLoggerRoutes } from "../src/logger/ui/routes.js";

const app = express();

// Request logging middleware
app.use((req, _res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    sessionId: req.headers["x-session-id"] ?? "none",
    user: req.headers["x-user"] ?? "none",
  });
  next();
});

app.use(express.json({ limit: "10mb" }));
app.use(express.static("ui/public"));
app.use("/test", express.static("test/ui"));

// ══ Mount concept routes ════════════════════════════════════
registerContextRoutes(app);
registerConfigRoutes(app);
registerUserRoutes(app);
registerToolsRoutes(app);
registerLoggerRoutes(app);

// ══ Data migration — data.json ═══════════════════════════════
function migrateIfNeeded(user: string): boolean {
  const userDir = resolve(DATA_DIR, user);
  const oldCfgPath = resolve(userDir, "config.json");
  const oldCtxPath = resolve(userDir, "active.json");
  const savedDir = resolve(userDir, "saved");
  const newPath = resolve(userDir, "data.json");

  if (existsSync(newPath)) return false;

  const hasOld = existsSync(oldCfgPath) || existsSync(oldCtxPath);
  if (!hasOld) return false;

  let oldConfig: any = {};
  let oldCtx: any = { messages: [], tools: null };

  if (existsSync(oldCfgPath)) {
    try { oldConfig = JSON.parse(readFileSync(oldCfgPath, "utf-8")); } catch {}
  }
  if (existsSync(oldCtxPath)) {
    try { oldCtx = JSON.parse(readFileSync(oldCtxPath, "utf-8")); } catch {}
  }

  const ctx = new Context();
  if (oldCtx.messages) {
    for (const m of oldCtx.messages) {
      ctx.add(m.role, m.content ?? "", {
        toolCallId: m.tool_call_id,
        toolCalls: m.tool_calls,
      });
    }
  }
  if (oldCtx.tools) ctx.setTools(oldCtx.tools);
  if (oldCtx.toolChoice) ctx.setToolChoice(oldCtx.toolChoice);

  const config: Config = {
    name: "Default",
    model: oldConfig.model ?? "deepseek-v4-flash",
    temperature: oldConfig.temperature ?? 0.7,
    maxTokens: oldConfig.maxTokens ?? 4096,
    topP: oldConfig.topP ?? 1,
    thinking: oldConfig.thinking ?? "disabled",
    stop: oldConfig.stop ?? [],
    autoExecute: oldConfig.autoExecute ?? false,
  };

  const savedCtxName = oldCtx.name || "Chat 1";
  const hasSaved = existsSync(savedDir) && readdirSync(savedDir).length > 0;

  const userData: User = {
    version: 1,
    configs: [config],
    activeCfg: 0,
    contexts: [ctx.toJSON()],
    activeCtx: 0,
    ui: { collapsed: {}, context: { 0: hasSaved ? { name: savedCtxName, savedAt: new Date().toISOString() } : { name: savedCtxName } } },
  };

  writeUserData(user, userData, [ctx]);

  try { unlinkSync(oldCfgPath); } catch {}
  try { unlinkSync(oldCtxPath); } catch {}
  try { renameSync(savedDir, resolve(userDir, "saved.bak")); } catch {}

  logger.info(`migrated user "${user}" to data.json`);
  return true;
}

function migrateAllUsers() {
  if (!existsSync(DATA_DIR)) return;
  const users = readdirSync(DATA_DIR);
  for (const user of users) {
    const userPath = resolve(DATA_DIR, user);
    if (!existsSync(resolve(userPath, "config.json")) &&
        !existsSync(resolve(userPath, "active.json"))) continue;
    try { migrateIfNeeded(user); } catch (err) {
      logger.warn(`migration failed for user "${user}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

migrateAllUsers();

const PORT = parseInt(process.env.PORT || "3000", 10);
app.listen(PORT, () => {
  console.log(`COAL UI running at http://localhost:${PORT}`);
});
