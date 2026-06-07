import type { Express } from "express";
import { Context } from "../core/index.js";
import type { ToolDef, ToolChoice } from "../type.js";
import { resolveUser, writeUserData, buildModel, executePendingTools, registry, logger } from "../../user/core/server.js";
import { getOrCreateStore } from "../../store/core/index.js";

export function registerContextRoutes(app: Express) {
  // ── Contexts list ──────────────────────────────────────────
  app.get("/api/contexts", resolveUser, (req, res) => {
    const entry = (req as any).user;
    res.json({
      contexts: entry.contexts.map((c: Context) => c.toJSON()),
      activeCtx: entry.userData.activeCtx,
    });
  });

  // ── Contexts save ─────────────────────────────────────────
  // AI 处理由 store 的形状观察 watcher 自动触发（store.syncShape()）
  app.put("/api/contexts", resolveUser, async (req, res) => {
    const entry = (req as any).user;
    const userName: string = (req as any).userName;
    const body = req.body as { contexts: any[]; activeCtx: number; regenerate?: boolean };

    entry.userData.contexts = body.contexts;
    entry.userData.activeCtx = body.activeCtx;
    entry.contexts = body.contexts.map((c: any) => Context.fromJSON(c));

    const store = getOrCreateStore(userName, entry);
    store.syncShape(); // ← 更新反应式形状 → watcher 自动检测 "lastRole === user"

    // regenerate: 最后消息不是 user，watcher 不会触发，需要显式处理
    if (body.regenerate && !store.processing) {
      try {
        const ctx = entry.contexts[body.activeCtx];
        const cfg = entry.userData.configs[entry.userData.activeCfg];
        const model = buildModel(ctx, cfg);
        logger.interaction(`auto-process (regenerate)`);
        const result = await model.ask(undefined);
        if (cfg?.autoExecute && result.tool_calls?.length) {
          for (let round = 0; round < 10; round++) {
            const executed = executePendingTools(ctx, registry);
            if (executed.length === 0) break;
            logger.interaction(`auto-exec round ${round + 1}: ${executed.length} tool(s)`);
            const r = await model.ask(undefined);
            if (!r.tool_calls?.length) break;
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`auto-process (regenerate): ${msg}`);
        writeUserData(userName, entry.userData, entry.contexts);
        res.json({
          contexts: entry.contexts.map((c: Context) => c.toJSON()),
          activeCtx: entry.userData.activeCtx,
          warning: `AI 处理失败: ${msg}`,
        });
        return;
      }
    } else if (!body.regenerate) {
      // 等待 watcher 触发的 AI 处理完成（如果有的话）
      await store.waitForIdle();
    }

    writeUserData(userName, entry.userData, entry.contexts);
    res.json({
      contexts: entry.contexts.map((c: Context) => c.toJSON()),
      activeCtx: entry.userData.activeCtx,
    });
  });

  // ── SSE Streaming: AI 处理，逐 token 推送 ──────────────────
  app.post("/api/contexts/process", resolveUser, async (req, res) => {
    const entry = (req as any).user;
    const userName: string = (req as any).userName;
    const body = req.body as { contexts: any[]; activeCtx: number; regenerate?: boolean };

    entry.userData.contexts = body.contexts;
    entry.userData.activeCtx = body.activeCtx;
    entry.contexts = body.contexts.map((c: any) => Context.fromJSON(c));

    const ctx = entry.contexts[body.activeCtx];
    const msgs = ctx.messages;
    const lastMsg = msgs[msgs.length - 1];

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    });

    let autoExecuted = 0;

    if (lastMsg?.role !== "user" && !body.regenerate) {
      writeUserData(userName, entry.userData, entry.contexts);
      res.write(`event: done\ndata: ${JSON.stringify({
        contexts: entry.contexts.map((c: Context) => c.toJSON()),
        activeCtx: entry.userData.activeCtx,
      })}\n\n`);
      res.end();
      return;
    }

    try {
      const cfg = entry.userData.configs[entry.userData.activeCfg];
      const model = buildModel(ctx, cfg);

      for (let round = 0; round < 10; round++) {
        logger.interaction(`/api/contexts/process round ${round}`);
        res.write(`event: status\ndata: ${JSON.stringify({ status: "thinking", round })}\n\n`);

        let hasToolCalls = false;

        const stream = model.askStream();
        for await (const ev of stream) {
          switch (ev.type) {
            case "token":
              res.write(`event: token\ndata: ${JSON.stringify({ token: ev.token })}\n\n`);
              break;
            case "done":
              if (ev.toolCalls?.length) {
                hasToolCalls = true;
                for (const tc of ev.toolCalls) {
                  res.write(`event: tool_call\ndata: ${JSON.stringify({
                    id: tc.id,
                    name: tc.function.name,
                    arguments: tc.function.arguments,
                  })}\n\n`);
                }
                const executed = executePendingTools(ctx, registry);
                autoExecuted += executed.length;
                logger.interaction(`round ${round}: executed ${executed.length} tool(s)`);
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
        logger.interaction(`round ${round}: has tool_calls, continuing (ctx has ${ctx.messages.length} msgs)`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`/api/contexts/process error: ${msg}`);
      writeUserData(userName, entry.userData, entry.contexts);
      res.write(`event: error\ndata: ${JSON.stringify({ message: `AI 处理失败: ${msg}` })}\n\n`);
      res.end();
      return;
    }

    writeUserData(userName, entry.userData, entry.contexts);
    res.write(`event: done\ndata: ${JSON.stringify({
      contexts: entry.contexts.map((c: Context) => c.toJSON()),
      activeCtx: entry.userData.activeCtx,
      autoExecuted: autoExecuted > 0 ? autoExecuted : undefined,
    })}\n\n`);
    res.end();
  });

  // ── Backward-compat: single context ────────────────────────
  app.get("/api/context", resolveUser, (_req, res) => {
    const entry = (_req as any).user;
    const ctx = entry.contexts[entry.userData.activeCtx];
    res.json(ctx.toJSON());
  });

  app.delete("/api/context", resolveUser, (req, res) => {
    const entry = (req as any).user;
    const userName: string = (req as any).userName;
    const ctx = entry.contexts[entry.userData.activeCtx];
    ctx.clear();
    writeUserData(userName, entry.userData, entry.contexts);
    res.json(ctx.toJSON());
  });

  // ── Message CRUD ───────────────────────────────────────────
  app.post("/api/context/message", resolveUser, (req, res) => {
    const entry = (req as any).user;
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
    const entry = (req as any).user;
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
    const entry = (req as any).user;
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

  // ── System / Tools / Execute ───────────────────────────────
  app.post("/api/context/system", resolveUser, (req, res) => {
    const entry = (req as any).user;
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
    const entry = (req as any).user;
    const userName: string = (req as any).userName;
    const { tools, toolChoice } = req.body as { tools?: ToolDef[]; toolChoice?: ToolChoice };
    const ctx = entry.contexts[entry.userData.activeCtx];
    if (tools !== undefined) ctx.setTools(tools);
    if (toolChoice !== undefined) ctx.setToolChoice(toolChoice);
    writeUserData(userName, entry.userData, entry.contexts);
    res.json(ctx.toJSON());
  });

  app.post("/api/context/execute", resolveUser, (req, res) => {
    const entry = (req as any).user;
    const userName: string = (req as any).userName;
    const ctx = entry.contexts[entry.userData.activeCtx];
    const executed = executePendingTools(ctx, registry);
    logger.interaction(`executor ran: ${executed.length} tool(s) executed`, {
      executed,
      ctxSize: ctx.messages.length,
    });
    writeUserData(userName, entry.userData, entry.contexts);
    res.json({ executed, ...ctx.toJSON() } as any);
  });
}
