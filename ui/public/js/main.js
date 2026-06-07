// main.js — COAL app bootstrap and integration layer
import { reactive, watch, createApp, h } from "vue";
import { ConfigDetail, ConfigList } from "./components/config.js";
import { ContextCompact, ContextDetail, ContextList } from "./components/context.js";
import { ToolCompact, ToolDetail, ToolList } from "./components/tool.js";
import { ContextBuilderPanel } from "./components/ctx-panel.js";
import { LogsPanel } from "./components/logs-panel.js";
import { ToolsPanel } from "./components/tools-panel.js";
import { readSSE } from "./sse.js";
import { VueConfigList, VueConfigDetail } from "./components/config.vue.js";
import { VueMessageList, openEditModal } from "./components/message.vue.js";
import { VueContextList, VueContextBuilder } from "./components/context.vue.js";
import { VueToolList, VueToolDetail } from "./components/tool.vue.js";

// ══ State ══════════════════════════════════════════════════
let userName = localStorage.getItem("coal-user") || "default";
let sessionId = localStorage.getItem("coal-session") || crypto.randomUUID();
localStorage.setItem("coal-session", sessionId);

const state = reactive({
  configs: [],
  activeCfg: 0,
  contexts: [],
  activeCtx: 0,
  meta: { context: {} },
  ui: { collapsed: {}, context: {} },
  // 版本号计数器：递增即触发对应 watcher 自动调用 sync
  _sync: { configs: 0, contexts: 0, ui: 0 },
});

// UI refs
let messageList = null;

// ══ changed() — 声明式渲染 + 触发响应式 sync ═════════════
const _changedRegistry = {};
function changed(area) {
  const entry = _changedRegistry[area];
  if (!entry) return;
  // 同步执行 render 函数（DOM 立即更新）
  for (const fn of entry.render) fn();
  // 递增版本号 → Vue watcher 自动调用 sync 函数
  state._sync[area]++;
}
changed.register = function (area, { render, sync }) {
  _changedRegistry[area] = { render: render || [], sync: sync || [] };
};

// Expose app state to sidebar modules (sb-context.js etc.)
window.__COAL_APP__ = {
  state,
  getActiveConfig: () => state.configs[state.activeCfg],
  getActiveContext: () => state.contexts[state.activeCtx],
  getActiveMessages: () => state.contexts[state.activeCtx]?.messages ?? [],
  api,
  syncConfigs,
  syncContexts,
  changed,
  syncUI,
};

// ══ HTTP helper ═══════════════════════════════════════════
window.COAL = {
  headers() {
    return {
      "Content-Type": "application/json",
      "x-session-id": sessionId,
      "x-user": userName,
    };
  },
};

