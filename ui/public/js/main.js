// main.js — COAL app bootstrap and integration layer
import { ConfigDetail, ConfigList } from "./components/config.js";
import { ContextCompact, ContextDetail, ContextList } from "./components/context.js";
import { MessageDetail, MessageList } from "./components/message.js";
import { ToolCompact, ToolDetail, ToolList } from "./components/tool.js";
import { Sidebar } from "./components/sidebar.js";

// ══ State ══════════════════════════════════════════════════
let userName = localStorage.getItem("coal-user") || "default";
let sessionId = localStorage.getItem("coal-session") || crypto.randomUUID();
localStorage.setItem("coal-session", sessionId);

const state = {
  configs: [],
  activeCfg: 0,
  contexts: [],
  activeCtx: 0,
  meta: { context: {} },
  ui: { collapsed: {}, context: {} },
};

// UI refs
let messageList = null;
let sidebarOpen = false;

// Expose app state to sidebar modules (sb-context.js etc.)
window.__COAL_APP__ = {
  state,
  getActiveConfig: () => state.configs[state.activeCfg],
  getActiveContext: () => state.contexts[state.activeCtx],
  getActiveMessages: () => state.contexts[state.activeCtx]?.messages ?? [],
  api,
  syncConfigs,
  syncContexts,
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

  body.innerHTML = '<div style="padding:20px;text-align:center;color:var(--c-text-dim)">Loading...</div>';

  const wrapper = document.createElement("div");
  wrapper.style.display = "grid";
  wrapper.style.gridTemplateColumns = "220px 1fr";
  wrapper.style.gap = "12px";
  wrapper.style.minHeight = "300px";

  const left = document.createElement("div");
  left.style.overflowY = "auto";
  const right = document.createElement("div");
  right.style.overflowY = "auto";
  right.style.padding = "0 4px";

  const list = ConfigList(state.configs, state.activeCfg, {
    onSelect: (i) => { state.activeCfg = i; syncConfigs(); openConfigModal(); },
    onAdd: () => { state.activeCfg = state.configs.length - 1; syncConfigs(); openConfigModal(); },
    onDelete: () => { if (state.configs.length <= 1) return; if (state.activeCfg >= state.configs.length) state.activeCfg = state.configs.length - 1; syncConfigs(); openConfigModal(); },
  });
  left.appendChild(list);

  const cfg = getActiveConfig();
  if (cfg) {
    const detail = ConfigDetail(cfg, {
      onSave: (data) => {
        Object.assign(cfg, data);
        syncConfigs();
        renderConfigCompact();
        openConfigModal();
      },
      onDelete: () => {
        if (state.configs.length <= 1) return;
        state.configs.splice(state.activeCfg, 1);
        if (state.activeCfg >= state.configs.length) state.activeCfg = state.configs.length - 1;
        syncConfigs();
        openConfigModal();
      },
    });
    right.appendChild(detail);
  } else {
    right.innerHTML = '<div style="padding:20px;color:var(--c-text-dim)">Select a config</div>';
  }

  body.innerHTML = "";
  body.appendChild(wrapper);
  wrapper.appendChild(left);
  wrapper.appendChild(right);

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
  body.innerHTML = '<div style="padding:20px;text-align:center;color:var(--c-text-dim)">Loading...</div>';

  const wrapper = document.createElement("div");
  wrapper.style.display = "grid";
  wrapper.style.gridTemplateColumns = "220px 1fr";
  wrapper.style.gap = "12px";
  wrapper.style.minHeight = "300px";

  const left = document.createElement("div");
  left.style.overflowY = "auto";
  const right = document.createElement("div");
  right.style.overflowY = "auto";
  right.style.display = "flex";
  right.style.flexDirection = "column";

  const list = ContextList(state.contexts, state.activeCtx, {
    onSelect: (i) => { state.activeCtx = i; syncContexts(); initContextSwitcher(); openContextModal(); },
    onAdd: () => { state.activeCtx = state.contexts.length - 1; syncContexts(); initContextSwitcher(); refreshMessageList(); openContextModal(); },
    onDelete: () => { if (state.contexts.length <= 1) return; if (state.activeCtx >= state.contexts.length) state.activeCtx = state.contexts.length - 1; syncContexts(); initContextSwitcher(); refreshMessageList(); openContextModal(); },
  });
  left.appendChild(list);

  const ctx = getActiveContext();
  if (ctx) {
    const summary = document.createElement("div");
    summary.style.cssText = "padding:20px;color:var(--c-text-dim);font-size:13px";
    summary.textContent = `${ctx.messages?.length ?? 0} messages · ${ctx.tools?.length ?? 0} tools`;
    right.appendChild(summary);
  }

  body.innerHTML = "";
  body.appendChild(wrapper);
  wrapper.appendChild(left);
  wrapper.appendChild(right);

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

  // Pass getter function instead of array — avoids stale reference bug
  messageList = MessageList(getActiveMessages, {
    placeholder: "Type a message and press Enter...",
    onSubmit: handleSend,
    onClear: handleClear,
    collapsedIndices: () => state.ui.collapsed?.[state.activeCtx] ?? [],
    onEditMessage: (index, data) => {
      if (data === null) { refreshMessageList(); return; } // cancel
      const ctx = getActiveContext();
      if (!ctx) return;
      Object.assign(ctx.messages[index], data);
      syncContexts();
    },
    onDeleteMessage: (index) => {
      const ctx = getActiveContext();
      if (!ctx) return;
      ctx.messages.splice(index, 1);
      syncContexts();
    },
    onBranchMessage: handleMessageBranch,
  });
  container.appendChild(messageList.el);
}

