// sb-tools.js — Sidebar Tools section

function esc(s) { const d = document.createElement("div"); d.textContent = String(s ?? ""); return d.innerHTML; }

export function initTools() {
  const builtinTools = [];
  const userTools = [];

  async function syncTools() {
    const all = [...builtinTools, ...userTools];
    const clean = all.length > 0
      ? all.map(({ type, function: fn }) => ({
          type,
          function: {
            name: fn.name,
            description: fn.description || undefined,
            parameters: Object.keys(fn.parameters || {}).length > 0 ? fn.parameters : undefined,
          },
        }))
      : [];
    await fetch("/api/context/tools", {
      method: "PUT",
      headers: window.COAL.headers(),
      body: JSON.stringify({ tools: clean }),
    });
  }

  function renderAll() {
    const container = document.getElementById("tools-list");
    container.innerHTML = "";

    if (builtinTools.length > 0) {
      const label = document.createElement("div");
      label.className = "tools-section-label";
      label.textContent = `Built-in (${builtinTools.length})`;
      container.appendChild(label);

      for (const t of builtinTools) {
        const div = document.createElement("div");
        div.className = "tool-card tool-card-builtin";
        const params = JSON.stringify(t.function.parameters ?? {}, null, 2);
        div.innerHTML = `
          <div class="tool-header">
            <span class="tool-name">${esc(t.function.name)}</span>
            <span class="tool-builtin-badge">builtin</span>
            <button class="tool-toggle">${t._open ? "−" : "+"}</button>
          </div>
          <div class="tool-body" style="display:${t._open ? "" : "none"}">
            <input class="tool-name-input" value="${esc(t.function.name)}" disabled>
            <input class="tool-desc-input" value="${esc(t.function.description ?? "")}" placeholder="description" disabled>
            <textarea class="tool-params-input" rows="4" disabled>${esc(params)}</textarea>
          </div>`;
        div.querySelector(".tool-toggle").addEventListener("click", () => { t._open = !t._open; renderAll(); });
        container.appendChild(div);
      }
    }

    if (userTools.length > 0) {
      const label = document.createElement("div");
      label.className = "tools-section-label";
      label.textContent = `User-defined (${userTools.length})`;
      container.appendChild(label);
    }

    for (let i = 0; i < userTools.length; i++) {
      const t = userTools[i];
      const div = document.createElement("div");
      div.className = "tool-card";
      const params = JSON.stringify(t.function.parameters ?? {}, null, 2);
      div.innerHTML = `
        <div class="tool-header">
          <span class="tool-name">${esc(t.function.name)}</span>
          <button class="tool-toggle">${t._open ? "−" : "+"}</button>
          <button class="tool-remove-btn">×</button>
        </div>
        <div class="tool-body" style="display:${t._open ? "" : "none"}">
          <input class="tool-name-input" value="${esc(t.function.name)}" placeholder="function name">
          <input class="tool-desc-input" value="${esc(t.function.description ?? "")}" placeholder="description">
          <textarea class="tool-params-input" rows="4" placeholder="parameters (JSON Schema)">${esc(params)}</textarea>
        </div>`;

      div.querySelector(".tool-toggle").addEventListener("click", () => { userTools[i]._open = !userTools[i]._open; renderAll(); });
      div.querySelector(".tool-remove-btn").addEventListener("click", () => { userTools.splice(i, 1); syncTools(); renderAll(); });

      const nameInput = div.querySelector(".tool-name-input");
      const descInput = div.querySelector(".tool-desc-input");
      const paramsInput = div.querySelector(".tool-params-input");

      nameInput.addEventListener("input", () => { userTools[i].function.name = nameInput.value; syncTools(); });
      descInput.addEventListener("input", () => { userTools[i].function.description = descInput.value; syncTools(); });
      paramsInput.addEventListener("input", () => {
        try { userTools[i].function.parameters = JSON.parse(paramsInput.value); paramsInput.style.borderColor = ""; syncTools(); }
        catch { paramsInput.style.borderColor = "#e94560"; }
      });

      container.appendChild(div);
    }
  }

  function refreshAddDropdown() {
    const sel = document.getElementById("tools-add-select");
    if (!sel) return;
    sel.innerHTML = '<option value="">+ Add Custom Tool</option>';
    for (const t of builtinTools) {
      sel.innerHTML += `<option value="${esc(t.function.name)}">${esc(t.function.name)} (builtin)</option>`;
    }
  }

  function doAdd(name) {
    if (!name) {
      userTools.push({ type: "function", function: { name: "my_function", description: "", parameters: {} }, _open: true });
    } else {
      const src = builtinTools.find(t => t.function.name === name);
      if (src) {
        userTools.push({
          type: "function",
          function: {
            name: src.function.name,
            description: src.function.description ?? "",
            parameters: src.function.parameters ? JSON.parse(JSON.stringify(src.function.parameters)) : {},
          },
          _open: true,
        });
      }
    }
    syncTools();
    renderAll();
    refreshAddDropdown();
  }

  function setupAddArea() {
    const addBtn = document.getElementById("tools-add-btn");
    if (!addBtn) return;
    addBtn.style.display = "none";

    const row = document.createElement("div");
    row.id = "tools-add-row";
    row.innerHTML = `
      <select id="tools-add-select"><option value="">+ Add Custom Tool</option></select>
      <button id="tools-add-go">Add</button>`;
    addBtn.parentNode.insertBefore(row, addBtn);
    refreshAddDropdown();

    document.getElementById("tools-add-go").addEventListener("click", () => {
      const sel = document.getElementById("tools-add-select");
      doAdd(sel.value);
      sel.value = "";
    });
  }

  fetch("/api/tools")
    .then(r => r.json())
    .then(data => {
      for (const t of data.builtin) {
        builtinTools.push({ type: "function", function: { name: t.function.name, description: t.function.description ?? "", parameters: t.function.parameters ?? {} }, _open: false });
      }
      renderAll();
      setupAddArea();
      syncTools();
    })
    .catch(err => {
      console.warn("Failed to load built-in tools:", err.message);
      const el = document.getElementById("tools-list");
      if (el) el.innerHTML = '<div class="exec-err" style="padding:6px;font-size:12px">Failed to load built-in tools. Is the server running?</div>';
      setupAddArea();
    });

  return { syncTools };
}