async function api(method, path, body) {
  const opts = { method, headers: window.COAL.headers() };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ══ Getters (stable refs for components) ═══════════════════

function getActiveConfig() { return state.configs[state.activeCfg]; }
function getActiveContext() { return state.contexts[state.activeCtx]; }
function getActiveMessages() { return getActiveContext()?.messages ?? []; }

// ══ User ══════════════════════════════════════════════════
function initUserUI() {
  const input = document.getElementById("user-name");
  input.value = userName;

  function switchUser(name) {
    if (!name || name === userName) return;
    userName = name;
    localStorage.setItem("coal-user", userName);
    api("POST", "/api/user/switch", { user: userName })
      .then(() => refreshAll())
      .catch(() => refreshAll());
  }

  input.addEventListener("change", () => switchUser(input.value.trim() || "default"));
  api("GET", "/api/user").catch(() => {});
}

// ══ Config ════════════════════════════════════════════════
function initConfigUI() {
  renderConfigCompact();
  document.getElementById("cfg-modal-btn").addEventListener("click", openConfigModal);
}

function renderConfigCompact() {
  const container = document.getElementById("topbar-config");
  const cfg = getActiveConfig();
  if (!cfg) { container.innerHTML = '<span style="font-size:12px;color:var(--c-text-dim)">No config</span>'; return; }

  container.innerHTML = `
    <select id="cfg-model-select" style="background:var(--c-surface);color:var(--c-text);border:1px solid var(--c-border);border-radius:4px;padding:2px 6px;font-size:13px;">
      <option value="deepseek-v4-flash" ${cfg.model==="deepseek-v4-flash"?"selected":""}>deepseek-v4-flash</option>
      <option value="deepseek-v4-pro" ${cfg.model==="deepseek-v4-pro"?"selected":""}>deepseek-v4-pro</option>
    </select>
    <label style="display:flex;align-items:center;gap:4px;font-size:12px;color:var(--c-accent);white-space:nowrap;cursor:pointer;">
      <input type="checkbox" ${cfg.autoExecute?"checked":""} id="cfg-auto-exec" style="accent-color:var(--c-accent);cursor:pointer;">
      Auto
    </label>
  `;

  container.querySelector("#cfg-model-select").addEventListener("change", (e) => {
    cfg.model = e.target.value;
    changed("configs");
  });

  container.querySelector("#cfg-auto-exec").addEventListener("change", (e) => {
    cfg.autoExecute = e.target.checked;
    changed("configs");
  });
}

function openConfigModal() {
  const overlay = document.getElementById("modal-overlay");
  const body = document.getElementById("modal-body");
  overlay.classList.add("visible");

  // 销毁之前的 Vue 应用
  let app = window.__cfgModalApp;
  if (app) { app.unmount(); window.__cfgModalApp = null; }

  const mountPt = document.createElement("div");
  mountPt.id = "cfg-modal-root";
  body.innerHTML = "";
  body.appendChild(mountPt);

  app = createApp({
    render() {
      const activeCfg = state.configs[state.activeCfg];
      return h("div", {
        style: "display:grid;grid-template-columns:220px 1fr;gap:12px;min-height:300px",
      }, [
        h(VueConfigList, {
          configs: state.configs,
          activeIndex: state.activeCfg,
          onSelect: (i) => { state.activeCfg = i; changed("configs"); },
          onAdd: (idx) => { state.activeCfg = idx; changed("configs"); },
          onDelete: () => {
            if (state.activeCfg >= state.configs.length) {
              state.activeCfg = state.configs.length - 1;
            }
            changed("configs");
          },
        }),
        h(VueConfigDetail, {
          config: activeCfg,
          canDelete: state.configs.length > 1,
          onSave: (data) => {
            // 创建新对象引用以触发 Vue 响应式更新
            state.configs[state.activeCfg] = { ...activeCfg, ...data };
            changed("configs");
          },
          onDelete: () => {
            if (state.configs.length <= 1) return;
            state.configs.splice(state.activeCfg, 1);
            if (state.activeCfg >= state.configs.length) {
              state.activeCfg = state.configs.length - 1;
            }
            changed("configs");
          },
        }),
      ]);
    },
  });

  app.mount("#cfg-modal-root");
  window.__cfgModalApp = app;

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeConfigModal();
  });
}

function closeConfigModal() {
  document.getElementById("modal-overlay").classList.remove("visible");
}

// ══ Context ═══════════════════════════════════════════════
function initContextUI() {
  initContextSwitcher();
  document.getElementById("ctx-modal-btn").addEventListener("click", openContextModal);
}

function initContextSwitcher() {
  const sel = document.getElementById("ctx-switcher");
  if (!sel) return;
  sel.innerHTML = "";
  state.contexts.forEach((c, i) => {
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = state.ui?.context?.[i]?.name ?? `Chat ${i + 1}`;
    if (i === state.activeCtx) opt.selected = true;
    sel.appendChild(opt);
  });
  // Replace listener to avoid accumulation
  const handler = (e) => {
    state.activeCtx = parseInt(e.target.value);
    refreshMessageList();
  };
  const oldHandler = sel._changeHandler;
  if (oldHandler) sel.removeEventListener("change", oldHandler);
  sel._changeHandler = handler;
  sel.addEventListener("change", handler);
}

