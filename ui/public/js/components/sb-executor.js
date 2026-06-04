// sb-executor.js — Sidebar Executor section

export function initExecutor(refreshAll) {
  const btn = document.getElementById("exec-run-btn");
  const resultDiv = document.getElementById("exec-result");
  if (!btn || !resultDiv) return;

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.textContent = "Running...";
    resultDiv.innerHTML = "";

    try {
      const res = await fetch("/api/context/execute", { method: "POST", headers: window.COAL.headers() });
      const data = await res.json();
      resultDiv.innerHTML = data.executed.length === 0
        ? '<div class="exec-msg">No pending tool calls.</div>'
        : `<div class="exec-msg exec-ok">Executed ${data.executed.length} tool(s): ${data.executed.map(esc).join(", ")}</div>`;
      await refreshAll();
    } catch (err) {
      resultDiv.innerHTML = `<div class="exec-msg exec-err">Error: ${esc(err.message)}</div>`;
    } finally {
      btn.disabled = false;
      btn.textContent = "Execute Pending";
    }
  });
}

function esc(s) { const d = document.createElement("div"); d.textContent = String(s ?? ""); return d.innerHTML; }
