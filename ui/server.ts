import express from "express";
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, unlinkSync } from "node:fs";
import { resolve, basename } from "node:path";
import { Model } from "../src/model/index.js";
import { Context } from "../src/context/index.js";
import type { ToolDef } from "../src/context/index.js";
import { logger } from "../src/logger/index.js";
import { executePendingTools } from "../src/executor/index.js";
import { registry, getBuiltinToolDefs } from "../src/tools/index.js";

const CONTEXTS_DIR = resolve(process.cwd(), "contexts");

const app = express();

// Request logging middleware
app.use((req, _res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    sessionId: req.headers["x-session-id"] ?? "none",
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
}

interface Session {
  ctx: Context;
  config: SessionConfig;
}

const sessions = new Map<string, Session>();

function getSession(sessionId: string): Session {
  let session = sessions.get(sessionId);
  if (!session) {
    session = { ctx: new Context(), config: {} };
    sessions.set(sessionId, session);
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
  (req as any).sessionId = sessionId;
  (req as any).session = getSession(sessionId);
  next();
}

// POST /api/chat
app.post("/api/chat", requireSession, async (req, res) => {
  try {
    const { message } = req.body as { message?: string };

    const session: Session = (req as any).session;
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

    const result = await m.ask(message);

    logger.info(`chat: reply received`, {
      contentLen: result.content?.length ?? 0,
      hasToolCalls: result.tool_calls?.length > 0,
      ctxSize: session.ctx.messages.length,
    });

    res.json({
      reply: result.content,
      tool_calls: result.tool_calls,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// GET /api/context
app.get("/api/context", requireSession, (_req, res) => {
  const session: Session = (_req as any).session;
  res.json(session.ctx.toJSON());
});

// POST /api/context/system
app.post("/api/context/system", requireSession, (req, res) => {
  const { content } = req.body as { content?: string };
  const session: Session = (req as any).session;
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
  res.json(session.ctx.toJSON());
});

// DELETE /api/context
app.delete("/api/context", requireSession, (req, res) => {
  const session: Session = (req as any).session;
  session.ctx.clear();
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
  session.ctx.add(role as any, content, {
    toolCallId: tool_call_id,
    toolCalls: tool_calls,
  });
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
  res.json(session.ctx.toJSON());
});

// DELETE /api/context/message/:index — remove a message
app.delete("/api/context/message/:index", requireSession, (req, res) => {
  const index = parseInt(req.params.index, 10);
  const session: Session = (req as any).session;
  if (isNaN(index) || index < 0 || index >= session.ctx.messages.length) {
    res.status(404).json({ error: "message index out of range" });
    return;
  }
  session.ctx.removeAt(index);
  res.json(session.ctx.toJSON());
});

// PUT /api/context/tools — set tools on context
app.put("/api/context/tools", requireSession, (req, res) => {
  const { tools, toolChoice } = req.body as {
    tools?: ToolDef[];
    toolChoice?: any;
  };
  const session: Session = (req as any).session;
  if (tools !== undefined) session.ctx.setTools(tools);
  if (toolChoice !== undefined) session.ctx.setToolChoice(toolChoice);
  res.json(session.ctx.toJSON());
});

// POST /api/context/execute — run executor on pending tool_calls
app.post("/api/context/execute", requireSession, (req, res) => {
  const session: Session = (req as any).session;
  const executed = executePendingTools(session.ctx, registry as any);
  logger.info(`executor ran: ${executed.length} tool(s) executed`, {
    executed,
    ctxSize: session.ctx.messages.length,
  });
  res.json({
    executed,
    ...session.ctx.toJSON(),
  } as any);
});

// GET /api/tools — list built-in tool definitions
app.get("/api/tools", (_req, res) => {
  res.json({ builtin: getBuiltinToolDefs() });
});

// GET /api/logs — return recent server logs
app.get("/api/logs", (_req, res) => {
  res.json({ entries: logger.getEntries() });
});

// DELETE /api/logs — clear logs
app.delete("/api/logs", (_req, res) => {
  logger.clear();
  res.json({ entries: [] });
});

// GET /api/debug — full state snapshot for debugging
app.get("/api/debug", requireSession, (req, res) => {
  const session: Session = (req as any).session;
  const sessionId = (req as any).sessionId as string;
  res.json({
    sessionId,
    at: new Date().toISOString(),
    context: session.ctx.toJSON(),
    config: session.config,
    recentLogs: logger.getRecent(50),
  });
});

// === Context persistence ===

function ensureContextsDir() {
  if (!existsSync(CONTEXTS_DIR)) {
    mkdirSync(CONTEXTS_DIR, { recursive: true });
  }
}

// GET /api/context/list — list saved context files
app.get("/api/context/list", (_req, res) => {
  try {
    ensureContextsDir();
    const files = readdirSync(CONTEXTS_DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => basename(f, ".json"));
    res.json({ files });
  } catch {
    res.json({ files: [] });
  }
});

// POST /api/context/save — save current context to file
app.post("/api/context/save", requireSession, (req, res) => {
  const { filename } = req.body as { filename?: string };
  if (!filename) {
    res.status(400).json({ error: "filename is required" });
    return;
  }
  try {
    ensureContextsDir();
    const session: Session = (req as any).session;
    const filePath = resolve(CONTEXTS_DIR, `${filename}.json`);
    writeFileSync(filePath, JSON.stringify(session.ctx.toJSON(), null, 2), "utf-8");
    logger.info(`context saved: ${filename}.json`, {
      msgCount: session.ctx.messages.length,
    });
    res.json({ saved: `${filename}.json`, messages: session.ctx.messages.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// POST /api/context/load — load context from file into current session
app.post("/api/context/load", requireSession, (req, res) => {
  const { filename } = req.body as { filename?: string };
  if (!filename) {
    res.status(400).json({ error: "filename is required" });
    return;
  }
  try {
    const filePath = resolve(CONTEXTS_DIR, `${filename}.json`);
    if (!existsSync(filePath)) {
      res.status(404).json({ error: "file not found" });
      return;
    }
    const raw = readFileSync(filePath, "utf-8");
    const json = JSON.parse(raw);
    const session: Session = (req as any).session;
    // Replace session context with loaded one
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
    logger.info(`context loaded: ${filename}.json`, {
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
app.delete("/api/context/file/:filename", (req, res) => {
  const { filename } = req.params;
  try {
    const filePath = resolve(CONTEXTS_DIR, `${filename}.json`);
    if (existsSync(filePath)) {
      unlinkSync(filePath);
      logger.info(`context deleted: ${filename}.json`);
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
