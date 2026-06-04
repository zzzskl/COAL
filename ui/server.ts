import express from "express";
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, unlinkSync, renameSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { Model } from "../src/model/index.js";
import { Context } from "../src/context/index.js";
import type { ToolDef, ToolChoice } from "../src/context/index.js";
import type { User, Config, SavedEntry } from "../src/types/index.js";
import { logger } from "../src/logger/index.js";
import { executePendingTools } from "../src/executor/index.js";
import { registry, getBuiltinToolDefs } from "../src/tools/index.js";

const DATA_DIR = resolve(process.cwd(), "data", "users");

const app = express();

// Request logging middleware
app.use((req, _res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    sessionId: req.headers["x-session-id"] ?? "none",
    user: req.headers["x-user"] ?? "none",
  });
  next();
});

app.use(express.json());
app.use(express.static("ui/public"));

// ══ Helpers ══════════════════════════════════════════════════

function userDir(user: string) {
  return resolve(DATA_DIR, user);
}
function userDataPath(user: string) {
  return resolve(userDir(user), "data.json");
}

function ensureDir(p: string) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

function atomicWrite(filePath: string, data: string) {
  const tmp = filePath + ".tmp";
  ensureDir(dirname(filePath));
  writeFileSync(tmp, data, "utf-8");
  renameSync(tmp, filePath);
}

// ══ User I/O ════════════════════════════════════════════════

function createDefaultUser(): { userData: User; contexts: Context[] } {
  const defaultCfg: Config = {
    name: "Default",
    model: "deepseek-v4-flash",
    temperature: 0.7,
    maxTokens: 4096,
    topP: 1,
    thinking: "disabled",
    stop: [],
    autoExecute: false,
  };
  const defaultCtx = new Context();
  defaultCtx.setName("Chat 1");

  const userData: User = {
    version: 1,
    configs: [defaultCfg],
    activeCfg: 0,
    contexts: [defaultCtx.toJSON()],
    activeCtx: 0,
    saved: [],
  };
  return { userData, contexts: [defaultCtx] };
}

function readUserData(user: string): User | null {
  const p = userDataPath(user);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf-8")) as User;
  } catch { return null; }
}

function writeUserData(user: string, data: User, contexts: Context[]) {
  const payload = { ...data, contexts: contexts.map(c => c.toJSON()) };
  atomicWrite(userDataPath(user), JSON.stringify(payload, null, 2));
}

// ══ User cache (replaces old Session Map) ═══════════════════

interface UserEntry {
  userData: User;
  contexts: Context[];
}

const userCache = new Map<string, UserEntry>();

function loadUser(userName: string): UserEntry {
  const cached = userCache.get(userName);
  if (cached) return cached;

  const raw = readUserData(userName);
  if (raw) {
    const entry: UserEntry = {
      userData: raw,
      contexts: raw.contexts.map((c: any) => Context.fromJSON(c)),
    };
    userCache.set(userName, entry);
    return entry;
  }

  const entry = createDefaultUser();
  userCache.set(userName, entry);
  return entry;
}

// ══ Middleware ═══════════════════════════════════════════════

function resolveUser(req: any, _res: any, next: any) {
  const userName = (req.headers["x-user"] as string) || "default";
  req.userName = userName;
  req.user = loadUser(userName);
  req.sessionId = req.headers["x-session-id"] ?? "none";
  next();
}

// ══ Config API ══════════════════════════════════════════════

app.get("/api/configs", resolveUser, (req, res) => {
  const { userData } = (req as any).user as UserEntry;
  res.json({ configs: userData.configs, activeCfg: userData.activeCfg });
});

app.put("/api/configs", resolveUser, (req, res) => {
  const entry = (req as any).user as UserEntry;
  const { configs, activeCfg } = req.body as { configs: Config[]; activeCfg: number };
  entry.userData.configs = configs;
  entry.userData.activeCfg = activeCfg;
  writeUserData((req as any).userName, entry.userData, entry.contexts);
  res.json({ configs: entry.userData.configs, activeCfg: entry.userData.activeCfg });
});

// ══ Context API ═════════════════════════════════════════════

