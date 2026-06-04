// sb-logs.js — Sidebar Logs section

function esc(s) { const d = document.createElement("div"); d.textContent = String(s ?? ""); return d.innerHTML; }

export function initLogs() {
  const logsList = document.getElementById("logs-list");
  const logsClearBtn = document.getElementById("logs-clear-btn");
  const logsSnapBtn = document.getElementById("logs-snap-btn");
  const logsPauseBtn = document.getElementById("logs-pause-btn");
  if (!logsList || !logsClearBtn || !logsSnapBtn || !logsPauseBtn) return;

  async function refreshLogs() {
    try {
      const res = await fetch("/api/logs", { headers: window.COAL.headers() });
      const data = await res.json();
      logsList.innerHTML = "";
      for (const entry of data.entries.slice(-30).reverse()) {
        const div = document.createElement("div");
        div.className = `log-entry log-${entry.level}`;
        div.textContent = `${entry.time.slice(11, 19)} ${entry.level.toUpperCase()} ${entry.message}`;
        logsList.appendChild(div);
      }
    } catch {}
  }

  logsClearBtn.addEventListener("click", async () => {
    await fetch("/api/logs", { method: "DELETE", headers: window.COAL.headers() });
    refreshLogs();
  });

  // ── Snapshot ──

  function renderSnapshot(data, container) {
    const msgs = data.context?.messages || [];
    const tools = data.context?.tools || [];
    const cfg = data.config || {};
    const logs = data.recentLogs || [];

    const msgPreview = msgs.map((m, i) => {
      const extra = m.role === "assistant" && m.tool_calls?.length ? ` [${m.tool_calls.length} tool_call(s)]`
        : m.role === "tool" ? ` ← ${m.tool_call_id}` : "";
      return `<div class="snap-line"><span class="snap-idx">${i}</span> <b>${m.role}</b> ${esc((m.content || "").slice(0, 60))}${extra}</div>`;
    }).join("");

    const toolList = tools.length > 0
      ? tools.map(t => `<div class="snap-line">• <b>${esc(t.function.name)}</b> — ${esc(t.function.description || "(no description)")}</div>`).join("")
      : '<div class="snap-line">(none)</div>';

    const logLines = logs.slice(-30).reverse().map(e =>
      `<div class="snap-line snap-log-${e.level}"><span class="snap-idx">${e.time.slice(11, 19)}</span> ${e.level.toUpperCase()} ${esc(e.message)}</div>`
    ).join("");

    container.style.display = "block";
    container.innerHTML = `
      <div class="snap-toolbar">
        <span class="snap-title">Debug Snapshot — ${data.at?.slice(11, 19) || ""}</span>
        <span class="snap-session">session: ${esc(data.sessionId?.slice(0, 8) || "?")}...</span>
        <button class="snap-copy-btn" title="Copy JSON">Copy JSON</button>
        <button class="snap-close-btn">×</button>
      </div>
      <div class="snap-body">
        <div class="snap-section">
          <div class="snap-section-hdr" data-section="ctx">▼ Context (${msgs.length} messages, ${tools.length} tools)</div>
          <div class="snap-section-body" id="snap-section-ctx">
            <div class="snap-subtitle">Messages</div>
            ${msgPreview || '<div class="snap-line">(empty)</div>'}
            <div class="snap-subtitle" style="margin-top:8px">Tools</div>
            ${toolList}
          </div>
        </div>
        <div class="snap-section">
          <div class="snap-section-hdr" data-section="cfg">▼ Config</div>
          <div class="snap-section-body" id="snap-section-cfg" style="display:none">
            ${Object.entries(cfg).map(([k, v]) => `<div class="snap-line"><b>${k}:</b> ${JSON.stringify(v)}</div>`).join("")}
          </div>
        </div>
        <div class="snap-section">
          <div class="snap-section-hdr" data-section="logs">▼ Recent Logs (${logs.length})</div>
          <div class="snap-section-body" id="snap-section-logs" style="display:none">
            ${logLines || '<div class="snap-line">(empty)</div>'}
          </div>
        </div>
      </div>`;

    container.querySelectorAll(".snap-section-hdr").forEach(hdr => {
      hdr.addEventListener("click", () => {
        const body = container.querySelector(`#snap-section-${hdr.dataset.section}`);
        if (body) {
          body.style.display = body.style.display === "none" ? "" : "none";
          hdr.textContent = hdr.textContent.replace(/^[▼▶]/, body.style.display === "none" ? "▶" : "▼");
        }
      });
    });

    container.querySelector(".snap-copy-btn").addEventListener("click", () => {
      navigator.clipboard.writeText(JSON.stringify(data, null, 2)).then(() => {
        container.querySelector(".snap-copy-btn").textContent = "Copied!";
        setTimeout(() => { container.querySelector(".snap-copy-btn").textContent = "Copy JSON"; }, 1500);
      });
    });

    container.querySelector(".snap-close-btn").addEventListener("click", () => { container.innerHTML = ""; container.style.display = "none"; });
  }

  async function takeSnapshot() {
    const container = document.getElementById("snapshot-container");
    if (!container) return;
    container.style.display = "block";
    container.innerHTML = '<div class="snap-line" style="padding:12px">Loading snapshot...</div>';

    try {
      const res = await fetch("/api/debug", { headers: window.COAL.headers() });
      if (!res.ok) { container.innerHTML = `<div class="snap-line exec-err" style="padding:12px">Server returned ${res.status}. Try restarting the server.</div>`; return; }
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("text/html")) { container.innerHTML = `<div class="snap-line exec-err" style="padding:12px">Server returned HTML instead of JSON — the endpoint may not be registered. Try restarting the server.</div>`; return; }
      renderSnapshot(await res.json(), container);
    } catch (err) {
      container.innerHTML = `<div class="snap-line exec-err" style="padding:12px">Failed: ${esc(err.message)}</div>`;
    }
  }

  logsSnapBtn.addEventListener("click", takeSnapshot);

  // Create snapshot container
  const snapContainer = document.createElement("div");
  snapContainer.id = "snapshot-container";
  snapContainer.style.display = "none";
  logsList.parentNode.appendChild(snapContainer);

  // Auto-refresh
  let intervalId = setInterval(refreshLogs, 3000);
  let paused = false;

  logsPauseBtn.addEventListener("click", () => {
    paused = !paused;
    if (paused) {
      clearInterval(intervalId);
      intervalId = null;
      logsPauseBtn.textContent = "▶";
      logsPauseBtn.classList.add("paused");
      logsPauseBtn.title = "Resume auto-refresh";
    } else {
      intervalId = setInterval(refreshLogs, 3000);
      logsPauseBtn.textContent = "⏸";
      logsPauseBtn.classList.remove("paused");
      logsPauseBtn.title = "Pause auto-refresh";
    }
  });
}
