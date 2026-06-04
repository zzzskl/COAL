// Context components: Compact / Detail / List

import { MessageList } from "./message.js";

function esc(s) { const d = document.createElement("div"); d.textContent = String(s ?? ""); return d.innerHTML; }

// ── ContextCompact ──────────────────────────────────────────

export function ContextCompact(ctx, { active, onDelete, name } = {}) {
  const el = document.createElement("div");
  el.className = "ctx-compact" + (active ? " active" : "");
  const msgCount = ctx.messages?.length ?? 0;
  const toolCount = ctx.tools?.length ?? 0;

  el.innerHTML = `
    <span class="ctx-compact-name">${esc(name ?? "Unnamed")}</span>
    <span class="ctx-compact-meta">
      <span>${msgCount} msg${msgCount !== 1 ? "s" : ""}</span>
      <span>${toolCount} tool${toolCount !== 1 ? "s" : ""}</span>
    </span>
  `;
  if (onDelete) {
    const del = document.createElement("button");
    del.className = "ctx-compact-del"; del.textContent = "×";
    del.addEventListener("click", (e) => { e.stopPropagation(); onDelete(); });
    el.appendChild(del);
  }
  el.addEventListener("click", () => el.dispatchEvent(new CustomEvent("select")));
  return el;
}

// ── ContextDetail ───────────────────────────────────────────

export function ContextDetail(ctx, {
  onNameChange, onToolClick, onMessageSubmit,
  collapsedIndices,
  onMessageEdit, onMessageDelete, onMessageBranch,
  name,
} = {}) {
  const el = document.createElement("div");
  el.className = "ctx-detail";
  el.style.flex = "1";
  el.style.display = "flex";
  el.style.flexDirection = "column";
  el.style.overflow = "hidden";

  const msgs = ctx.messages ?? [];
  const toolCount = ctx.tools?.length ?? 0;

  // Header
  const header = document.createElement("div");
  header.className = "ctx-detail-header";
  header.innerHTML = `
    <input class="ctx-detail-name" value="${esc(name ?? "Unnamed")}" placeholder="Conversation name">
    ${toolCount > 0 ? `<span class="ctx-detail-tool-badge">${toolCount} tool${toolCount !== 1 ? "s" : ""}</span>` : ""}
  `;
  const nameInput = header.querySelector(".ctx-detail-name");
  nameInput.addEventListener("change", () => {
    if (onNameChange) onNameChange(nameInput.value.trim() || "Unnamed");
  });
  const toolBadge = header.querySelector(".ctx-detail-tool-badge");
  toolBadge?.addEventListener("click", () => { if (onToolClick) onToolClick(); });

  // Message list (the main content)
  const msgList = MessageList(msgs, {
    placeholder: "Type a message... (demo)",
    collapsedIndices,
    onEditMessage,
    onDeleteMessage,
    onBranchMessage,
    onSubmit: onMessageSubmit
      ? (content) => {
          msgs.push({ role: "user", content });
          if (onMessageSubmit) onMessageSubmit(content);
        }
      : undefined,
  });

  el.appendChild(header);
  el.appendChild(msgList.el);

  return {
    el,
    refreshMessages: msgList.refresh,
  };
}

// ── ContextList ─────────────────────────────────────────────

export function ContextList(contexts, activeIndex, { onSelect, onAdd, onDelete, names } = {}) {
  const el = document.createElement("div");
  el.className = "ctx-list";
  render();
  return el;

  function render() {
    el.innerHTML = `
      <div class="ctx-list-header">
        <span>Conversations (${contexts.length})</span>
        ${onAdd ? '<button class="cmp-btn add-btn">+ New</button>' : ''}
      </div>
      <div class="ctx-list-items"></div>
    `;
    const items = el.querySelector(".ctx-list-items");
    contexts.forEach((c, i) => {
      const compact = ContextCompact(c, {
        active: i === activeIndex,
        name: names?.[i] ?? `Chat ${i + 1}`,
        onDelete: onDelete ? () => { contexts.splice(i, 1); render(); onDelete(i); } : undefined,
      });
      compact.addEventListener("select", () => {
        if (onSelect) onSelect(i);
        render();
      });
      items.appendChild(compact);
    });
    if (onAdd) el.querySelector(".add-btn").addEventListener("click", () => {
      contexts.push({ messages: [], tools: [] });
      if (onAdd) onAdd(contexts.length - 1);
      render();
    });
  }
}

// ── ContextBuilder ──────────────────────────────────────────

