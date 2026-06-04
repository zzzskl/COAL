// Message components: Compact / Detail / List

function esc(s) { const d = document.createElement("div"); d.textContent = String(s ?? ""); return d.innerHTML; }

function formatContent(text) {
  return esc(text)
    .replace(/```(\w*)\n([\s\S]*?)```/g, "<pre><code>$2</code></pre>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br>");
}

// ── MessageCompact ──────────────────────────────────────────

export function MessageCompact(msg) {
  const el = document.createElement("div");
  el.className = "msg-compact";
  const content = String(msg.content ?? "").replace(/\n/g, " ");
  el.innerHTML = `
    <span class="msg-compact-role ${msg.role}">${esc(msg.role)}</span>
    <span class="msg-compact-content">${esc(content.slice(0, 80))}${content.length > 80 ? "…" : ""}</span>
  `;
  return el;
}

// ── MessageDetail ───────────────────────────────────────────

export function MessageDetail(msg, { index, collapsed, onEdit, onDelete, onBranch } = {}) {
  const el = document.createElement("div");
  el.className = `msg-detail ${msg.role}${collapsed ? " collapsed" : ""}`;
  const hasActions = onEdit || onDelete || onBranch;

  if (collapsed) {
    // ── Collapsed mode ──
    const preview = String(msg.content ?? "").replace(/\n/g, " ").slice(0, 80);
    el.innerHTML = `
      <span class="msg-detail-role">${esc(msg.role)}</span>
      <span class="msg-detail-collapsed-preview">${esc(preview)}${preview.length > 80 ? "…" : ""}</span>
      ${hasActions ? actionButtonsHtml() : ""}
    `;
    wireActions(el, { index, onEdit, onDelete, onBranch });
    return el;
  }

  // ── Normal (expanded) mode ──
  let contentHtml = formatContent(msg.content ?? "");

  if (msg.tool_calls?.length) {
    contentHtml += '<div class="msg-detail-toolcalls">';
    for (const tc of msg.tool_calls) {
      contentHtml += `<span class="tc-badge">${esc(tc.function.name)}</span>`;
    }
    contentHtml += '</div>';
  }

  if (msg.role === "tool") {
    contentHtml = `<span class="msg-detail-toolid">${esc(msg.tool_call_id ?? "")}</span>` + contentHtml;
  }

  el.innerHTML = `
    <span class="msg-detail-role">${esc(msg.role)}</span>
    <div class="msg-detail-content">${contentHtml}</div>
    ${hasActions ? actionButtonsHtml() : ""}
  `;
  wireActions(el, { index, onEdit, onDelete, onBranch });
  return el;

  // ── Helper: action buttons HTML ──
  function actionButtonsHtml() {
    let html = '<div class="msg-detail-actions">';
    if (onEdit) html += '<button class="msg-detail-action-btn edit" title="Edit">✎</button>';
    if (onDelete) html += '<button class="msg-detail-action-btn delete" title="Delete">×</button>';
    if (onBranch) html += '<button class="msg-detail-action-btn branch" title="Branch">↯</button>';
    html += '</div>';
    return html;
  }

  // ── Helper: wire action buttons ──
  function wireActions(el, { index, onEdit, onDelete, onBranch }) {
    const editBtn = el.querySelector(".msg-detail-action-btn.edit");
    editBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      const data = msg;
      enterEditMode(el, msg, index, onEdit);
    });

    el.querySelector(".msg-detail-action-btn.delete")?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (confirm("Delete this message?")) onDelete(index);
    });

    el.querySelector(".msg-detail-action-btn.branch")?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (onBranch) onBranch(index);
    });
  }
}

// ── Inline edit mode ───────────────────────────────────────

