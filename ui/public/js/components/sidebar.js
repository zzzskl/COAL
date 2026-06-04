// Sidebar component — tools, context builder, executor, logs
import { initTools } from "./sb-tools.js";
import { initContextBuilder } from "./sb-context.js";
import { initExecutor } from "./sb-executor.js";
import { initLogs } from "./sb-logs.js";

export function Sidebar(refreshAll) {
  const el = document.createElement("div");
  el.id = "sidebar";
  el.innerHTML = `
    <!-- Tools -->
    <div class="sb-section">
      <button class="sb-header collapsed" data-section="tools">
        <span class="sb-header-title">Tools</span>
        <span class="sb-arrow">▼</span>
      </button>
      <div class="sb-content collapsed" id="section-tools">
        <div id="tools-list"></div>
        <button id="tools-add-btn" style="display:none"></button>
      </div>
    </div>

    <!-- Context Builder -->
    <div class="sb-section">
      <button class="sb-header collapsed" data-section="context">
        <span class="sb-header-title">Context Builder</span>
        <span class="sb-arrow">▼</span>
      </button>
      <div class="sb-content collapsed" id="section-context">
        <div class="sb-inline-row" id="ctx-save-row">
          <input type="text" id="ctx-filename" class="sb-input" placeholder="context name">
          <button id="ctx-save-btn" class="cmp-btn primary" style="flex-shrink:0">Save</button>
        </div>
        <div class="sb-inline-row" id="ctx-load-row">
          <select id="ctx-load-select" class="sb-select"></select>
          <button id="ctx-load-btn" class="cmp-btn">Load</button>
          <button id="ctx-del-file-btn" class="cmp-btn danger" title="Delete">🗑</button>
        </div>
        <div id="ctx-list"></div>
        <div class="sb-form" id="ctx-add-form">
          <select id="ctx-add-role" class="sb-select">
            <option value="system">system</option>
            <option value="user" selected>user</option>
            <option value="assistant">assistant</option>
            <option value="tool">tool</option>
          </select>
          <input type="text" id="ctx-add-tool-call-id" class="sb-input" placeholder="tool_call_id (for tool role)" style="display:none">
          <textarea id="ctx-add-tool-calls" class="sb-textarea" placeholder="tool_calls JSON (for assistant role)" style="display:none" rows="3"></textarea>
          <textarea id="ctx-add-content" class="sb-textarea" rows="2" placeholder="Message content..."></textarea>
          <button id="ctx-add-btn" class="cmp-btn primary">Add Message</button>
        </div>
      </div>
    </div>

    <!-- Executor -->
    <div class="sb-section">
      <button class="sb-header collapsed" data-section="executor">
        <span class="sb-header-title">Executor</span>
        <span class="sb-arrow">▼</span>
      </button>
      <div class="sb-content collapsed" id="section-executor">
        <button id="exec-run-btn" class="cmp-btn" style="width:100%">Execute Pending</button>
        <div id="exec-result"></div>
      </div>
    </div>

    <!-- Logs -->
    <div class="sb-section">
      <button class="sb-header collapsed" data-section="logs">
        <span class="sb-header-title">Logs</span>
        <span class="sb-arrow">▼</span>
      </button>
      <div class="sb-content collapsed" id="section-logs">
        <div class="sb-inline-row">
          <button id="logs-snap-btn" class="cmp-btn">Snapshot</button>
          <button id="logs-pause-btn" class="cmp-btn" title="Pause auto-refresh">⏸</button>
          <button id="logs-clear-btn" class="cmp-btn danger">Clear</button>
        </div>
        <div id="logs-list" style="margin-top:8px"></div>
      </div>
    </div>
  `;

  // Accordion toggle
  el.querySelectorAll(".sb-header").forEach((header) => {
    header.addEventListener("click", () => {
      const section = header.dataset.section;
      const content = el.querySelector(`#section-${section}`);
      const isCollapsed = header.classList.toggle("collapsed");
      if (content) content.classList.toggle("collapsed", isCollapsed);
    });
  });

  // Defer section init to next tick so DOM is ready
  setTimeout(() => {
    initTools();
    initContextBuilder(refreshAll);
    initExecutor(refreshAll);
    initLogs();
  }, 0);

  return el;
}
