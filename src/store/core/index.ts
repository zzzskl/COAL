import { reactive, watch } from "@vue/reactivity";
import type { Context } from "../../context/core/index.js";
import { Model } from "../../model/core/index.js";
import { executePendingTools, registry, logger } from "../../user/core/server.js";
import type { UserEntry } from "../../user/core/server.js";

export interface ServerStore {
  /** 从 entry 的实际数据同步形状快照到 reactive shape */
  syncShape(): void;
  /** 检测到"最后一条是 user"形状 */
  readonly needsProcessing: boolean;
  /** 当前是否正在处理 */
  readonly processing: boolean;
  /** 等待处理完成（如果正在处理） */
  waitForIdle(): Promise<void>;
}

/** 每个用户独立持有 store */
const storeMap = new Map<string, ServerStore>();

export function getOrCreateStore(userName: string, entry: UserEntry): ServerStore {
  let store = storeMap.get(userName);
  if (!store) {
    store = createServerStore(entry);
    storeMap.set(userName, store);
  }
  return store;
}

function createServerStore(entry: UserEntry): ServerStore {
  const shape = reactive({
    lastRole: null as string | null,
  });

  let _processing = false;
  let _resolveIdle: (() => void) | null = null;

  const store: ServerStore = {
    get needsProcessing() { return shape.lastRole === "user" && !_processing; },
    get processing() { return _processing; },
    waitForIdle() {
      if (!_processing) return Promise.resolve();
      return new Promise<void>((resolve) => { _resolveIdle = resolve; });
    },
    syncShape() {
      const ctx = entry.contexts[entry.userData.activeCtx];
      const msgs = ctx?.messages ?? [];
      shape.lastRole = msgs.length > 0 ? msgs[msgs.length - 1].role : null;
    },
  };

  // 形状观察：最后一条消息是 user → AI 处理
  watch(() => shape.lastRole, async (role) => {
    if (role !== "user" || _processing) return;
    _processing = true;
    try {
      const cfg = entry.userData.configs[entry.userData.activeCfg];
      const ctx = entry.contexts[entry.userData.activeCtx];
      const model = buildStoreModel(ctx, cfg);
      logger.interaction(`[store] auto-process`, { msgCount: ctx.messages.length });
      const result = await model.ask(undefined);
      if (cfg?.autoExecute && result.tool_calls?.length) {
        for (let round = 0; round < 10; round++) {
          const executed = executePendingTools(ctx, registry);
          if (executed.length === 0) break;
          logger.interaction(`[store] auto-exec round ${round + 1}: ${executed.length} tool(s)`);
          const r = await model.ask(undefined);
          if (!r.tool_calls?.length) break;
        }
      }
      // 更新形状（现在最后一条是 assistant）
      shape.lastRole = ctx.messages.length > 0
        ? ctx.messages[ctx.messages.length - 1].role
        : null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[store] auto-process: ${msg}`);
    } finally {
      _processing = false;
      _resolveIdle?.();
      _resolveIdle = null;
    }
  });

  return store;
}

function buildStoreModel(ctx: Context, cfg?: any): Model {
  const m = new Model().context(ctx);
  if (cfg) {
    if (cfg.model) m.model(cfg.model);
    if (cfg.temperature !== undefined) m.temperature(cfg.temperature);
    if (cfg.maxTokens !== undefined) m.maxTokens(cfg.maxTokens);
    if (cfg.topP !== undefined) m.topP(cfg.topP);
    if (cfg.stop) m.stop(cfg.stop);
    if (cfg.thinking === "disabled") m.noThinking();
    else if (cfg.thinking && typeof cfg.thinking === "object" && "effort" in cfg.thinking)
      m.thinking((cfg.thinking as { effort: "high" | "max" }).effort);
  }
  return m;
}
