// tools-panel.js — Standalone Tools Manager panel
import { ToolList, ToolDetail } from "./tool.js";

function esc(s) { const d = document.createElement("div"); d.textContent = String(s ?? ""); return d.innerHTML; }

export function ToolsPanel(tools, opts = {}) {
  const { builtinTools, onChange } = opts;
  const el = document.createElement("div");
  el.className = "tools-panel";
  el.style.display = "grid";
  el.style.gridTemplateColumns = "220px 1fr";
  el.style.gap = "12px";
  el.style.minHeight = "300px";

  const left = document.createElement("div");
  left.style.overflowY = "auto";
  const right = document.createElement("div");
  right.style.overflowY = "auto";

  let toolIdx = 0;

  function render() {
    left.innerHTML = "";
    right.innerHTML = "";

    const list = ToolList(tools, toolIdx, {
      onSelect: (i) => { toolIdx = i; render(); },
      onAdd: () => { toolIdx = tools.length - 1; if (onChange) onChange(); render(); },
      onDelete: () => {
        if (tools.length <= 1) return;
        if (toolIdx >= tools.length) toolIdx = tools.length - 1;
        if (onChange) onChange();
        render();
      },
    });
    left.appendChild(list);

    const t = tools[toolIdx];
    if (t) {
      const builtin = builtinTools?.some(bt => bt.function.name === t.function.name) ?? false;
      const detail = ToolDetail(t, {
        builtin,
        onSave: (data) => { Object.assign(t, data); if (onChange) onChange(); },
      });
      right.appendChild(detail);
    }
  }

  render();
  el.appendChild(left);
  el.appendChild(right);

  return { el, refresh: render };
}
