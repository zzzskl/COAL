const $ = (sel) => document.querySelector(sel);

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

function formatContent(text) {
  return escapeHtml(text)
    .replace(/```(\w*)\n([\s\S]*?)```/g, "<pre><code>$2</code></pre>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br>");
}

export function initChat(refreshAll, getConfig) {
  const input = $("#input");
  const sendBtn = $("#send-btn");
  const clearBtn = $("#clear-btn");

  sendBtn.addEventListener("click", sendMessage);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  clearBtn.addEventListener("click", async () => {
    await fetch("/api/context", {
      method: "DELETE",
      headers: window.COAL.headers(),
    });
    await refreshAll();
  });

  // Auto-grow textarea (max 6 rows)
  const MAX_ROWS = 6;
  input.addEventListener("input", () => {
    input.style.height = "auto";
    const lineHeight = parseInt(getComputedStyle(input).lineHeight) || 20;
    const maxHeight = lineHeight * MAX_ROWS;
    const newHeight = Math.min(input.scrollHeight, maxHeight);
    input.style.height = newHeight + "px";
    input.style.overflowY = input.scrollHeight > maxHeight ? "auto" : "hidden";
  });

  async function sendMessage() {
    const content = input.value.trim() || undefined;

    input.value = "";
    input.style.height = "auto";
    input.style.overflowY = "hidden";
    input.disabled = true;
    sendBtn.disabled = true;

    const container = $("#messages");
    const loading = document.createElement("div");
    loading.className = "msg msg-assistant";
    loading.id = "msg-loading";
    loading.innerHTML = `<span class="role">assistant</span><div class="content"><div class="loading-bounce"><span></span><span></span><span></span></div></div>`;
    container.appendChild(loading);
    container.scrollTop = container.scrollHeight;

    try {
      const cfg = getConfig();
      const body = {
        message: content,
        model: cfg.model,
        temperature: cfg.temperature,
        maxTokens: cfg.maxTokens,
        topP: cfg.topP,
        thinking: cfg.thinking,
        stop: cfg.stop,
      };

      await fetch("/api/chat", {
        method: "POST",
        headers: window.COAL.headers(),
        body: JSON.stringify(body),
      });

      await refreshAll();
    } catch (err) {
      const el = $("#msg-loading");
      if (el) el.remove();
      const div = document.createElement("div");
      div.className = "msg msg-assistant";
      div.innerHTML = `<span class="role">error</span><div class="content">Network error: ${err.message}</div>`;
      container.appendChild(div);
    }

    input.disabled = false;
    sendBtn.disabled = false;
    input.focus();
  }

  return {
    renderMessages(messages) {
      const container = $("#messages");
      container.innerHTML = "";
      for (const m of messages) {
        const div = document.createElement("div");
        div.className = `msg msg-${m.role}`;
        let contentHtml = formatContent(m.content ?? "");
        if (m.tool_calls?.length) {
          contentHtml +=
            '<div class="tool-calls-badge">' +
            m.tool_calls
              .map(
                (tc) =>
                  `<span class="tc-fn">${escapeHtml(tc.function.name)}</span>`
              )
              .join(" ") +
            "</div>";
        }
        if (m.role === "tool") {
          contentHtml =
            `<span class="tc-id">${escapeHtml(m.tool_call_id)}</span>` +
            contentHtml;
        }
        div.innerHTML = `<span class="role">${m.role}</span><div class="content">${contentHtml}</div>`;
        container.appendChild(div);
      }
      $("#msg-count").textContent = `${messages.length} messages`;
      container.scrollTop = container.scrollHeight;
    },
  };
}
