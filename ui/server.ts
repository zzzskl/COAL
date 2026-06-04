import express from "express";
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, unlinkSync, renameSync } from "node:fs";
import { resolve, basename, dirname } from "node:path";
import { Model } from "../src/model/index.js";
import { Context } from "../src/context/index.js";
import type { ToolDef } from "../src/context/index.js";
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

interface SessionConfig {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  thinking?: "disabled" | { effort: "high" | "max" };
  stop?: string[];
  autoExecute?: boolean;
}

interface Session {
  ctx: Context;
  config: SessionConfig;
  user: string;
}

const sessions = new Map<string, Session>();

// ── user path helpers ─────────────────────────────────────────────

function userDir(user: string) {
  return resolve(DATA_DIR, user);
}
function userConfigPath(user: string) {
  return resolve(userDir(user), "config.json");
}
function userActivePath(user: string) {
  return resolve(userDir(user), "active.json");
}
function userSavedDir(user: string) {
  return resolve(userDir(user), "saved");
}

function ensureDir(p: string) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

// ── atomic file write ─────────────────────────────────────────────

function atomicWrite(filePath: string, data: string) {
  const tmp = filePath + ".tmp";
  ensureDir(dirname(filePath));
  writeFileSync(tmp, data, "utf-8");
  renameSync(tmp, filePath);
}

// ── user data I/O ─────────────────────────────────────────────────

function readUserConfig(user: string): SessionConfig | null {
  const p = userConfigPath(user);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, "utf-8")); } catch { return null; }
}

function writeUserConfig(user: string, config: SessionConfig) {
  atomicWrite(userConfigPath(user), JSON.stringify(config, null, 2));
}

function readUserActive(user: string): Record<string, unknown> | null {
  const p = userActivePath(user);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, "utf-8")); } catch { return null; }
}

function writeUserActive(user: string, ctx: Context) {
  const data = {
    ...ctx.toJSON(),
    savedAt: new Date().toISOString(),
  };
  atomicWrite(userActivePath(user), JSON.stringify(data, null, 2));
}

// ── session management ────────────────────────────────────────────

function sessionKey(user: string, sessionId: string) {
  return `${user}:${sessionId}`;
}

function getSession(user: string, sessionId: string): Session {
  const key = sessionKey(user, sessionId);
  let session = sessions.get(key);
  if (!session) {
    // Try disk restore
    const config = readUserConfig(user) ?? {};
    const activeJson = readUserActive(user);
    let ctx: Context;
    if (activeJson) {
      ctx = Context.fromJSON(activeJson as any);
      logger.info(`session restored from disk for user "${user}"`, {
        msgCount: ctx.messages.length,
      });
    } else {
      ctx = new Context();
    }
    session = { ctx, config, user };
    sessions.set(key, session);
  }
  return session;
}

function requireSession(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const sessionId = req.headers["x-session-id"];
  if (!sessionId || typeof sessionId !== "string") {
    res.status(400).json({ error: "x-session-id header is required" });
    return;
  }
  const user = (req.headers["x-user"] as string) || "default";
  (req as any).sessionId = sessionId;
  (req as any).user = user;
  (req as any).session = getSession(user, sessionId);
  next();
}

// ── debounced auto-save ───────────────────────────────────────────

