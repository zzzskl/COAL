// exec-panel.js — Standalone Executor panel

function esc(s) { const d = document.createElement("div"); d.textContent = String(s ?? ""); return d.innerHTML; }

export function ExecutorPanel(opts = {}) {
  const { onExecute } = opts;
  const el = document.createElement("div");
  el.className = "exec-panel";

  const btn = document.createElement("button");
  btn.className = "cmp-btn";
  btn.style.width = "100%";
  btn.textContent = "Execute Pending";

  const result = document.createElement("div");
  result.className = "exec-result";

  btn.addEventListener("click", async () => {
    if (!onExecute) return;
    btn.disabled = true;
    btn.textContent = "Running...";
    result.innerHTML = "";

    try {
      const data = await onExecute();
      result.innerHTML = data.executed.length === 0
        ? '<div class="exec-msg">No pending tool calls.</div>'
        : `<div class="exec-msg exec-ok">Executed ${data.executed.length} tool(s): ${data.executed.map(esc).join(", ")}</div>`;
    } catch (err) {
      result.innerHTML = `<div class="exec-msg exec-err">Error: ${esc(err.message)}</div>`;
    } finally {
      btn.disabled = false;
      btn.textContent = "Execute Pending";
    }
  });

  el.appendChild(btn);
  el.appendChild(result);

  return { el };
}
