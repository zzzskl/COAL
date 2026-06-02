const $ = (sel) => document.querySelector(sel);

export function initExecutor(refreshAll) {
  $("#exec-run-btn").addEventListener("click", async () => {
    const btn = $("#exec-run-btn");
    const resultDiv = $("#exec-result");
    btn.disabled = true;
    btn.textContent = "Running...";
    resultDiv.innerHTML = "";

    try {
      const res = await fetch("/api/context/execute", {
        method: "POST",
        headers: window.COAL.headers(),
      });
      const data = await res.json();

      if (data.executed.length === 0) {
        resultDiv.innerHTML = '<div class="exec-msg">No pending tool calls.</div>';
      } else {
        resultDiv.innerHTML =
          `<div class="exec-msg exec-ok">Executed ${data.executed.length} tool(s): ${data.executed.map(escapeHtml).join(", ")}</div>`;
      }
      await refreshAll();
    } catch (err) {
      resultDiv.innerHTML =
        `<div class="exec-msg exec-err">Error: ${escapeHtml(err.message)}</div>`;
    } finally {
      btn.disabled = false;
      btn.textContent = "Execute Pending";
    }
  });
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}