function enterEditMode(el, msg, index, onEdit) {
  const isTool = msg.role === "tool";
  const isAsst = msg.role === "assistant";
  const toolCallId = msg.tool_call_id ?? "";
  const tcJson = msg.tool_calls?.length ? JSON.stringify(msg.tool_calls, null, 2) : "";

  el.innerHTML = `
    <div class="msg-detail-edit-form">
      <select class="medit-role">
        <option value="system" ${msg.role==="system"?"selected":""}>system</option>
        <option value="user" ${msg.role==="user"?"selected":""}>user</option>
        <option value="assistant" ${msg.role==="assistant"?"selected":""}>assistant</option>
        <option value="tool" ${msg.role==="tool"?"selected":""}>tool</option>
      </select>
      <input type="text" class="medit-tool-call-id" placeholder="tool_call_id" value="${esc(toolCallId)}" style="display:${isTool?"":"none"}">
      <textarea class="medit-tool-calls" placeholder="tool_calls JSON" rows="4" style="display:${isAsst?"":"none"}">${esc(tcJson)}</textarea>
      <textarea class="medit-content" rows="4">${esc(msg.content ?? "")}</textarea>
      <div class="medit-actions">
        <button class="cmp-btn primary medit-save">Save</button>
        <button class="cmp-btn medit-cancel">Cancel</button>
      </div>
    </div>`;

  // Role change → toggle conditional fields
  el.querySelector(".medit-role").addEventListener("change", (e) => {
    const r = e.target.value;
    el.querySelector(".medit-tool-call-id").style.display = r === "tool" ? "" : "none";
    el.querySelector(".medit-tool-calls").style.display = r === "assistant" ? "" : "none";
  });

  el.querySelector(".medit-save").addEventListener("click", () => {
    const role = el.querySelector(".medit-role").value;
    const content = el.querySelector(".medit-content").value.trim();
    const tcid = el.querySelector(".medit-tool-call-id")?.value.trim() ?? "";
    const tcRaw = el.querySelector(".medit-tool-calls")?.value.trim() ?? "";
    const data = { role, content: content || null };
    if (role === "tool" && tcid) data.tool_call_id = tcid;
    if (role === "assistant" && tcRaw) { try { data.tool_calls = JSON.parse(tcRaw); } catch {} }
    onEdit(index, data);
  });

  el.querySelector(".medit-cancel").addEventListener("click", () => {
    // Re-render by calling onEdit without changes — caller refreshes
    onEdit(index, null);
  });
}

// ── Loading indicator ────────────────────────────────────────

function makeLoadingEl() {
  const el = document.createElement("div");
  el.className = "msg-detail assistant";
  el.id = "msg-loading";
  el.style.display = "none";
  el.innerHTML = `
    <span class="msg-detail-role">assistant</span>
    <div class="msg-detail-content">
      <div class="loading-bounce"><span></span><span></span><span></span></div>
    </div>
  `;
  return el;
}

function makeErrorEl(msg) {
  const el = document.createElement("div");
  el.className = "msg-detail assistant";
  el.innerHTML = `
    <span class="msg-detail-role" style="color:var(--c-danger)">error</span>
    <div class="msg-detail-content" style="color:var(--c-danger)">${esc(msg)}</div>
  `;
  return el;
}

// ── MessageList ─────────────────────────────────────────────