export function ContextBuilder(ctx, { collapsed = [], onChange, onBranch, name } = {}) {
  const el = document.createElement("div");
  el.className = "ctx-builder";

  // Fetch built-in tools once at creation
  let builtinTools = [];
  fetch("/api/tools").then(r => r.json()).then(d => { builtinTools = d.builtin ?? []; render(); }).catch(() => {});

  render();

  function render() {
    const msgs = ctx.messages ?? [];
    const tools = ctx.tools ?? [];

    const toolsHtml = tools.length > 0
      ? tools.map((t, i) => `
        <div class="ctx-item" data-tool-idx="${i}">
          <span class="ctxb-tool-name">${esc(t.function?.name ?? "?")}</span>
          <button class="ctxb-tool-remove" title="Remove tool">×</button>
        </div>`).join("")
      : '<div class="ctxb-tools-empty">No tools</div>';

    const availHtml = builtinTools
      .filter(bt => !tools.some(t => t.function?.name === bt.function?.name))
      .map(bt => `
        <div class="ctxb-avail-item">
          <span class="ctxb-avail-name">${esc(bt.function?.name ?? "?")}</span>
          <button class="cmp-btn ctxb-avail-add">+Add</button>
        </div>`).join("");

    el.innerHTML = `
      <div class="ctxb-name">
        <input class="ctxb-name-input" value="${esc(name ?? "Unnamed")}" placeholder="Conversation name">
      </div>

      <div class="ctxb-section-label">Messages (${msgs.length})</div>
      <div class="ctx-builder-msgs">
        ${msgs.map((m, i) => renderMsgItem(m, i)).join("")}
      </div>
      <div class="ctx-builder-add">
        <select class="ctxb-add-role">
          <option value="system">system</option>
          <option value="user" selected>user</option>
          <option value="assistant">assistant</option>
          <option value="tool">tool</option>
        </select>
        <input type="text" class="ctxb-add-tcid" placeholder="tool_call_id (tool)" style="display:none">
        <textarea class="ctxb-add-tcs" placeholder='tool_calls JSON (assistant)' rows="2" style="display:none"></textarea>
        <textarea class="ctxb-add-content" rows="2" placeholder="Message content..."></textarea>
        <button class="cmp-btn primary ctxb-add-btn">Add Message</button>
      </div>

      <div class="ctxb-section-label" style="margin-top:8px">Tools (${tools.length})</div>
      <div class="ctxb-tools-list">
        ${toolsHtml}
      </div>

      <div class="ctxb-section-label" style="margin-top:6px;font-size:11px;color:var(--c-text-dim)">Available</div>
      <div class="ctxb-avail-list">
        ${availHtml}
        <div class="ctxb-avail-item">
          <span class="ctxb-avail-name" style="color:var(--c-accent)">+ Custom Tool</span>
          <button class="cmp-btn ctxb-avail-custom">+Add</button>
        </div>
      </div>
    `;

    wireEvents();
  }

  function renderMsgItem(m, i) {
    const extra = m.tool_calls?.length ? ` +${m.tool_calls.length} tc` : m.role === "tool" && m.tool_call_id ? " ←" : "";
    const isFold = collapsed.includes(i);
    return `
      <div class="ctx-item" data-idx="${i}">
        <span class="ctx-role ctx-role-${m.role}">${esc(m.role)}</span>
        <span class="ctx-preview">${esc((m.content ?? "").slice(0, 40))}${(m.content ?? "").length > 40 ? "…" : ""}<span class="ctx-extra">${esc(extra)}</span></span>
        <button class="ctx-edit-btn" title="Edit">✎</button>
        <button class="ctx-fold-btn" title="${isFold ? "Expand" : "Collapse"}">${isFold ? "▸" : "▾"}</button>
        <button class="ctx-del-btn" title="Delete">×</button>
      </div>
    `;
  }

  function wireEvents() {
    // ── Name field ──
    const nameInput = el.querySelector(".ctxb-name-input");
    nameInput?.addEventListener("change", () => {
      if (onChange) onChange({ name: nameInput.value.trim() || "Unnamed" });
    });

    // ── Delegate: message actions ──
    const msgsEl = el.querySelector(".ctx-builder-msgs");
    msgsEl.addEventListener("click", (e) => {
      const item = e.target.closest(".ctx-item");
      if (!item) return;
      const idx = parseInt(item.dataset.idx, 10);

      if (e.target.classList.contains("ctx-edit-btn")) {
        enterEditMode(item, idx);
      } else if (e.target.classList.contains("ctx-fold-btn")) {
        toggleFold(idx);
      } else if (e.target.classList.contains("ctx-del-btn")) {
        if (!confirm("Delete this message?")) return;
        ctx.messages.splice(idx, 1);
        const newCollapsed = collapsed.map(c => c > idx ? c - 1 : c).filter(c => c !== idx);
        collapsed = newCollapsed;
        render();
        if (onChange) onChange({ collapsed: newCollapsed });
      }
    });

    // ── Add form: role toggle ──
    const roleSel = el.querySelector(".ctxb-add-role");
    roleSel?.addEventListener("change", () => {
      const r = roleSel.value;
      const tcid = el.querySelector(".ctxb-add-tcid");
      const tcs = el.querySelector(".ctxb-add-tcs");
      if (tcid) tcid.style.display = r === "tool" ? "" : "none";
      if (tcs) tcs.style.display = r === "assistant" ? "" : "none";
    });

    // ── Add form: submit ──
    el.querySelector(".ctxb-add-btn")?.addEventListener("click", () => {
      const role = roleSel.value;
      const content = el.querySelector(".ctxb-add-content")?.value?.trim();
      if (!content && role !== "assistant") return;

      const body = { role, content: content || null };
      if (role === "tool") {
        const tcid = el.querySelector(".ctxb-add-tcid")?.value?.trim();
        if (!tcid) return;
        body.tool_call_id = tcid;
      }
      if (role === "assistant") {
        const tcRaw = el.querySelector(".ctxb-add-tcs")?.value?.trim();
        if (tcRaw) { try { body.tool_calls = JSON.parse(tcRaw); } catch { return; } }
      }

      ctx.messages.push(body);
      const inputs = el.querySelectorAll(".ctxb-add-content, .ctxb-add-tcid, .ctxb-add-tcs");
      inputs.forEach(i => { if (i) i.value = ""; });
      render();
      if (onChange) onChange({});
    });

    // ── Tool: remove ──
    el.querySelectorAll(".ctxb-tool-remove").forEach(btn => {
      btn.addEventListener("click", () => {
        const item = btn.closest("[data-tool-idx]");
        if (!item) return;
        const idx = parseInt(item.dataset.toolIdx, 10);
        ctx.tools = (ctx.tools ?? []).filter((_, i) => i !== idx);
        render();
        if (onChange) onChange({});
      });
    });

    // ── Tool: add built-in ──
    el.querySelectorAll(".ctxb-avail-add").forEach(btn => {
      btn.addEventListener("click", () => {
        const item = btn.closest(".ctxb-avail-item");
        if (!item) return;
        const name = item.querySelector(".ctxb-avail-name")?.textContent?.trim();
        const src = builtinTools.find(t => t.function?.name === name);
        if (!src) return;
        ctx.tools = [...(ctx.tools ?? []), JSON.parse(JSON.stringify(src))];
        render();
        if (onChange) onChange({});
      });
    });

    // ── Tool: add custom ──
    el.querySelector(".ctxb-avail-custom")?.addEventListener("click", () => {
      ctx.tools = [...(ctx.tools ?? []), {
        type: "function",
        function: { name: "my_function", description: "", parameters: { type: "object", properties: {}, required: [] } },
      }];
      render();
      if (onChange) onChange({});
    });
  }

  // ── Inline edit mode ──
  function enterEditMode(item, idx) {
    const m = ctx.messages[idx];
    const isTool = m.role === "tool";
    const isAsst = m.role === "assistant";
    const toolCallId = m.tool_call_id ?? "";
    const tcJson = m.tool_calls?.length ? JSON.stringify(m.tool_calls, null, 2) : "";

    item.innerHTML = `
      <div class="ctx-edit-form">
        <select class="ctx-edit-role">
          <option value="system" ${m.role==="system"?"selected":""}>system</option>
          <option value="user" ${m.role==="user"?"selected":""}>user</option>
          <option value="assistant" ${m.role==="assistant"?"selected":""}>assistant</option>
          <option value="tool" ${m.role==="tool"?"selected":""}>tool</option>
        </select>
        <input type="text" class="ctx-edit-tool-call-id" placeholder="tool_call_id" value="${esc(toolCallId)}" style="display:${isTool?"":"none"}">
        <textarea class="ctx-edit-tool-calls" placeholder="tool_calls JSON" rows="4" style="display:${isAsst?"":"none"}">${esc(tcJson)}</textarea>
        <textarea class="ctx-edit-content" rows="3">${esc(m.content ?? "")}</textarea>
        <div class="ctx-edit-actions">
          <button class="cmp-btn primary ctx-edit-save">Save</button>
          <button class="cmp-btn ctx-edit-cancel">Cancel</button>
        </div>
      </div>`;

    item.querySelector(".ctx-edit-role")?.addEventListener("change", (e) => {
      const r = e.target.value;
      const tcid = item.querySelector(".ctx-edit-tool-call-id");
      const tcs = item.querySelector(".ctx-edit-tool-calls");
      if (tcid) tcid.style.display = r === "tool" ? "" : "none";
      if (tcs) tcs.style.display = r === "assistant" ? "" : "none";
    });

    item.querySelector(".ctx-edit-save")?.addEventListener("click", () => {
      const role = item.querySelector(".ctx-edit-role")?.value;
      const content = item.querySelector(".ctx-edit-content")?.value?.trim();
      const tcid = item.querySelector(".ctx-edit-tool-call-id")?.value?.trim() ?? "";
      const tcRaw = item.querySelector(".ctx-edit-tool-calls")?.value?.trim() ?? "";
      const data = { role, content: content || null };
      if (role === "tool" && tcid) data.tool_call_id = tcid;
      if (role === "assistant" && tcRaw) { try { data.tool_calls = JSON.parse(tcRaw); } catch {} }
      ctx.messages[idx] = { ...ctx.messages[idx], ...data };
      render();
      if (onChange) onChange({});
    });

    item.querySelector(".ctx-edit-cancel")?.addEventListener("click", () => render());
  }

  function toggleFold(idx) {
    const pos = collapsed.indexOf(idx);
    if (pos >= 0) collapsed.splice(pos, 1);
    else collapsed.push(idx);
    collapsed.sort((a, b) => a - b);
    render();
    if (onChange) onChange({ collapsed: [...collapsed] });
  }

  return el;
}
