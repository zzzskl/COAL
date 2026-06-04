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

export function MessageDetail(msg) {
  const el = document.createElement("div");
  el.className = `msg-detail ${msg.role}`;
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
  `;
  return el;
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

export function MessageList(messages, { placeholder, onSubmit, onClear } = {}) {
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
  msgCountSpan.textContent = `${messages.length} messages`;
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
    // Remove loading and error indicators (non-message elements)
    const toRemove = scrollArea.querySelectorAll(".msg-list-error");
    for (const r of toRemove) r.remove();

    const existingMsgs = scrollArea.querySelectorAll(".msg-detail:not(#msg-loading)");
    for (const m of existingMsgs) m.remove();

    // Re-render all messages
    if (!messages || messages.length === 0) {
      const empty = document.createElement("div");
      empty.className = "msg-list-empty";
      empty.textContent = "No messages yet";
      scrollArea.appendChild(empty);
    } else {
      for (const m of messages) {
        scrollArea.appendChild(MessageDetail(m));
      }
    }
    scrollArea.scrollTop = scrollArea.scrollHeight;
    msgCountSpan.textContent = `${messages.length} messages`;
  }

  renderMessages();

  const textarea = inputRow.querySelector("textarea");
  const sendBtn = inputRow.querySelector(".send-btn");

  function doSubmit() {
    const content = textarea.value.trim();
    if (!content) return;
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