export function MessageList(getMessages, { placeholder, onSubmit, onClear, collapsedIndices: getCollapsed, onEditMessage, onDeleteMessage, onBranchMessage } = {}) {
  const el = document.createElement("div");
  el.className = "msg-list-root";
  el.style.display = "flex";
  el.style.flexDirection = "column";
  el.style.flex = "1";
  el.style.overflow = "hidden";

  // Top bar (controls row)
  const ctrlRow = document.createElement("div");
  ctrlRow.className = "msg-list-ctrl";
  ctrlRow.style.display = "flex";
  ctrlRow.style.alignItems = "center";
  ctrlRow.style.justifyContent = "space-between";
  ctrlRow.style.padding = "6px 16px";
  ctrlRow.style.borderBottom = "1px solid var(--c-border)";
  const msgCountSpan = document.createElement("span");
  msgCountSpan.className = "msg-list-count";
  msgCountSpan.style.fontSize = "12px";
  msgCountSpan.style.color = "var(--c-text-dim)";
  const initialMsgs = typeof getMessages === "function" ? getMessages() : getMessages;
  msgCountSpan.textContent = `${initialMsgs.length} messages`;
  ctrlRow.appendChild(msgCountSpan);

  if (onClear) {
    const clearBtn = document.createElement("button");
    clearBtn.className = "cmp-btn msg-list-clear";
    clearBtn.textContent = "Clear";
    clearBtn.addEventListener("click", () => { if (confirm("Clear all messages?")) onClear(); });
    ctrlRow.appendChild(clearBtn);
  }
  if (onSubmit) el.appendChild(ctrlRow);

  const scrollArea = document.createElement("div");
  scrollArea.className = "msg-list";

  // Loading indicator (hidden by default)
  const loadingEl = makeLoadingEl();
  scrollArea.appendChild(loadingEl);

  const inputRow = document.createElement("div");
  inputRow.className = "msg-list-input-row";
  inputRow.innerHTML = `
    <textarea rows="2" placeholder="${esc(placeholder ?? 'Type a message...')}"></textarea>
    <button class="cmp-btn primary send-btn">Send</button>
  `;

  el.appendChild(scrollArea);
  if (onSubmit) el.appendChild(inputRow);

  function renderMessages() {
    const msgs = typeof getMessages === "function" ? getMessages() : getMessages;
    const collapsedIndices = typeof getCollapsed === "function" ? getCollapsed() : (getCollapsed ?? []);

    // Remove non-message elements (error, empty placeholder)
    const toRemove = scrollArea.querySelectorAll(".msg-list-error, .msg-list-empty");
    for (const r of toRemove) r.remove();

    const existingMsgs = scrollArea.querySelectorAll(".msg-detail:not(#msg-loading)");
    for (const m of existingMsgs) m.remove();

    // Re-render all messages
    if (!msgs || msgs.length === 0) {
      const empty = document.createElement("div");
      empty.className = "msg-list-empty";
      empty.textContent = "No messages yet";
      scrollArea.appendChild(empty);
    } else {
      for (const [i, m] of msgs.entries()) {
        const collapsed = collapsedIndices ? collapsedIndices.includes(i) : false;
        scrollArea.appendChild(MessageDetail(m, {
          index: i, collapsed,
          onEdit: onEditMessage,
          onDelete: onDeleteMessage,
          onBranch: onBranchMessage,
        }));
      }
    }
    scrollArea.scrollTop = scrollArea.scrollHeight;
    msgCountSpan.textContent = `${msgs.length} messages`;
  }

  renderMessages();

  const textarea = inputRow.querySelector("textarea");
  const sendBtn = inputRow.querySelector(".send-btn");

  function doSubmit() {
    const content = textarea.value.trim();
    textarea.value = "";
    textarea.style.height = "auto";
    onSubmit(content);
  }

  sendBtn?.addEventListener("click", doSubmit);
  textarea?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); doSubmit(); }
  });

  // Auto-grow
  textarea?.addEventListener("input", () => {
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + "px";
  });

  // ── API ───────────────────────────────────────────────────
  function setLoading(on) {
    loadingEl.style.display = on ? "" : "none";
  }

  function addError(errMsg) {
    setLoading(false);
    const errorEl = makeErrorEl(errMsg);
    errorEl.className += " msg-list-error";
    scrollArea.appendChild(errorEl);
    scrollArea.scrollTop = scrollArea.scrollHeight;
  }

  function setEnabled(on) {
    if (textarea) textarea.disabled = !on;
    if (sendBtn) sendBtn.disabled = !on;
  }

  return { el, refresh: renderMessages, setLoading, addError, setEnabled };
}
