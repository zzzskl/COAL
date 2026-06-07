import express from "express";
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, unlinkSync, renameSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { Model } from "../src/model/index.js";
import { Context } from "../src/context/index.js";
import type { ToolDef, ToolChoice } from "../src/context/index.js";
import type { User, Config, StreamEvent } from "../src/types/index.js";
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

app.use(express.json({ limit: "10mb" }));
app.use(express.static("ui/public"));
app.use("/test", express.static("test/ui"));

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

function buildModel(ctx: Context, cfg?: Config): Model {
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

  const userData: User = {
    version: 1,
    configs: [defaultCfg],
    activeCfg: 0,
    contexts: [defaultCtx.toJSON()],
    activeCtx: 0,
    meta: { context: {} },
    ui: { collapsed: {}, context: { 0: { name: "Chat 1" } } },
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
    // Backward compat: ensure meta and ui fields
    const r = raw as any;
    if (!r.meta) r.meta = { context: {} };
    if (!r.ui) r.ui = { collapsed: {}, context: {} };
    if (!r.ui.context) r.ui.context = {};
    // Migrate old ctx.name → ui.context[i].name
    for (let i = 0; i < r.contexts.length; i++) {
      if (r.contexts[i]?.name && !r.ui.context[i]) {
        r.ui.context[i] = { name: r.contexts[i].name };
      }
      delete r.contexts[i]?.name;  // strip old name from context data
    }
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

app.put("/api/contexts", resolveUser, async (req, res) => {
  const entry = (req as any).user as UserEntry;
  const userName: string = (req as any).userName;
  const body = req.body as { contexts: any[]; activeCtx: number; regenerate?: boolean };
  entry.userData.contexts = body.contexts;
  entry.userData.activeCtx = body.activeCtx;
  entry.contexts = body.contexts.map((c: any) => Context.fromJSON(c));

  let autoExecuted = 0;
  const ctx = entry.contexts[body.activeCtx];
  const msgs = ctx.messages;
  const lastMsg = msgs[msgs.length - 1];

  // Auto-process: if last message is from user, or regenerate flag is set
  if (lastMsg?.role === "user" || body.regenerate) {
    try {
      const cfg = entry.userData.configs[entry.userData.activeCfg];
      const model = buildModel(ctx, cfg);
      logger.interaction(`auto-process: ctx has ${ctx.messages.length} messages`);
      const result = await model.ask(undefined);
      logger.interaction(`auto-process: reply received`, {
        contentLen: result.content?.length ?? 0,
        hasToolCalls: (result.tool_calls?.length ?? 0) > 0,
      });
      if (cfg?.autoExecute && result.tool_calls?.length) {
        for (let round = 0; round < 10; round++) {
          const executed = executePendingTools(ctx, registry as any);
          if (executed.length === 0) break;
          autoExecuted += executed.length;
          logger.interaction(`auto-exec round ${round + 1}: ${executed.length} tool(s)`);
          const r = await model.ask(undefined);
          if (!r.tool_calls?.length) break;
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`auto-process: ${msg}`);
      // Persist user's message even if AI failed
      writeUserData(userName, entry.userData, entry.contexts);
      res.json({
        contexts: entry.contexts.map(c => c.toJSON()),
        activeCtx: entry.userData.activeCtx,
        warning: `AI 处理失败: ${msg}`,
      });
      return;
    }
  }

  writeUserData(userName, entry.userData, entry.contexts);
  res.json({
    contexts: entry.contexts.map(c => c.toJSON()),
    activeCtx: entry.userData.activeCtx,
    autoExecuted: autoExecuted > 0 ? autoExecuted : undefined,
  });
});

// ══ SSE Streaming: 异步 AI 处理，逐 token 推送给客户端 ════════════

app.post("/api/contexts/process", resolveUser, async (req, res) => {
  const entry = (req as any).user as UserEntry;
  const userName: string = (req as any).userName;
  const body = req.body as { contexts: any[]; activeCtx: number; regenerate?: boolean };

  // 1. 保存传入的 context 状态
  entry.userData.contexts = body.contexts;
  entry.userData.activeCtx = body.activeCtx;
  entry.contexts = body.contexts.map((c: any) => Context.fromJSON(c));

  const ctx = entry.contexts[body.activeCtx];
  const msgs = ctx.messages;
  const lastMsg = msgs[msgs.length - 1];

  // 2. 设置 SSE 响应头
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });

  let autoExecuted = 0;

  // 3. 判断是否需要 AI 处理
  if (lastMsg?.role !== "user" && !body.regenerate) {
    // 无需处理，直接返回 done
    writeUserData(userName, entry.userData, entry.contexts);
    res.write(`event: done\ndata: ${JSON.stringify({
      contexts: entry.contexts.map(c => c.toJSON()),
      activeCtx: entry.userData.activeCtx,
    })}\n\n`);
    res.end();
    return;
  }

  // 4. AI 处理 + 工具执行循环
  try {
    const cfg = entry.userData.configs[entry.userData.activeCfg];
    const model = buildModel(ctx, cfg);

    for (let round = 0; round < 10; round++) {
      logger.interaction(`/api/contexts/process round ${round}`);
      res.write(`event: status\ndata: ${JSON.stringify({ status: "thinking", round })}\n\n`);

      let hasToolCalls = false;

      // 消费 askStream() 的 AsyncGenerator，边读边写 SSE
      const stream = model.askStream();
      for await (const ev of stream) {
        switch (ev.type) {
          case "token":
            res.write(`event: token\ndata: ${JSON.stringify({ token: ev.token })}\n\n`);
            break;
          case "done":
            if (ev.toolCalls?.length) {
              hasToolCalls = true;
              // 发出 tool_call 事件
              for (const tc of ev.toolCalls) {
                res.write(`event: tool_call\ndata: ${JSON.stringify({
                  id: tc.id,
                  name: tc.function.name,
                  arguments: tc.function.arguments,
                })}\n\n`);
              }
              // 执行工具
              const executed = executePendingTools(ctx, registry as any);
              autoExecuted += executed.length;
              logger.interaction(`round ${round}: executed ${executed.length} tool(s)`);
              // 发出 tool_result 事件
              for (const tc of ev.toolCalls) {
                const toolMsg = [...ctx.messages].reverse().find(
                  (m: any) => m.role === "tool" && m.tool_call_id === tc.id
                );
                if (toolMsg) {
                  res.write(`event: tool_result\ndata: ${JSON.stringify({
                    id: tc.id,
                    result: (toolMsg as any).content,
                  })}\n\n`);
                }
              }
            }
            break;
          case "error":
            res.write(`event: error\ndata: ${JSON.stringify({ message: ev.message })}\n\n`);
            writeUserData(userName, entry.userData, entry.contexts);
            res.end();
            return;
        }
      }

      if (!hasToolCalls) {
        logger.interaction(`round ${round}: no more tool_calls, breaking loop`);
        break;
      }
      logger.interaction(`round ${round}: has tool_calls, continuing to next round (ctx has ${ctx.messages.length} msgs)`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`/api/contexts/process error: ${msg}`);
    writeUserData(userName, entry.userData, entry.contexts);
    res.write(`event: error\ndata: ${JSON.stringify({ message: `AI 处理失败: ${msg}` })}\n\n`);
    res.end();
    return;
  }

  // 5. 保存最终状态并发送 done 事件
  writeUserData(userName, entry.userData, entry.contexts);
  res.write(`event: done\ndata: ${JSON.stringify({
    contexts: entry.contexts.map(c => c.toJSON()),
    activeCtx: entry.userData.activeCtx,
    autoExecuted: autoExecuted > 0 ? autoExecuted : undefined,
  })}\n\n`);
  res.end();
});

// ══ UI Preferences API ══════════════════════════════════════

app.get("/api/ui", resolveUser, (req, res) => {
  const { userData } = (req as any).user as UserEntry;
  res.json(userData.ui ?? { collapsed: {}, context: {} });
});

app.put("/api/ui", resolveUser, (req, res) => {
  const entry = (req as any).user as UserEntry;
  const { collapsed, context: ctxNames } = req.body as { collapsed?: Record<number, number[]>; context?: Record<number, { name: string }> };
  if (!entry.userData.ui) entry.userData.ui = { collapsed: {}, context: {} };
  if (collapsed !== undefined) entry.userData.ui.collapsed = collapsed;
  if (ctxNames !== undefined) entry.userData.ui.context = ctxNames;
  writeUserData((req as any).userName, entry.userData, entry.contexts);
  res.json(entry.userData.ui);
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
  logger.interaction(`executor ran: ${executed.length} tool(s) executed`, {
    executed,
    ctxSize: ctx.messages.length,
  });
  writeUserData(userName, entry.userData, entry.contexts);
  res.json({ executed, ...ctx.toJSON() } as any);
});

// ══ [removed: Context save/load/list] ════════════════════════





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

  // Migrate old saved entries to meta/context names
  const savedCtxName = oldCtx.name || "Chat 1";
  const hasSaved = existsSync(savedDir) && readdirSync(savedDir).length > 0;

  const userData: User = {
    version: 1,
    configs: [config],
    activeCfg: 0,
    contexts: [ctx.toJSON()],
    activeCtx: 0,
    meta: { context: hasSaved ? { 0: { savedAt: new Date().toISOString() } } : {} },
    ui: { collapsed: {}, context: { 0: { name: savedCtxName } } },
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

const PORT = parseInt(process.env.PORT || "3000", 10);
app.listen(PORT, () => {
  console.log(`COAL UI running at http://localhost:${PORT}`);
});