const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleSave(user: string, session: Session) {
  const existing = saveTimers.get(user);
  if (existing) clearTimeout(existing);
  saveTimers.set(user, setTimeout(() => {
    try {
      writeUserConfig(user, session.config);
      writeUserActive(user, session.ctx);
      saveTimers.delete(user);
    } catch (err) {
      logger.warn(`auto-save failed for "${user}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }, 300));
}

// ── user switch ───────────────────────────────────────────────────

// POST /api/user/switch — save current, load target
app.post("/api/user/switch", requireSession, async (req, res) => {
  const { user: targetUser } = req.body as { user?: string };
  if (!targetUser) {
    res.status(400).json({ error: "user is required" });
    return;
  }
  const currentSession: Session = (req as any).session;
  const currentUser: string = (req as any).user;

  // Save current user state
  try {
    writeUserConfig(currentUser, currentSession.config);
    writeUserActive(currentUser, currentSession.ctx);
  } catch (err) {
    logger.warn(`failed to save current user "${currentUser}": ${err instanceof Error ? err.message : String(err)}`);
  }

  // Load target user — create new session (same sessionId, new user)
  const sessionId: string = (req as any).sessionId;
  const newKey = sessionKey(targetUser, sessionId);
  // Remove old key, create new
  const oldKey = sessionKey(currentUser, sessionId);
  sessions.delete(oldKey);
  const newSession = getSession(targetUser, sessionId);
  sessions.set(newKey, newSession);

  // Update req
  (req as any).user = targetUser;
  (req as any).session = newSession;

  res.json({
    user: targetUser,
    context: newSession.ctx.toJSON(),
    config: newSession.config,
  });
});

// ── GET /api/user — get current user info ─────────────────────────

app.get("/api/user", requireSession, (req, res) => {
  const session: Session = (req as any).session;
  const user: string = (req as any).user;
  res.json({ user, config: session.config });
});

// ── chat ──────────────────────────────────────────────────────────

// POST /api/chat
app.post("/api/chat", requireSession, async (req, res) => {
  try {
    const session: Session = (req as any).session;
    const user: string = (req as any).user;
    const { message, autoExecute: reqAutoExecute } = req.body as {
      message?: string;
      autoExecute?: boolean;
    };
    const autoExecute = reqAutoExecute ?? session.config.autoExecute ?? false;
    const {
      model,
      temperature,
      maxTokens,
      topP,
      thinking,
      stop,
      tools,
      toolChoice,
    } = req.body as SessionConfig & { message: string; tools?: ToolDef[]; toolChoice?: any };

    if (model !== undefined) session.config.model = model;
    if (temperature !== undefined) session.config.temperature = temperature;
    if (maxTokens !== undefined) session.config.maxTokens = maxTokens;
    if (topP !== undefined) session.config.topP = topP;
    if (thinking !== undefined) session.config.thinking = thinking;
    if (stop !== undefined) session.config.stop = stop;
    if (tools !== undefined) session.ctx.setTools(tools);
    if (toolChoice !== undefined) session.ctx.setToolChoice(toolChoice);

    logger.info(`chat: ctx has ${session.ctx.messages.length} messages before ask`);

    function makeModel() {
      const m = new Model().context(session.ctx);
      const cfg = session.config;
      if (cfg.model) m.model(cfg.model);
      if (cfg.temperature !== undefined) m.temperature(cfg.temperature);
      if (cfg.maxTokens !== undefined) m.maxTokens(cfg.maxTokens);
      if (cfg.topP !== undefined) m.topP(cfg.topP);
      if (cfg.stop) m.stop(cfg.stop);
      if (cfg.thinking === "disabled") {
        m.noThinking();
      } else if (cfg.thinking?.effort) {
        m.thinking(cfg.thinking.effort);
      }
      return m;
    }

    let currentResult = await makeModel().ask(message);

    logger.info(`chat: reply received`, {
      contentLen: currentResult.content?.length ?? 0,
      hasToolCalls: (currentResult.tool_calls?.length ?? 0) > 0,
      ctxSize: session.ctx.messages.length,
    });

    let totalExecuted = 0;
    if (autoExecute && currentResult.tool_calls?.length) {
      const MAX_ROUNDS = 10;
      for (let round = 0; round < MAX_ROUNDS; round++) {
        const executed = executePendingTools(session.ctx, registry as any);
        if (executed.length === 0) break;
        totalExecuted += executed.length;
        logger.info(`auto-exec round ${round + 1}: ${executed.length} tool(s)`, {
          executed,
          ctxSize: session.ctx.messages.length,
        });

        currentResult = await makeModel().ask();
        if (!currentResult.tool_calls?.length) break;
      }
      if (totalExecuted > 0) {
        logger.info(`auto-exec done: ${totalExecuted} total tool(s) executed`);
      }
    }

    scheduleSave(user, session);

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

// ── config ────────────────────────────────────────────────────────

// GET /api/config — read current session configuration
app.get("/api/config", requireSession, (req, res) => {
  const session: Session = (req as any).session;
  res.json(session.config);
});

// PUT /api/config — update session configuration
app.put("/api/config", requireSession, (req, res) => {
  const session: Session = (req as any).session;
  const user: string = (req as any).user;
  const {
    model, temperature, maxTokens, topP, thinking, stop, autoExecute,
  } = req.body as SessionConfig;

  if (model !== undefined) session.config.model = model;
  if (temperature !== undefined) session.config.temperature = temperature;
  if (maxTokens !== undefined) session.config.maxTokens = maxTokens;
  if (topP !== undefined) session.config.topP = topP;
  if (thinking !== undefined) session.config.thinking = thinking;
  if (stop !== undefined) session.config.stop = stop;
  if (autoExecute !== undefined) session.config.autoExecute = autoExecute;

  scheduleSave(user, session);

  res.json(session.config);
});

// ── context ───────────────────────────────────────────────────────

// GET /api/context
app.get("/api/context", requireSession, (_req, res) => {
  const session: Session = (_req as any).session;
  res.json(session.ctx.toJSON());
});

// POST /api/context/system
app.post("/api/context/system", requireSession, (req, res) => {
  const { content } = req.body as { content?: string };
  const session: Session = (req as any).session;
  const user: string = (req as any).user;
  if (content) {
    session.ctx.system(content);
  } else {
    const nonSystem = session.ctx.messages.filter((m) => m.role !== "system");
    session.ctx.clear();
    for (const m of nonSystem) {
      session.ctx.add(m.role as any, m.content ?? "", {
        toolCallId: (m as any).tool_call_id,
        toolCalls: (m as any).tool_calls,
      });
    }
  }
  scheduleSave(user, session);
  res.json(session.ctx.toJSON());
});

// DELETE /api/context
app.delete("/api/context", requireSession, (req, res) => {
  const session: Session = (req as any).session;
  const user: string = (req as any).user;
  session.ctx.clear();
  scheduleSave(user, session);
  res.json(session.ctx.toJSON());
});

// POST /api/context/message — add a message
app.post("/api/context/message", requireSession, (req, res) => {
  const { role, content, tool_call_id, tool_calls } = req.body as {
    role?: string;
    content?: string;
    tool_call_id?: string;
    tool_calls?: any[];
  };
  if (!role || content === undefined) {
    res.status(400).json({ error: "role and content are required" });
    return;
  }
  if (role === "tool" && !tool_call_id) {
    res.status(400).json({ error: "tool_call_id is required for tool messages" });
    return;
  }
  const session: Session = (req as any).session;
  const user: string = (req as any).user;
  session.ctx.add(role as any, content, {
    toolCallId: tool_call_id,
    toolCalls: tool_calls,
  });
  scheduleSave(user, session);
  res.json(session.ctx.toJSON());
});

// PUT /api/context/message/:index — update a message
app.put("/api/context/message/:index", requireSession, (req, res) => {
  const index = parseInt(req.params.index, 10);
  const { role, content, tool_call_id, tool_calls } = req.body as {
    role?: string;
    content?: string;
    tool_call_id?: string;
    tool_calls?: any[];
  };
  const session: Session = (req as any).session;
  const user: string = (req as any).user;
  if (isNaN(index) || index < 0 || index >= session.ctx.messages.length) {
    res.status(404).json({ error: "message index out of range" });
    return;
  }
  const existing = session.ctx.messages[index];
  session.ctx.updateAt(
    index,
    (role as any) ?? existing.role,
    content ?? (existing as any).content ?? "",
    {
      toolCallId:
        tool_call_id ?? (existing as any).tool_call_id,
      toolCalls: tool_calls ?? (existing as any).tool_calls,
    }
  );
  scheduleSave(user, session);
  res.json(session.ctx.toJSON());
});

// DELETE /api/context/message/:index — remove a message
app.delete("/api/context/message/:index", requireSession, (req, res) => {
  const index = parseInt(req.params.index, 10);
  const session: Session = (req as any).session;
  const user: string = (req as any).user;
  if (isNaN(index) || index < 0 || index >= session.ctx.messages.length) {
    res.status(404).json({ error: "message index out of range" });
    return;
  }
  session.ctx.removeAt(index);
  scheduleSave(user, session);
  res.json(session.ctx.toJSON());
});

// PUT /api/context/tools — set tools on context
app.put("/api/context/tools", requireSession, (req, res) => {
  const { tools, toolChoice } = req.body as {
    tools?: ToolDef[];
    toolChoice?: any;
  };
  const session: Session = (req as any).session;
  const user: string = (req as any).user;
  if (tools !== undefined) session.ctx.setTools(tools);
  if (toolChoice !== undefined) session.ctx.setToolChoice(toolChoice);
  scheduleSave(user, session);
  res.json(session.ctx.toJSON());
});

// POST /api/context/execute — run executor on pending tool_calls
app.post("/api/context/execute", requireSession, (req, res) => {
  const session: Session = (req as any).session;
  const user: string = (req as any).user;
  const executed = executePendingTools(session.ctx, registry as any);
  logger.info(`executor ran: ${executed.length} tool(s) executed`, {
    executed,
    ctxSize: session.ctx.messages.length,
  });
  scheduleSave(user, session);
  res.json({
    executed,
    ...session.ctx.toJSON(),
  } as any);
});

// ── tools ─────────────────────────────────────────────────────────

// GET /api/tools — list built-in tool definitions
app.get("/api/tools", (_req, res) => {
  res.json({ builtin: getBuiltinToolDefs() });
});

// ── logs ──────────────────────────────────────────────────────────

// GET /api/logs — return recent server logs
app.get("/api/logs", (_req, res) => {
  res.json({ entries: logger.getEntries() });
});

// DELETE /api/logs — clear logs
app.delete("/api/logs", (_req, res) => {
  logger.clear();
  res.json({ entries: [] });
});

// ── debug ─────────────────────────────────────────────────────────

// GET /api/debug — full state snapshot for debugging
app.get("/api/debug", requireSession, (req, res) => {
  const session: Session = (req as any).session;
  const sessionId = (req as any).sessionId as string;
  const user: string = (req as any).user;
  res.json({
    sessionId,
    user,
    at: new Date().toISOString(),
    context: session.ctx.toJSON(),
    config: session.config,
    recentLogs: logger.getRecent(50),
  });
});

// ── context persistence (per-user) ────────────────────────────────

// GET /api/context/list — list saved context files for current user
app.get("/api/context/list", requireSession, (req, res) => {
  try {
    const user: string = (req as any).user;
    const dir = userSavedDir(user);
    if (!existsSync(dir)) {
      res.json({ files: [] });
      return;
    }
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => basename(f, ".json"));
    res.json({ files });
  } catch {
    res.json({ files: [] });
  }
});

// POST /api/context/save — save current context to user's saved/ dir
app.post("/api/context/save", requireSession, (req, res) => {
  const { filename } = req.body as { filename?: string };
  if (!filename) {
    res.status(400).json({ error: "filename is required" });
    return;
  }
  try {
    const user: string = (req as any).user;
    const session: Session = (req as any).session;
    const dir = userSavedDir(user);
    ensureDir(dir);
    const filePath = resolve(dir, `${filename}.json`);
    const data = {
      ...session.ctx.toJSON(),
      savedAt: new Date().toISOString(),
    };
    writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
    logger.info(`context saved: ${filename}.json for user "${user}"`, {
      msgCount: session.ctx.messages.length,
    });
    res.json({ saved: `${filename}.json`, messages: session.ctx.messages.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// POST /api/context/load — load context from user's saved/ dir
app.post("/api/context/load", requireSession, (req, res) => {
  const { filename } = req.body as { filename?: string };
  if (!filename) {
    res.status(400).json({ error: "filename is required" });
    return;
  }
  try {
    const user: string = (req as any).user;
    const session: Session = (req as any).session;
    const filePath = resolve(userSavedDir(user), `${filename}.json`);
    if (!existsSync(filePath)) {
      res.status(404).json({ error: "file not found" });
      return;
    }
    const raw = readFileSync(filePath, "utf-8");
    const json = JSON.parse(raw);
    const newCtx = Context.fromJSON(json);
    session.ctx.clear();
    for (const m of newCtx.messages) {
      session.ctx.add(m.role as any, (m as any).content ?? "", {
        toolCallId: (m as any).tool_call_id,
        toolCalls: (m as any).tool_calls,
      });
    }
    if (newCtx.getTools()) session.ctx.setTools(newCtx.getTools()!);
    if (newCtx.getToolChoice()) session.ctx.setToolChoice(newCtx.getToolChoice()!);
    scheduleSave(user, session);
    logger.info(`context loaded: ${filename}.json for user "${user}"`, {
      msgCount: session.ctx.messages.length,
    });
    res.json({
      loaded: `${filename}.json`,
      ...session.ctx.toJSON(),
    } as any);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// DELETE /api/context/file/:filename — delete a saved context file
app.delete("/api/context/file/:filename", requireSession, (req, res) => {
  const { filename } = req.params;
  try {
    const user: string = (req as any).user;
    const filePath = resolve(userSavedDir(user), `${filename}.json`);
    if (existsSync(filePath)) {
      unlinkSync(filePath);
      logger.info(`context deleted: ${filename}.json for user "${user}"`);
      res.json({ deleted: `${filename}.json` });
    } else {
      res.status(404).json({ error: "file not found" });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`COAL UI running at http://localhost:${PORT}`);
});