function openContextModal() {
  const overlay = document.getElementById("modal-overlay");
  const body = document.getElementById("modal-body");
  overlay.classList.add("visible");

  // 销毁之前的 Vue 应用
  let app = window.__ctxModalApp;
  if (app) { app.unmount(); window.__ctxModalApp = null; }

  const mountPt = document.createElement("div");
  mountPt.id = "ctx-modal-root";
  mountPt.style.cssText = "display:grid;grid-template-columns:220px 1fr;gap:12px;min-height:300px";
  body.innerHTML = "";
  body.appendChild(mountPt);

  app = createApp({
    render() {
      const ctx = state.contexts[state.activeCtx];
      return h("div", {
        style: "display:grid;grid-template-columns:220px 1fr;gap:12px;min-height:300px",
      }, [
        h(VueContextList, {
          contexts: state.contexts,
          activeIndex: state.activeCtx,
          names: state.ui?.context,
          onAdd: (idx) => { state.activeCtx = idx; changed("contexts"); },
          onSelect: (i) => { state.activeCtx = i; changed("contexts"); },
          onDelete: (i) => {
            if (state.contexts.length <= 1) return;
            if (state.ui?.context) {
              delete state.ui.context[i];
              const reindexed = {};
              Object.entries(state.ui.context).forEach(([k, v]) => {
                const ki = parseInt(k, 10);
                reindexed[ki > i ? ki - 1 : ki] = v;
              });
              state.ui.context = reindexed;
            }
            if (state.activeCtx >= state.contexts.length) state.activeCtx = state.contexts.length - 1;
            changed("contexts");
            changed("ui");
          },
          onChange: (i, data) => {
            if (!state.ui.context) state.ui.context = {};
            if (!state.ui.context[i]) state.ui.context[i] = {};
            Object.assign(state.ui.context[i], data);
            changed("ui");
          },
        }),
        h("div", {
          style: "padding:20px;color:var(--c-text-dim);font-size:13px",
        }, [
          ctx ? `${ctx.messages?.length ?? 0} messages · ${ctx.tools?.length ?? 0} tools` : "",
        ]),
      ]);
    },
  });
  app.mount("#ctx-modal-root");
  window.__ctxModalApp = app;

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeContextModal();
  });
}

function closeContextModal() {
  document.getElementById("modal-overlay").classList.remove("visible");
}

// ══ Main MessageList ═════════════════════════════════════
function initMessageList() {
  const container = document.getElementById("chat-main");
  container.innerHTML = "";

  const mountPt = document.createElement("div");
  mountPt.id = "msg-list-root";
  mountPt.style.cssText = "display:flex;flex-direction:column;flex:1;min-height:0";
  container.appendChild(mountPt);

  const app = createApp(VueMessageList, {
    onSubmit: handleSend,
    onClear: handleClear,
    onEditMessage: (index, data) => {
      if (data === null) {
        // data === null → user clicked Edit → open modal
        const ctx = getActiveContext();
        if (!ctx || !ctx.messages[index]) return;
        openEditModal(ctx.messages[index], {
          onSave: (d) => {
            Object.assign(ctx.messages[index], d);
            changed("contexts");
          },
        });
        return;
      }
      const ctx = getActiveContext();
      if (!ctx) return;
      Object.assign(ctx.messages[index], data);
      changed("contexts");
    },
    onDeleteMessage: (index) => {
      const ctx = getActiveContext();
      if (!ctx) return;
      ctx.messages.splice(index, 1);
      changed("contexts");
    },
    onBranchMessage: handleMessageBranch,
  });
  window.__msgListApp = app;
  messageList = app.mount(mountPt);
}