app.get("/api/contexts", resolveUser, (req, res) => {
  const entry = (req as any).user as UserEntry;
  res.json({
    contexts: entry.contexts.map(c => c.toJSON()),
    activeCtx: entry.userData.activeCtx,
  });
});

app.put("/api/contexts", resolveUser, (req, res) => {
  const entry = (req as any).user as UserEntry;
  const { contexts, activeCtx } = req.body as { contexts: any[]; activeCtx: number };
  entry.userData.contexts = contexts;
  entry.userData.activeCtx = activeCtx;
  // Rebuild runtime Context instances from pure data
  entry.contexts = contexts.map((c: any) => Context.fromJSON(c));
  writeUserData((req as any).userName, entry.userData, entry.contexts);
  res.json({
    contexts: entry.contexts.map(c => c.toJSON()),
    activeCtx: entry.userData.activeCtx,
  });
});

// ══ Saved API ═══════════════════════════════════════════════

app.get("/api/saved", resolveUser, (req, res) => {
  const { userData } = (req as any).user as UserEntry;
  res.json({ saved: userData.saved });
});

app.post("/api/saved/save", resolveUser, (req, res) => {
  const entry = (req as any).user as UserEntry;
  const { name } = req.body as { name?: string };
  if (!name) { res.status(400).json({ error: "name is required" }); return; }

  const ctxIndex = entry.userData.activeCtx;
  entry.userData.saved.push({ ctxIndex, name, savedAt: new Date().toISOString() });
  writeUserData((req as any).userName, entry.userData, entry.contexts);
  res.json({ saved: entry.userData.saved });
});

app.post("/api/saved/load", resolveUser, (req, res) => {
  const entry = (req as any).user as UserEntry;
  const { ctxIndex } = req.body as { ctxIndex?: number };
  if (ctxIndex === undefined || ctxIndex < 0 || ctxIndex >= entry.contexts.length) {
    res.status(400).json({ error: "invalid ctxIndex" }); return;
  }
  entry.userData.activeCtx = ctxIndex;
  writeUserData((req as any).userName, entry.userData, entry.contexts);
  res.json({
    contexts: entry.contexts.map(c => c.toJSON()),
    activeCtx: entry.userData.activeCtx,
  });
});

// ══ Chat ════════════════════════════════════════════════════

