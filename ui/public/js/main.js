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

// Client-side preset arrays
const configs = [];
let activeCfg = 0;

const contexts = [];
let activeCtx = 0;

// UI refs
let messageList = null;
let sidebarOpen = false;

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

// ══ User ══════════════════════════════════════════════════
function initUserUI() {
  const input = document.getElementById("user-name");
  input.value = userName;

  // Debounced user switch: save on blur/enter
  function switchUser(name) {
    if (!name || name === userName) return;
    userName = name;
    localStorage.setItem("coal-user", userName);
    api("POST", "/api/user/switch", { user: userName })
      .then(() => refreshAll())
      .catch(() => refreshAll()); // even if no user system, just refresh
  }

  input.addEventListener("change", () => switchUser(input.value.trim() || "default"));

  // User list from /api/user (just shows current)
  api("GET", "/api/user").catch(() => {}); // best-effort
}

// ══ Config ════════════════════════════════════════════════
function initConfigUI() {
  const container = document.getElementById("topbar-config");
  renderConfigCompact();
  document.getElementById("cfg-modal-btn").addEventListener("click", openConfigModal);
}

function renderConfigCompact() {
  const container = document.getElementById("topbar-config");
  const cfg = configs[activeCfg];
  if (!cfg) { container.innerHTML = '<span style="font-size:12px;color:var(--c-text-dim)">No config</span>'; return; }

  // Simple inline compact
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
    api("PUT", "/api/config", cfg).catch(console.warn);
  });

  container.querySelector("#cfg-auto-exec").addEventListener("change", (e) => {
    cfg.autoExecute = e.target.checked;
    api("PUT", "/api/config", cfg).catch(console.warn);
  });
}

