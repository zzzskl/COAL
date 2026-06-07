// main.js — COAL app bootstrap and integration layer
import { reactive, watch, createApp, h } from "vue";
import { ConfigDetail, ConfigList } from "./components/config/config.js";
import { ContextCompact, ContextDetail, ContextList } from "./components/context/context.js";
import { ToolCompact, ToolDetail, ToolList } from "./components/tool/tool.js";
import { ContextBuilderPanel } from "./components/context/ctx-panel.js";
import { LogsPanel } from "./components/logger/logs-panel.js";
import { ToolsPanel } from "./components/tool/tools-panel.js";
import { readSSE } from "./sse.js";
import { VueConfigList, VueConfigDetail } from "./components/config/config.vue.js";
import { VueMessageList, openEditModal } from "./components/message/message.vue.js";
import { VueContextList, VueContextBuilder } from "./components/context/context.vue.js";
import { VueToolList, VueToolDetail } from "./components/tool/tool.vue.js";

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
  /** 冻结标记：某个数据域正在被服务端处理，禁止前端修改 */
  _freeze: { contexts: false },
});

// UI refs
let messageList = null;
let _processing = false;  // 防重入锁：SSE 处理期间禁止重复发送
let booted = false;       // 启动标志：加载完成前 watcher 不触发 sync

window.__COAL_APP__ = {
  state,
  getActiveConfig: () => state.configs[state.activeCfg],
  getActiveContext: () => state.contexts[state.activeCtx],
  getActiveMessages: () => state.contexts[state.activeCtx]?.messages ?? [],
  api,
  syncConfigs,
  syncContexts,
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

// ══ Getters ═══════════════════════════════════════════════
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
    syncConfigs();
  });

  container.querySelector("#cfg-auto-exec").addEventListener("change", (e) => {
    cfg.autoExecute = e.target.checked;
    syncConfigs();
  });
}

function openConfigModal() {
  const overlay = document.getElementById("modal-overlay");
  const body = document.getElementById("modal-body");
  overlay.classList.add("visible");

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
          onSelect: (i) => { state.activeCfg = i; syncConfigs(); },
          onAdd: (idx) => { state.activeCfg = idx; syncConfigs(); },
          onDelete: () => {
            if (state.activeCfg >= state.configs.length) {
              state.activeCfg = state.configs.length - 1;
            }
            syncConfigs();
          },
        }),
        h(VueConfigDetail, {
          config: activeCfg,
          canDelete: state.configs.length > 1,
          onSave: (data) => {
            state.configs[state.activeCfg] = { ...activeCfg, ...data };
            syncConfigs();
          },
          onDelete: () => {
            if (state.configs.length <= 1) return;
            state.configs.splice(state.activeCfg, 1);
            if (state.activeCfg >= state.configs.length) {
              state.activeCfg = state.configs.length - 1;
            }
            syncConfigs();
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
          onAdd: (idx) => { state.activeCtx = idx; syncContexts(); },
          onSelect: (i) => { state.activeCtx = i; syncContexts(); },
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
            syncContexts();
            syncUI();
          },
          onChange: (i, data) => {
            if (!state.ui.context) state.ui.context = {};
            if (!state.ui.context[i]) state.ui.context[i] = {};
            Object.assign(state.ui.context[i], data);
            syncUI();
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
      // 冻结期间禁止编辑
      if (state._freeze.contexts) return;
      if (data === null) {
        const ctx = getActiveContext();
        if (!ctx || !ctx.messages[index]) return;
        openEditModal(ctx.messages[index], {
          onSave: (d) => {
            Object.assign(ctx.messages[index], d);
            syncContexts();
          },
        });
        return;
      }
      const ctx = getActiveContext();
      if (!ctx) return;
      Object.assign(ctx.messages[index], data);
      syncContexts();
    },
    onDeleteMessage: (index) => {
      if (state._freeze.contexts) return;
      const ctx = getActiveContext();
      if (!ctx) return;
      ctx.messages.splice(index, 1);
      syncContexts();
    },
    onBranchMessage: handleMessageBranch,
  });
  window.__msgListApp = app;
  messageList = app.mount(mountPt);
}

async function handleSend(content) {
  if (_processing) return;
  const ctx = getActiveContext();
  if (content && ctx) {
    ctx.messages.push({ role: "user", content });
  }

  _processing = true;
  state._freeze.contexts = true;
  messageList.setLoading(true);
  messageList.setEnabled(false);

  try {
    await (content ? sendWithSSE(false) : sendWithSSE(true));
  } catch (err) {
    messageList.addError(err.message || String(err));
  } finally {
    state._freeze.contexts = false;
    _processing = false;
    messageList.setLoading(false);
    messageList.setEnabled(true);
  }
}