async function handleSend(content) {
  const ctx = getActiveContext();
  if (content && ctx) {
    ctx.messages.push({ role: "user", content });
  }
  messageList.setLoading(true);
  messageList.setEnabled(false);

  try {
    if (content) {
      // SSE 流式发送：render 立即显示用户消息，SSE 逐 token 更新
      await sendWithSSE(ctx);
    } else if (ctx) {
      // 空输入（重新生成）：不添加新消息，通过 SSE 重新处理
      await sendWithSSE(ctx, true);
    }
  } catch (err) {
    messageList.addError(err.message || String(err));
  }

  messageList.setLoading(false);
  messageList.setEnabled(true);
}

/**
 * 通过 POST /api/contexts/process 发送消息并消费 SSE 流。
 * 不再使用 changed("contexts") 的同步 PUT 路径。
 */
async function sendWithSSE(ctx, regenerate = false) {
  // 渲染用户消息（立即显示）
  messageList.refresh();

  const res = await fetch("/api/contexts/process", {
    method: "POST",
    headers: window.COAL.headers(),
    body: JSON.stringify({
      contexts: state.contexts,
      activeCtx: state.activeCtx,
      regenerate,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  // 读取 SSE 事件流
  const reader = readSSE(res);
  let streamingContent = "";

  reader.on("token", (data) => {
    streamingContent += data.token;
    messageList.setStreamingText(streamingContent);
  });

  reader.on("status", () => {
    // 工具执行轮次信息——不用 addError 显示
  });

  // 完全流式：tool_call 到达时追加到最后一条 assistant 消息
  // 不提交 streaming 文本为独立消息——done 事件会替换为服务端权威版本
  reader.on("tool_call", (data) => {
    const curCtx = getActiveContext();
    if (!curCtx) return;

    const tc = { id: data.id, type: "function", function: { name: data.name, arguments: data.arguments } };
    // 找到最后一条 assistant 消息，追加 tool_calls
    for (let i = curCtx.messages.length - 1; i >= 0; i--) {
      const m = curCtx.messages[i];
      if (m.role === "assistant") {
        if (!m.tool_calls) m.tool_calls = [];
        m.tool_calls.push(tc);
        break;
      }
    }
  });

  // 完全流式：tool_result 到达时，直接追加 tool 消息
  reader.on("tool_result", (data) => {
    const curCtx = getActiveContext();
    if (!curCtx) return;

    curCtx.messages.push({
      role: "tool",
      content: data.result,
      tool_call_id: data.id,
    });
  });

  reader.on("error", (data) => {
    messageList.addError(data.message);
    messageList.setStreamingText(null);
  });

  reader.on("done", (data) => {
    if (data.contexts) {
      state.contexts = data.contexts;
      state.activeCtx = data.activeCtx ?? state.activeCtx;
    }
    messageList.setStreamingText(null);
    messageList.refresh();
    initContextSwitcher();
    refreshToolsBadge();
  });

  await reader.done;
}

async function handleClear() {
  try {
    await api("DELETE", "/api/context");
    const ctx = getActiveContext();
    if (ctx) ctx.messages = [];
    changed("contexts");
  } catch (err) {
    console.warn("Clear failed:", err);
  }
}

async function handleMessageBranch(index) {
  const ctx = getActiveContext();
  if (!ctx) return;
  const newCtx = {
    ...ctx,
    messages: ctx.messages.slice(0, index + 1),
  };
  state.contexts.push(newCtx);
  state.activeCtx = state.contexts.length - 1;
  // Set default name in ui.context
  const idx = state.contexts.length - 1;
  if (!state.ui.context) state.ui.context = {};
  state.ui.context[idx] = { name: `Chat ${idx + 1}` };
  changed("contexts");
  changed("ui");
}

function refreshMessageList() {
  messageList?.refresh();
  initContextSwitcher();
  refreshToolsBadge();
}

// ══ Panel modals ══════════════════════════════════════════

function openPanelModal(contentEl) {
  const overlay = document.getElementById("modal-overlay");
  const body = document.getElementById("modal-body");
  body.innerHTML = "";
  body.appendChild(contentEl);
  overlay.classList.add("visible");

  const close = (e) => {
    if (e.target === overlay) {
      overlay.classList.remove("visible");
      overlay.removeEventListener("click", close);
    }
  };
  overlay.addEventListener("click", close);
}

function openCtxBuilderModal() {
  const ctx = getActiveContext();
  if (!ctx) return;

  // 销毁之前的 Vue 应用
  if (window.__ctxBuilderApp) { window.__ctxBuilderApp.unmount(); window.__ctxBuilderApp = null; }

  const mountPt = document.createElement("div");
  mountPt.id = "ctx-builder-root";
  mountPt.style.cssText = "padding:8px;min-width:500px";

  const app = createApp(VueContextBuilder, {
    ctx,
    name: state.ui?.context?.[state.activeCtx]?.name,
    collapsed: state.ui?.collapsed?.[state.activeCtx] ?? [],
    onChange: (extra) => {
      if (extra?.name) {
        if (!state.ui.context) state.ui.context = {};
        state.ui.context[state.activeCtx] = { name: extra.name };
      }
      if (extra?.collapsed) {
        state.ui.collapsed[state.activeCtx] = extra.collapsed;
      }
      if (extra?.name || extra?.collapsed) changed("ui");
      changed("contexts");
    },
  });
  app.mount(mountPt);
  window.__ctxBuilderApp = app;

  openPanelModal(mountPt);
}

let execRunning = false;

async function handleExecClick() {
  if (execRunning) return;
  execRunning = true;
  const btn = document.getElementById("exec-btn");
  const origText = btn.textContent;
  btn.textContent = "⏳";
  btn.style.opacity = "0.6";
  try {
    await api("POST", "/api/context/execute");
    await refreshAll();
    btn.textContent = "✓";
    setTimeout(() => { btn.textContent = origText; btn.style.opacity = "1"; execRunning = false; }, 1200);
  } catch (err) {
    btn.textContent = "✗";
    setTimeout(() => { btn.textContent = origText; btn.style.opacity = "1"; execRunning = false; }, 1200);
  }
}

function openLogsModal() {
  const panel = LogsPanel({
    fetchLogs: () => api("GET", "/api/logs"),
    deleteLogs: () => api("DELETE", "/api/logs"),
    fetchSnapshot: () => api("GET", "/api/debug"),
  });
  openPanelModal(panel.el);
}

function initPanelButtons() {
  document.getElementById("ctx-builder-btn").addEventListener("click", openCtxBuilderModal);
  document.getElementById("exec-btn").addEventListener("click", handleExecClick);
  document.getElementById("logs-btn").addEventListener("click", openLogsModal);
}

// ══ Tools badge ═════════════════════════════════════════
function initToolsBadge() {
  refreshToolsBadge();
}

function refreshToolsBadge() {
  const badge = document.getElementById("tools-badge");
  const ctx = getActiveContext();
  const count = ctx?.tools?.length ?? 0;
  badge.textContent = `🔧${count}`;
  badge.style.cursor = count > 0 ? "pointer" : "default";
}

function openToolsModal() {
  const overlay = document.getElementById("modal-overlay");
  const body = document.getElementById("modal-body");
  overlay.classList.add("visible");

  let app = window.__toolsModalApp;
  if (app) { app.unmount(); window.__toolsModalApp = null; }

  const mountPt = document.createElement("div");
  mountPt.id = "tools-modal-root";
  body.innerHTML = "";
  body.appendChild(mountPt);

  const ctx = getActiveContext();
  const tools = ctx?.tools ?? [];
  const toolDetail = tools[0];

  app = createApp({
    data() { return { toolIdx: 0 }; },
    render() {
      const idx = this.toolIdx;
      const t = tools[idx];
      return h("div", {
        style: "display:grid;grid-template-columns:220px 1fr;gap:12px;min-height:300px",
      }, [
        h(VueToolList, {
          tools,
          activeIndex: idx,
          onSelect: (i) => { this.toolIdx = i; },
          onAdd: (i) => { this.toolIdx = i; changed("contexts"); },
          onDelete: () => {
            if (this.toolIdx >= tools.length) this.toolIdx = tools.length - 1;
            changed("contexts");
          },
        }),
        t ? h(VueToolDetail, {
          tool: t, builtin: true,
          onSave: (data) => { Object.assign(t, data); changed("contexts"); },
        }) : h("div", { style: "padding:20px;color:var(--c-text-dim)" }, "No tool selected"),
      ]);
    },
  });
  app.mount(mountPt);
  window.__toolsModalApp = app;

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeToolsModal();
  });
}

function closeToolsModal() {
  document.getElementById("modal-overlay").classList.remove("visible");
}

function syncTools() {
  const ctx = getActiveContext();
  const body = { tools: ctx?.tools || [] };
  api("PUT", "/api/context/tools", body).catch(console.warn);
  refreshToolsBadge();
}

// ══ Sync ═════════════════════════════════════════════════
async function syncConfigs() {
  try {
    await api("PUT", "/api/configs", {
      configs: state.configs,
      activeCfg: state.activeCfg,
    });
  } catch (err) { console.warn("syncConfigs:", err); }
}

async function syncContexts(extra = {}) {
  let data;
  try {
    data = await api("PUT", "/api/contexts", {
      contexts: state.contexts,
      activeCtx: state.activeCtx,
      ...extra,
    });
  } catch (err) {
    messageList?.addError(String(err));
    return;
  }

  // Server may have modified contexts (AI response, auto-exec tools)
  if (data?.contexts) {
    state.contexts = data.contexts;
    state.activeCtx = data.activeCtx ?? state.activeCtx;
  }
  // Surface server-side warnings (e.g. API failure)
  if (data?.warning) {
    messageList?.addError(data.warning);
  }
  // Always re-render after sync
  messageList?.refresh();
  initContextSwitcher();
  refreshToolsBadge();
}

async function syncUI() {
  try { await api("PUT", "/api/ui", state.ui); } catch {}
}

function initChangedRegistry() {
  changed.register("configs", {
    render: [renderConfigCompact],
    sync: [syncConfigs],
  });
  changed.register("contexts", {
    render: [
      () => messageList?.refresh(),
      initContextSwitcher,
      refreshToolsBadge,
    ],
    sync: [syncContexts],
  });
  changed.register("ui", {
    render: [initContextSwitcher],
    sync: [syncUI],
  });

  // Vue watcher: _sync 版本号变更 → 自动调用注册的 sync 函数
  watch(() => state._sync.configs, () => {
    for (const fn of _changedRegistry.configs?.sync ?? []) fn();
  });
  watch(() => state._sync.contexts, () => {
    for (const fn of _changedRegistry.contexts?.sync ?? []) fn();
  });
  watch(() => state._sync.ui, () => {
    for (const fn of _changedRegistry.ui?.sync ?? []) fn();
  });
}

// ══ Refresh ══════════════════════════════════════════════
async function refreshAll() {
  try {
    const [cfgRes, ctxRes, uiRes] = await Promise.all([
      api("GET", "/api/configs"),
      api("GET", "/api/contexts"),
      api("GET", "/api/ui").catch(() => ({ collapsed: {}, context: {} })),
    ]);

    state.configs = cfgRes.configs;
    state.activeCfg = cfgRes.activeCfg;
    state.contexts = ctxRes.contexts;
    state.activeCtx = ctxRes.activeCtx;
    state.ui = uiRes;

    renderConfigCompact();
    initContextSwitcher();
    refreshMessageList();
    refreshToolsBadge();
  } catch (err) {
    console.error("refreshAll failed:", err);
  }
}

// ══ Boot ═════════════════════════════════════════════════
async function boot() {
  initUserUI();
  initMessageList();
  initConfigUI();
  initContextUI();
  initToolsBadge();
  initPanelButtons();

  document.getElementById("tools-badge").addEventListener("click", openToolsModal);

  initChangedRegistry();
  await refreshAll();
}

document.addEventListener("DOMContentLoaded", boot);
