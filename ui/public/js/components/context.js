// Context components: Compact / Detail / List

import { MessageList } from "./message.js";

function esc(s) { const d = document.createElement("div"); d.textContent = String(s ?? ""); return d.innerHTML; }

// ── ContextCompact ──────────────────────────────────────────

export function ContextCompact(ctx, { active, onDelete } = {}) {
  const el = document.createElement("div");
  el.className = "ctx-compact" + (active ? " active" : "");
  const msgCount = ctx.messages?.length ?? 0;
  const toolCount = ctx.tools?.length ?? 0;

  el.innerHTML = `
    <span class="ctx-compact-name">${esc(ctx.name ?? "Unnamed")}</span>
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

export function ContextDetail(ctx, { onNameChange, onToolClick, onMessageSubmit } = {}) {
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
    <input class="ctx-detail-name" value="${esc(ctx.name ?? "Unnamed")}" placeholder="Conversation name">
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
    onSubmit: onMessageSubmit
      ? (content) => {
          msgs.push({ role: "user", content });
          // Simulate assistant reply
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

export function ContextList(contexts, activeIndex, { onSelect, onAdd, onDelete } = {}) {
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
        onDelete: onDelete ? () => { contexts.splice(i, 1); render(); onDelete(i); } : undefined,
      });
      compact.addEventListener("select", () => {
        if (onSelect) onSelect(i);
        render();
      });
      items.appendChild(compact);
    });
    if (onAdd) el.querySelector(".add-btn").addEventListener("click", () => {
      contexts.push({
        name: "Chat " + (contexts.length + 1),
        messages: [],
        tools: [],
      });
      onAdd(contexts.length - 1);
      render();
    });
  }
}