/**
 * 通过 POST /api/contexts/process 发送消息并消费 SSE 流。
 */
async function sendWithSSE(regenerate = false) {
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

  const reader = readSSE(res);
  let streamingContent = "";

  reader.on("token", (data) => {
    streamingContent += data.token;
    messageList.setStreamingText(streamingContent);
  });

  reader.on("status", () => {});

  reader.on("tool_call", (data) => {
    const curCtx = getActiveContext();
    if (!curCtx) return;
    const tc = { id: data.id, type: "function", function: { name: data.name, arguments: data.arguments } };
    for (let i = curCtx.messages.length - 1; i >= 0; i--) {
      const m = curCtx.messages[i];
      if (m.role === "assistant") {
        if (!m.tool_calls) m.tool_calls = [];
        m.tool_calls.push(tc);
        break;
      }
    }
  });

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
  if (state._freeze.contexts) return;
  try {
    await api("DELETE", "/api/context");
    const ctx = getActiveContext();
    if (ctx) {
      ctx.messages = [];
      ctx.tools = null;
      ctx.toolChoice = null;
    }
    syncContexts();
  } catch (err) {
    console.warn("Clear failed:", err);
  }
}

async function handleMessageBranch(index) {
  if (state._freeze.contexts) return;
  const ctx = getActiveContext();
  if (!ctx) return;
  const newCtx = {
    ...ctx,
    messages: ctx.messages.slice(0, index + 1),
  };
  state.contexts.push(newCtx);
  state.activeCtx = state.contexts.length - 1;
  const idx = state.contexts.length - 1;
  if (!state.ui.context) state.ui.context = {};
  state.ui.context[idx] = { name: `Chat ${idx + 1}` };
  syncContexts();
  syncUI();
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
      if (extra?.branch !== undefined) {
        handleMessageBranch(extra.branch);
        return;
      }
      if (extra?.name || extra?.collapsed) syncUI();
      syncContexts();
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
          onAdd: (i) => { this.toolIdx = i; syncContexts(); },
          onDelete: () => {
            if (this.toolIdx >= tools.length) this.toolIdx = tools.length - 1;
            syncContexts();
          },
        }),
        t ? h(VueToolDetail, {
          tool: t, builtin: false,
          onSave: (data) => { Object.assign(t, data); syncContexts(); },
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

  if (data?.contexts) {
    state.contexts = data.contexts;
    state.activeCtx = data.activeCtx ?? state.activeCtx;
  }
  if (data?.warning) {
    messageList?.addError(data.warning);
  }
  messageList?.refresh();
  initContextSwitcher();
  refreshToolsBadge();
}

async function syncUI() {
  try { await api("PUT", "/api/ui", state.ui); } catch {}
}

// ══ 状态形状观察（替换 _changedRegistry + changed()）═══════

function initStateWatchers() {
  // ── Configs：数据变化时渲染 + 同步 ───────────────
  watch(
    () => state.configs.map(c => `${c.model}|${c.temperature}|${c.maxTokens}|${c.autoExecute}`),
    () => { renderConfigCompact(); if (booted) syncConfigs(); }
  );

  // ── UI 偏好变化时渲染 + 同步 ─────────────────────
  watch(
    () => state.ui,
    () => { if (booted) { initContextSwitcher(); syncUI(); } },
    { deep: true }
  );

  // ── Contexts 变化：渲染 ──────────────────────────
  // 监听 context 数组长度 + 消息数 + 工具数
  watch(
    () => state.contexts.map((c, i) => `${c.messages?.length ?? 0}:${c.tools?.length ?? 0}:${i === state.activeCtx}`),
    () => {
      if (!booted) return;
      messageList?.refresh();
      initContextSwitcher();
      refreshToolsBadge();
    }
  );

  // ── 状态形状观察：检测"最后一条是 user 消息"→ 自动触发 SSE ──
  watch(
    () => {
      if (state._freeze.contexts || _processing) return null;
      const ctx = state.contexts[state.activeCtx];
      return ctx?.messages?.slice(-1)[0]?.role ?? null;
    },
    (lastRole) => {
      if (lastRole === "user" && booted) {
        handleSend("");  // 空字符串触发 SSE 处理（不追加新消息）
      }
    }
  );
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

  // 先初始化 watcher，再首次加载数据
  initStateWatchers();
  await refreshAll();
  booted = true;
}

document.addEventListener("DOMContentLoaded", boot);