app.post("/api/chat", resolveUser, async (req, res) => {
  try {
    const entry = (req as any).user as UserEntry;
    const userName: string = (req as any).userName;
    const { message, autoExecute: reqAutoExecute } = req.body as {
      message?: string;
      autoExecute?: boolean;
    };

    const cfg = entry.userData.configs[entry.userData.activeCfg];
    const ctx = entry.contexts[entry.userData.activeCtx];
    const autoExecute = reqAutoExecute ?? cfg?.autoExecute ?? false;

    const { model, temperature, maxTokens, topP, thinking, stop, tools, toolChoice } = req.body as any;

    if (model !== undefined && cfg) cfg.model = model;
    if (temperature !== undefined && cfg) cfg.temperature = temperature;
    if (maxTokens !== undefined && cfg) cfg.maxTokens = maxTokens;
    if (topP !== undefined && cfg) cfg.topP = topP;
    if (thinking !== undefined && cfg) cfg.thinking = thinking;
    if (stop !== undefined && cfg) cfg.stop = stop;
    if (tools !== undefined) ctx.setTools(tools);
    if (toolChoice !== undefined) ctx.setToolChoice(toolChoice);

    logger.info(`chat: ctx has ${ctx.messages.length} messages before ask`);

    function makeModel() {
      const m = new Model().context(ctx);
      if (cfg) {
        if (cfg.model) m.model(cfg.model);
        if (cfg.temperature !== undefined) m.temperature(cfg.temperature);
        if (cfg.maxTokens !== undefined) m.maxTokens(cfg.maxTokens);
        if (cfg.topP !== undefined) m.topP(cfg.topP);
        if (cfg.stop) m.stop(cfg.stop);
        if (cfg.thinking === "disabled") {
          m.noThinking();
        } else if (cfg.thinking && typeof cfg.thinking === "object" && "effort" in cfg.thinking) {
          m.thinking((cfg.thinking as { effort: "high" | "max" }).effort);
        }
      }
      return m;
    }

    let currentResult = await makeModel().ask(message);

    logger.info(`chat: reply received`, {
      contentLen: currentResult.content?.length ?? 0,
      hasToolCalls: (currentResult.tool_calls?.length ?? 0) > 0,
      ctxSize: ctx.messages.length,
    });

    let totalExecuted = 0;
    if (autoExecute && currentResult.tool_calls?.length) {
      const MAX_ROUNDS = 10;
      for (let round = 0; round < MAX_ROUNDS; round++) {
        const executed = executePendingTools(ctx, registry as any);
        if (executed.length === 0) break;
        totalExecuted += executed.length;
        logger.info(`auto-exec round ${round + 1}: ${executed.length} tool(s)`, {
          executed,
          ctxSize: ctx.messages.length,
        });

        currentResult = await makeModel().ask();
        if (!currentResult.tool_calls?.length) break;
      }
      if (totalExecuted > 0) {
        logger.info(`auto-exec done: ${totalExecuted} total tool(s) executed`);
      }
    }

    writeUserData(userName, entry.userData, entry.contexts);

    res.json({
      reply: currentResult.content,
      tool_calls: currentResult.tool_calls,
      autoExecuted: totalExecuted > 0 ? totalExecuted : undefined,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// ══ Backward-compat: Config (single) ════════════════════════

app.get("/api/config", resolveUser, (req, res) => {
  const { userData } = (req as any).user as UserEntry;
  res.json(userData.configs[userData.activeCfg] ?? {});
});

app.put("/api/config", resolveUser, (req, res) => {
  const entry = (req as any).user as UserEntry;
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

// ══ Backward-compat: Context (single) ═══════════════════════

app.get("/api/context", resolveUser, (_req, res) => {
  const entry = (_req as any).user as UserEntry;
  const ctx = entry.contexts[entry.userData.activeCtx];
  res.json(ctx.toJSON());
});

app.delete("/api/context", resolveUser, (req, res) => {
  const entry = (req as any).user as UserEntry;
  const userName: string = (req as any).userName;
  const ctx = entry.contexts[entry.userData.activeCtx];
  ctx.clear();
  ctx.setName("Chat 1");
  writeUserData(userName, entry.userData, entry.contexts);
  res.json(ctx.toJSON());
});

// ══ Backward-compat: Context messages CRUD ══════════════════

app.post("/api/context/message", resolveUser, (req, res) => {
  const entry = (req as any).user as UserEntry;
  const userName: string = (req as any).userName;
  const { role, content, tool_call_id, tool_calls } = req.body as {
    role?: string; content?: string; tool_call_id?: string; tool_calls?: any[];
  };
  if (!role || content === undefined) {
    res.status(400).json({ error: "role and content are required" }); return;
  }
  const ctx = entry.contexts[entry.userData.activeCtx];
  ctx.add(role as any, content, { toolCallId: tool_call_id, toolCalls: tool_calls });
  writeUserData(userName, entry.userData, entry.contexts);
  res.json(ctx.toJSON());
});

app.put("/api/context/message/:index", resolveUser, (req, res) => {
  const entry = (req as any).user as UserEntry;
  const userName: string = (req as any).userName;
  const index = parseInt(req.params.index, 10);
  const ctx = entry.contexts[entry.userData.activeCtx];
  if (isNaN(index) || index < 0 || index >= ctx.messages.length) {
    res.status(404).json({ error: "message index out of range" }); return;
  }
  const { role, content, tool_call_id, tool_calls } = req.body as any;
  const existing = ctx.messages[index] as any;
  ctx.updateAt(index, role ?? existing.role, content ?? existing.content ?? "", {
    toolCallId: tool_call_id ?? existing.tool_call_id,
    toolCalls: tool_calls ?? existing.tool_calls,
  });
  writeUserData(userName, entry.userData, entry.contexts);
  res.json(ctx.toJSON());
});

app.delete("/api/context/message/:index", resolveUser, (req, res) => {
  const entry = (req as any).user as UserEntry;
  const userName: string = (req as any).userName;
  const index = parseInt(req.params.index, 10);
  const ctx = entry.contexts[entry.userData.activeCtx];
  if (isNaN(index) || index < 0 || index >= ctx.messages.length) {
    res.status(404).json({ error: "message index out of range" }); return;
  }
  ctx.removeAt(index);
  writeUserData(userName, entry.userData, entry.contexts);
  res.json(ctx.toJSON());
});

// ══ Backward-compat: Context system / tools / execute ═══════

app.post("/api/context/system", resolveUser, (req, res) => {
  const entry = (req as any).user as UserEntry;
  const userName: string = (req as any).userName;
  const { content } = req.body as { content?: string };
  const ctx = entry.contexts[entry.userData.activeCtx];
  if (content) {
    ctx.system(content);
  } else {
    const nonSystem = ctx.messages.filter((m) => m.role !== "system");
    ctx.clear();
    for (const m of nonSystem) {
      ctx.add(m.role as any, (m as any).content ?? "", {
        toolCallId: (m as any).tool_call_id,
        toolCalls: (m as any).tool_calls,
      });
    }
  }
  writeUserData(userName, entry.userData, entry.contexts);
  res.json(ctx.toJSON());
});

app.put("/api/context/tools", resolveUser, (req, res) => {
  const entry = (req as any).user as UserEntry;
  const userName: string = (req as any).userName;
  const { tools, toolChoice } = req.body as { tools?: ToolDef[]; toolChoice?: ToolChoice };
  const ctx = entry.contexts[entry.userData.activeCtx];
  if (tools !== undefined) ctx.setTools(tools);
  if (toolChoice !== undefined) ctx.setToolChoice(toolChoice);
  writeUserData(userName, entry.userData, entry.contexts);
  res.json(ctx.toJSON());
});

app.post("/api/context/execute", resolveUser, (req, res) => {
  const entry = (req as any).user as UserEntry;
  const userName: string = (req as any).userName;
  const ctx = entry.contexts[entry.userData.activeCtx];
  const executed = executePendingTools(ctx, registry as any);
  logger.info(`executor ran: ${executed.length} tool(s) executed`, {
    executed,
    ctxSize: ctx.messages.length,
  });
  writeUserData(userName, entry.userData, entry.contexts);
  res.json({ executed, ...ctx.toJSON() } as any);
});

// ══ Backward-compat: Context save/load/list ═════════════════

app.get("/api/context/list", resolveUser, (req, res) => {
  const entry = (req as any).user as UserEntry;
  res.json({
    files: entry.userData.saved.map(s => ({
      id: s.ctxIndex,
      name: s.name,
      msgCount: entry.contexts[s.ctxIndex]?.messages.length ?? 0,
    })),
  });
});

app.post("/api/context/save", resolveUser, (req, res) => {
  const entry = (req as any).user as UserEntry;
  const userName: string = (req as any).userName;
  const { filename } = req.body as { filename?: string };
  if (!filename) { res.status(400).json({ error: "filename is required" }); return; }

  const ctxIndex = entry.userData.activeCtx;
  entry.userData.saved.push({
    ctxIndex,
    name: filename,
    savedAt: new Date().toISOString(),
  });
  writeUserData(userName, entry.userData, entry.contexts);
  res.json({ saved: filename, messages: entry.contexts[ctxIndex].messages.length });
});

app.post("/api/context/load", resolveUser, (req, res) => {
  const entry = (req as any).user as UserEntry;
  const userName: string = (req as any).userName;
  const { filename } = req.body as { filename?: string };
  if (!filename) { res.status(400).json({ error: "filename is required" }); return; }

  const savedIdx = entry.userData.saved.findIndex(s => s.name === filename);
  if (savedIdx === -1) { res.status(404).json({ error: "file not found" }); return; }

  const targetCtxIndex = entry.userData.saved[savedIdx].ctxIndex;
  if (targetCtxIndex >= 0 && targetCtxIndex < entry.contexts.length) {
    entry.userData.activeCtx = targetCtxIndex;
  }
  writeUserData(userName, entry.userData, entry.contexts);
  const ctx = entry.contexts[entry.userData.activeCtx];
  res.json({ loaded: filename, ...ctx.toJSON() } as any);
});

app.delete("/api/context/file/:filename", resolveUser, (req, res) => {
  const entry = (req as any).user as UserEntry;
  const userName: string = (req as any).userName;
  const { filename } = req.params;
  const idx = entry.userData.saved.findIndex(s => s.name === filename);
  if (idx === -1) { res.status(404).json({ error: "file not found" }); return; }
  entry.userData.saved.splice(idx, 1);
  writeUserData(userName, entry.userData, entry.contexts);
  res.json({ deleted: filename });
});

// ══ Backward-compat: User info ══════════════════════════════

app.get("/api/user", resolveUser, (req, res) => {
  const entry = (req as any).user as UserEntry;
  const userName: string = (req as any).userName;
  res.json({ user: userName, config: entry.userData.configs[entry.userData.activeCfg] });
});

app.post("/api/user/switch", resolveUser, async (req, res) => {
  const entry = (req as any).user as UserEntry;
  const currentUser: string = (req as any).userName;
  const { user: targetUser } = req.body as { user?: string };
  if (!targetUser) { res.status(400).json({ error: "user is required" }); return; }

  // Save current user
  writeUserData(currentUser, entry.userData, entry.contexts);

  // Load target user
  const newEntry = loadUser(targetUser);
  (req as any).userName = targetUser;
  (req as any).user = newEntry;

  res.json({
    user: targetUser,
    context: newEntry.contexts[newEntry.userData.activeCtx].toJSON(),
    config: newEntry.userData.configs[newEntry.userData.activeCfg] ?? {},
  });
});

// ══ Tools (built-in) ════════════════════════════════════════

app.get("/api/tools", (_req, res) => {
  res.json({ builtin: getBuiltinToolDefs() });
});

// ══ Logs ════════════════════════════════════════════════════

app.get("/api/logs", (_req, res) => {
  res.json({ entries: logger.getEntries() });
});

app.delete("/api/logs", (_req, res) => {
  logger.clear();
  res.json({ entries: [] });
});

// ══ Debug ═══════════════════════════════════════════════════

app.get("/api/debug", resolveUser, (req, res) => {
  const entry = (req as any).user as UserEntry;
  res.json({
    sessionId: (req as any).sessionId,
    user: (req as any).userName,
    at: new Date().toISOString(),
    context: entry.contexts[entry.userData.activeCtx].toJSON(),
    config: entry.userData.configs[entry.userData.activeCfg] ?? {},
    recentLogs: logger.getRecent(50),
  });
});

// ══ Data migration — data.json ═══════════════════════════════

function migrateIfNeeded(user: string): boolean {
  const oldCfgPath = resolve(userDir(user), "config.json");
  const oldCtxPath = resolve(userDir(user), "active.json");
  const savedDir = resolve(userDir(user), "saved");
  const newPath = userDataPath(user);

  if (existsSync(newPath)) return false;  // already migrated

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
  ctx.setName("Chat 1");
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

  const saved: SavedEntry[] = [];
  if (existsSync(savedDir)) {
    try {
      const files = readdirSync(savedDir).filter(f => f.endsWith(".json"));
      for (let i = 0; i < files.length; i++) {
        saved.push({
          ctxIndex: 0,  // point to the only context
          name: files[i].replace(/\.json$/, ""),
          savedAt: new Date().toISOString(),
        });
      }
    } catch {}
  }

  const userData: User = {
    version: 1,
    configs: [config],
    activeCfg: 0,
    contexts: [ctx.toJSON()],
    activeCtx: 0,
    saved,
  };

  writeUserData(user, userData, [ctx]);

  // Clean up old files
  try { unlinkSync(oldCfgPath); } catch {}
  try { unlinkSync(oldCtxPath); } catch {}
  try { renameSync(savedDir, resolve(userDir(user), "saved.bak")); } catch {}

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

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`COAL UI running at http://localhost:${PORT}`);
});