function openConfigModal() {
  const overlay = document.getElementById("modal-overlay");
  const body = document.getElementById("modal-body");
  overlay.classList.add("visible");

  body.innerHTML = '<div style="padding:20px;text-align:center;color:var(--c-text-dim)">Loading...</div>';

  // Render ConfigList + ConfigDetail side by side
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

  const list = ConfigList(configs, activeCfg, {
    onSelect: (i) => { activeCfg = i; syncActiveConfig(); openConfigModal(); },
    onAdd: () => { activeCfg = configs.length - 1; syncActiveConfig(); openConfigModal(); },
    onDelete: () => { if (configs.length <= 1) return; if (activeCfg >= configs.length) activeCfg = configs.length - 1; syncActiveConfig(); openConfigModal(); },
  });
  left.appendChild(list);

  const cfg = configs[activeCfg];
  if (cfg) {
    const detail = ConfigDetail(cfg, {
      onSave: (data) => {
        Object.assign(cfg, data);
        api("PUT", "/api/config", cfg).catch(console.warn);
        renderConfigCompact();
        openConfigModal(); // re-render modal
      },
      onDelete: () => {
        if (configs.length <= 1) return;
        configs.splice(activeCfg, 1);
        if (activeCfg >= configs.length) activeCfg = configs.length - 1;
        syncActiveConfig();
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
  body.querySelector(".cfg-detail-actions")?.addEventListener("click", (e) => {
    // Save/Delete buttons inside modal should not close it — they re-render it
    e.stopPropagation();
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
  contexts.forEach((c, i) => {
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = c.name || `Chat ${i + 1}`;
    if (i === activeCtx) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.addEventListener("change", (e) => {
    activeCtx = parseInt(e.target.value);
    refreshMessageList();
  });
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

  const list = ContextList(contexts, activeCtx, {
    onSelect: (i) => { activeCtx = i; initContextSwitcher(); openContextModal(); },
    onAdd: () => { activeCtx = contexts.length - 1; initContextSwitcher(); refreshMessageList(); openContextModal(); },
    onDelete: () => { if (contexts.length <= 1) return; if (activeCtx >= contexts.length) activeCtx = contexts.length - 1; initContextSwitcher(); refreshMessageList(); openContextModal(); },
  });
  left.appendChild(list);

  const ctx = contexts[activeCtx];
  if (ctx) {
    // Show a simple summary in the modal right side (no full message list here)
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

  messageList = MessageList(getActiveMessages(), {
    placeholder: "Type a message and press Enter...",
    onSubmit: handleSend,
    onClear: handleClear,
  });
  container.appendChild(messageList.el);
}

function getActiveCtx() { return contexts[activeCtx] || { messages: [], tools: [] }; }
function getActiveMessages() { return getActiveCtx().messages || []; }

async function handleSend(content) {
  messageList.setLoading(true);
  messageList.setEnabled(false);

  try {
    const ctx = getActiveCtx();
    const cfg = configs[activeCfg] || {};

    const body = {
      message: content,
      model: cfg.model,
      temperature: cfg.temperature,
      maxTokens: cfg.maxTokens,
      topP: cfg.topP,
      thinking: cfg.thinking ?? "disabled",
      autoExecute: cfg.autoExecute ?? false,
    };

    const result = await api("POST", "/api/chat", body);
    // Reload from server
    await refreshAll();

    // If auto-executed, show count
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
    const ctx = contexts[activeCtx];
    if (ctx) ctx.messages = [];
    messageList.refresh();
  } catch (err) {
    console.warn("Clear failed:", err);
  }
}

function refreshMessageList() {
  messageList?.refresh();
  initContextSwitcher();
}

// ══ Sidebar ══════════════════════════════════════════════
function initSidebar() {
  document.getElementById("sidebar-toggle").addEventListener("click", toggleSidebar);
  document.getElementById("sidebar-overlay").addEventListener("click", closeSidebar);

  // Mount the Sidebar component as first child of .app-body
  const appBody = document.querySelector(".app-body");
  if (appBody) {
    appBody.insertBefore(Sidebar(refreshAll), appBody.firstChild);
  }
}

function toggleSidebar() {
  sidebarOpen = !sidebarOpen;
  document.body.classList.toggle("sidebar-open", sidebarOpen);
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
  const ctx = getActiveCtx();
  const count = ctx.tools?.length ?? 0;
  badge.textContent = `🔧${count}`;
  badge.style.cursor = count > 0 ? "pointer" : "default";
}

function openToolsModal() {
  const overlay = document.getElementById("modal-overlay");
  const body = document.getElementById("modal-body");
  overlay.classList.add("visible");
  body.innerHTML = '<div style="padding:20px;text-align:center;color:var(--c-text-dim)">Loading...</div>';

  const ctx = getActiveCtx();
  if (!ctx.tools) ctx.tools = [];
  const tools = ctx.tools;

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
        builtin: true, // treat as builtin in demo — no delete
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
  const ctx = getActiveCtx();
  api("PUT", "/api/context/tools", { tools: ctx.tools || [] }).catch(console.warn);
  refreshToolsBadge();
}

// ══ Refresh ══════════════════════════════════════════════
async function refreshAll() {
  try {
    // Load current context (messages + tools)
    const ctxData = await api("GET", "/api/context");

    // Ensure we have at least one context
    if (contexts.length === 0) {
      contexts.push({ name: "Chat 1", messages: ctxData.messages || [], tools: ctxData.tools || [] });
    } else {
      const ctx = contexts[activeCtx];
      if (ctx) {
        ctx.messages = ctxData.messages || [];
        ctx.tools = ctxData.tools || [];
      }
    }

    // Load current config
    try {
      const cfgData = await api("GET", "/api/config");
      if (configs.length === 0) {
        configs.push({
          name: "Default",
          model: cfgData.model || "deepseek-v4-flash",
          temperature: cfgData.temperature ?? 0.7,
          maxTokens: cfgData.maxTokens ?? 4096,
          topP: cfgData.topP ?? 1,
          thinking: cfgData.thinking ?? "disabled",
          stop: cfgData.stop ?? [],
          autoExecute: cfgData.autoExecute ?? false,
        });
      } else {
        const cfg = configs[activeCfg];
        if (cfg) Object.assign(cfg, cfgData);
      }
    } catch {
      if (configs.length === 0) {
        configs.push({ name: "Default", model: "deepseek-v4-flash", temperature: 0.7, maxTokens: 4096, topP: 1, thinking: "disabled", autoExecute: false });
      }
    }

    // Refresh all UI
    renderConfigCompact();
    initContextSwitcher();
    refreshMessageList();
    refreshToolsBadge();
  } catch (err) {
    console.error("refreshAll failed:", err);
  }
}

// Sync active config to server
function syncActiveConfig() {
  const cfg = configs[activeCfg];
  if (cfg) {
    api("PUT", "/api/config", cfg).catch(console.warn);
    renderConfigCompact();
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

  // Wire tools badge click
  document.getElementById("tools-badge").addEventListener("click", openToolsModal);

  // Load initial data
  await refreshAll();
}

document.addEventListener("DOMContentLoaded", boot);
