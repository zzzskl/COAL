// Sidebar component — context builder, executor, logs
import { initContextBuilder } from "./sb-context.js";
import { initExecutor } from "./sb-executor.js";
import { initLogs } from "./sb-logs.js";

export function Sidebar(refreshAll) {
  const el = document.createElement("div");
  el.id = "sidebar";
  el.innerHTML = `
    <!-- Context Builder -->
    <div class="sb-section" id="sb-section-context">
      <button class="sb-header" data-section="context">
        <span class="sb-header-title">Context Builder</span>
        <span class="sb-arrow">▼</span>
      </button>
      <div class="sb-content" id="section-context">
        <div id="ctx-list"></div>
      </div>
    </div>

    <!-- Executor -->
    <div class="sb-section" id="sb-section-executor">
      <button class="sb-header" data-section="executor">
        <span class="sb-header-title">Executor</span>
        <span class="sb-arrow">▼</span>
      </button>
      <div class="sb-content" id="section-executor">
        <button id="exec-run-btn" class="cmp-btn" style="width:100%">Execute Pending</button>
        <div id="exec-result"></div>
      </div>
    </div>

    <!-- Logs -->
    <div class="sb-section" id="sb-section-logs">
      <button class="sb-header" data-section="logs">
        <span class="sb-header-title">Logs</span>
        <span class="sb-arrow">▼</span>
      </button>
      <div class="sb-content" id="section-logs">
        <div class="sb-inline-row">
          <button id="logs-snap-btn" class="cmp-btn">Snapshot</button>
          <button id="logs-pause-btn" class="cmp-btn" title="Pause auto-refresh">⏸</button>
          <button id="logs-clear-btn" class="cmp-btn danger">Clear</button>
        </div>
        <div id="logs-list" style="margin-top:8px"></div>
      </div>
    </div>
  `;

  // Store section inits
  const sections = {};

  // Init sections on next tick
  setTimeout(() => {
    sections.context = initContextBuilder(refreshAll);
    initExecutor(refreshAll);
    initLogs();
  }, 0);

  // Activate a specific section (collapse others)
  el.activateSection = (section) => {
    const allSections = ["context", "executor", "logs"];
    for (const s of allSections) {
      const header = el.querySelector(`.sb-header[data-section="${s}"]`);
      const content = el.querySelector(`#section-${s}`);
      if (s === section) {
        header?.classList.remove("collapsed");
        content?.classList.remove("collapsed");
        // Refresh context builder if switching to it
        if (s === "context" && sections.context?.refresh) {
          sections.context.refresh();
        }
      } else {
        header?.classList.add("collapsed");
        content?.classList.add("collapsed");
      }
    }
  };

  // Accordion toggle still works per-section
  el.querySelectorAll(".sb-header").forEach((header) => {
    header.addEventListener("click", () => {
      const section = header.dataset.section;
      const content = el.querySelector(`#section-${section}`);
      const isCollapsed = header.classList.toggle("collapsed");
      if (content) content.classList.toggle("collapsed", isCollapsed);
    });
  });

  return el;
}