async function handleSend(content) {
  messageList.setLoading(true);
  messageList.setEnabled(false);

  try {
    const cfg = getActiveConfig() || {};

    const body = {
      message: content,
      model: cfg.model,
      temperature: cfg.temperature,
      maxTokens: cfg.maxTokens,
      topP: cfg.topP,
      thinking: cfg.thinking ?? "disabled",
      autoExecute: cfg.autoExecute ?? false,
    };
    // Empty message → ask() without new user message (regenerate/continue)
    if (!content) delete body.message;

    const result = await api("POST", "/api/chat", body);
    await refreshAll();

    if (result.autoExecuted) {
      console.log(`Auto-executed ${result.autoExecuted} tool(s)`);
    }
  } catch (err) {
    messageList.addError(err.message || String(err));
  }

  messageList.setLoading(false);
  messageList.setEnabled(true);
}

async function handleClear() {
  try {
    await api("DELETE", "/api/context");
    const ctx = getActiveContext();
    if (ctx) ctx.messages = [];
    messageList.refresh();
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
  await syncContexts();
  refreshAll();
}

function refreshMessageList() {
  messageList?.refresh();
  initContextSwitcher();
  window.__COAL_APP__?.refreshSidebar?.();
}

// ══ Sidebar ══════════════════════════════════════════════
let sidebarEl = null;

function initSidebar() {
  document.getElementById("sidebar-toggle").addEventListener("click", () => openSidebar("context"));
  document.getElementById("ctx-builder-btn").addEventListener("click", () => openSidebar("context"));
  document.getElementById("exec-btn").addEventListener("click", () => openSidebar("executor"));
  document.getElementById("logs-btn").addEventListener("click", () => openSidebar("logs"));
  document.getElementById("sidebar-overlay").addEventListener("click", closeSidebar);

  const appBody = document.querySelector(".app-body");
  if (appBody) {
    sidebarEl = Sidebar(refreshAll);
    appBody.insertBefore(sidebarEl, appBody.firstChild);
  }
}

function openSidebar(section) {
  sidebarOpen = true;
  document.body.classList.add("sidebar-open");
  if (sidebarEl && sidebarEl.activateSection) {
    sidebarEl.activateSection(section);
  }
}

function closeSidebar() {
  sidebarOpen = false;
  document.body.classList.remove("sidebar-open");
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
  body.innerHTML = '<div style="padding:20px;text-align:center;color:var(--c-text-dim)">Loading...</div>';

  const ctx = getActiveContext();
  const tools = ctx?.tools ?? [];

  const wrapper = document.createElement("div");
  wrapper.style.display = "grid";
  wrapper.style.gridTemplateColumns = "220px 1fr";
  wrapper.style.gap = "12px";
  wrapper.style.minHeight = "300px";

  const left = document.createElement("div");
  left.style.overflowY = "auto";
  const right = document.createElement("div");
  right.style.overflowY = "auto";

  let toolIdx = 0;
  const render = () => {
    left.innerHTML = "";
    right.innerHTML = "";
    const list = ToolList(tools, toolIdx, {
      onSelect: (i) => { toolIdx = i; render(); },
      onAdd: () => { toolIdx = tools.length - 1; syncTools(); render(); },
      onDelete: () => { if (tools.length <= 1) return; if (toolIdx >= tools.length) toolIdx = tools.length - 1; syncTools(); render(); },
    });
    left.appendChild(list);

    const t = tools[toolIdx];
    if (t) {
      const detail = ToolDetail(t, {
        builtin: true,
        onSave: (data) => { Object.assign(t, data); syncTools(); refreshToolsBadge(); },
      });
      right.appendChild(detail);
    }
  };
  render();
  wrapper.appendChild(left);
  wrapper.appendChild(right);
  body.innerHTML = "";
  body.appendChild(wrapper);

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
  await api("PUT", "/api/configs", {
    configs: state.configs,
    activeCfg: state.activeCfg,
  }).catch(console.warn);
  renderConfigCompact();
}

async function syncContexts() {
  await api("PUT", "/api/contexts", {
    contexts: state.contexts,
    activeCtx: state.activeCtx,
  }).catch(console.warn);
  initContextSwitcher();
}

// ══ Refresh ══════════════════════════════════════════════
async function refreshAll() {
  try {
    const [cfgRes, ctxRes, uiRes] = await Promise.all([
      api("GET", "/api/configs"),
      api("GET", "/api/contexts"),
      api("GET", "/api/ui").catch(() => ({ collapsed: {} })),
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
    window.__COAL_APP__?.refreshSidebar?.();
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
  initSidebar();

  document.getElementById("tools-badge").addEventListener("click", openToolsModal);

  await refreshAll();
}

document.addEventListener("DOMContentLoaded", boot);
