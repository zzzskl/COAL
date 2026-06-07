// logs-panel.js — Standalone Logs panel

function esc(s) { const d = document.createElement("div"); d.textContent = String(s ?? ""); return d.innerHTML; }

export function LogsPanel(opts = {}) {
  const { fetchLogs, deleteLogs, fetchSnapshot } = opts;
  const el = document.createElement("div");
  el.className = "logs-panel";

  // ── Toolbar ───────────────────────────────────────────────
  const toolbar = document.createElement("div");
  toolbar.className = "logs-toolbar";

  const snapBtn = document.createElement("button");
  snapBtn.className = "cmp-btn";
  snapBtn.textContent = "Snapshot";

  const pauseBtn = document.createElement("button");
  pauseBtn.className = "cmp-btn";
  pauseBtn.textContent = "⏸";
  pauseBtn.title = "Pause auto-refresh";

  const clearBtn = document.createElement("button");
  clearBtn.className = "cmp-btn danger";
  clearBtn.textContent = "Clear";

  toolbar.appendChild(snapBtn);
  toolbar.appendChild(pauseBtn);
  toolbar.appendChild(clearBtn);
  el.appendChild(toolbar);

  // ── Logs list ─────────────────────────────────────────────
  const logsList = document.createElement("div");
  logsList.className = "logs-list";
  el.appendChild(logsList);

  // ── Snapshot container ────────────────────────────────────
  const snapContainer = document.createElement("div");
  snapContainer.id = "snapshot-container";
  snapContainer.style.display = "none";
  el.appendChild(snapContainer);

  // ── Auto-refresh ──────────────────────────────────────────
  let intervalId = setInterval(loadLogs, 3000);
  let paused = false;

  async function loadLogs() {
    if (!fetchLogs) return;
    try {
      const data = await fetchLogs();
      logsList.innerHTML = "";

      const all = (data.entries || []).slice(-60);
      const chatLogs = all.filter(e => e.tag === "chat");
      const sysLogs = all.filter(e => e.tag !== "chat");

      if (chatLogs.length > 0) {
        const hdr = document.createElement("div");
        hdr.className = "log-section-hdr";
        hdr.textContent = `Chat Activity (${chatLogs.length})`;
        logsList.appendChild(hdr);

        for (const entry of chatLogs.slice(-20).reverse()) {
          const div = document.createElement("div");
          div.className = "log-entry log-interaction";
          div.textContent = `${entry.time.slice(11, 19)} ${entry.message}`;
          logsList.appendChild(div);
        }
      }

      const sysHdr = document.createElement("div");
      sysHdr.className = "log-section-hdr";
      sysHdr.textContent = `System Logs (${sysLogs.length})`;
      logsList.appendChild(sysHdr);

      if (sysLogs.length > 0) {
        for (const entry of sysLogs.slice(-30).reverse()) {
          const div = document.createElement("div");
          div.className = `log-entry log-${entry.level}`;
          div.textContent = `${entry.time.slice(11, 19)} ${entry.level.toUpperCase()} ${entry.message}`;
          logsList.appendChild(div);
        }
      } else {
        const empty = document.createElement("div");
        empty.className = "log-entry";
        empty.style.color = "var(--c-text-dim)";
        empty.style.fontSize = "11px";
        empty.textContent = "(no system logs)";
        logsList.appendChild(empty);
      }
    } catch {}
  }

  clearBtn.addEventListener("click", async () => {
    if (deleteLogs) await deleteLogs();
    loadLogs();
  });

  pauseBtn.addEventListener("click", () => {
    paused = !paused;
    if (paused) {
      clearInterval(intervalId);
      intervalId = null;
      pauseBtn.textContent = "▶";
      pauseBtn.classList.add("paused");
      pauseBtn.title = "Resume auto-refresh";
    } else {
      intervalId = setInterval(loadLogs, 3000);
      pauseBtn.textContent = "⏸";
      pauseBtn.classList.remove("paused");
      pauseBtn.title = "Pause auto-refresh";
    }
  });

  // ── Snapshot ─────────────────────────────────────────────
  snapBtn.addEventListener("click", async () => {
    if (!fetchSnapshot) return;
    snapContainer.style.display = "block";
    snapContainer.innerHTML = '<div class="snap-line" style="padding:12px">Loading snapshot...</div>';

    try {
      const data = await fetchSnapshot();
      renderSnapshot(data, snapContainer);
    } catch (err) {
      snapContainer.innerHTML = `<div class="snap-line exec-err" style="padding:12px">Failed: ${esc(err.message)}</div>`;
    }
  });

  // ── Initial load ─────────────────────────────────────────
  loadLogs();

  return { el };
}

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
    `<div class="snap-line snap-log-${e.level}"><span class="snap-idx">${e.time.slice(11, 19)}</span> ${e.tag ? `[${esc(e.tag)}] ` : ""}${esc(e.message)}</div>`
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
