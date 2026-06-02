const $ = (sel) => document.querySelector(sel);

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

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
            parameters:
              Object.keys(fn.parameters || {}).length > 0
                ? fn.parameters
                : undefined,
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
    const container = $("#tools-list");
    container.innerHTML = "";

    // Section: built-in
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
            <span class="tool-name">${escapeHtml(t.function.name)}</span>
            <span class="tool-builtin-badge">builtin</span>
            <button class="tool-toggle">${t._open ? "−" : "+"}</button>
          </div>
          <div class="tool-body" style="display:${t._open ? "" : "none"}">
            <input class="tool-name-input" value="${escapeHtml(t.function.name)}" disabled>
            <input class="tool-desc-input" value="${escapeHtml(t.function.description ?? "")}" placeholder="description" disabled>
            <textarea class="tool-params-input" rows="4" disabled>${escapeHtml(params)}</textarea>
          </div>
        `;
        div.querySelector(".tool-toggle").addEventListener("click", () => {
          t._open = !t._open;
          renderAll();
        });
        container.appendChild(div);
      }
    }

    // Section: user-defined
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
          <span class="tool-name">${escapeHtml(t.function.name)}</span>
          <button class="tool-toggle">${t._open ? "−" : "+"}</button>
          <button class="tool-remove-btn">×</button>
        </div>
        <div class="tool-body" style="display:${t._open ? "" : "none"}">
          <input class="tool-name-input" value="${escapeHtml(t.function.name)}" placeholder="function name">
          <input class="tool-desc-input" value="${escapeHtml(t.function.description ?? "")}" placeholder="description">
          <textarea class="tool-params-input" rows="4" placeholder='parameters (JSON Schema)'>${escapeHtml(params)}</textarea>
        </div>
      `;

      div.querySelector(".tool-toggle").addEventListener("click", () => {
        userTools[i]._open = !userTools[i]._open;
        renderAll();
      });
      div.querySelector(".tool-remove-btn").addEventListener("click", () => {
        userTools.splice(i, 1);
        syncTools();
        renderAll();
      });

      const nameInput = div.querySelector(".tool-name-input");
      const descInput = div.querySelector(".tool-desc-input");
      const paramsInput = div.querySelector(".tool-params-input");

      nameInput.addEventListener("input", () => {
        userTools[i].function.name = nameInput.value;
        syncTools();
      });
      descInput.addEventListener("input", () => {
        userTools[i].function.description = descInput.value;
        syncTools();
      });
      paramsInput.addEventListener("input", () => {
        try {
          userTools[i].function.parameters = JSON.parse(paramsInput.value);
          paramsInput.style.borderColor = "";
          syncTools();
        } catch (_) {
          paramsInput.style.borderColor = "#e94560";
        }
      });

      container.appendChild(div);
    }
  }

  // Refresh the add-button dropdown with available built-in names
  function refreshAddDropdown() {
    const existing = $("#tools-add-select");
    if (!existing) return;
    existing.innerHTML = '<option value="">+ Add Custom Tool</option>';
    for (const t of builtinTools) {
      existing.innerHTML += `<option value="${escapeHtml(t.function.name)}">${escapeHtml(t.function.name)} (builtin)</option>`;
    }
  }

  function doAdd(name) {
    if (!name) {
      // Custom: blank template
      userTools.push({
        type: "function",
        function: { name: "my_function", description: "", parameters: {} },
        _open: true,
      });
    } else {
      // Clone from builtin
      const src = builtinTools.find((t) => t.function.name === name);
      if (src) {
        userTools.push({
          type: "function",
          function: {
            name: src.function.name,
            description: src.function.description ?? "",
            parameters: src.function.parameters
              ? JSON.parse(JSON.stringify(src.function.parameters))
              : {},
          },
          _open: true,
        });
      }
    }
    syncTools();
    renderAll();
    refreshAddDropdown();
  }

  // Wire up the add area: replace plain button with select + button
  function setupAddArea() {
    const addBtn = $("#tools-add-btn");
    addBtn.style.display = "none";

    const row = document.createElement("div");
    row.id = "tools-add-row";
    row.innerHTML = `
      <select id="tools-add-select">
        <option value="">+ Add Custom Tool</option>
      </select>
      <button id="tools-add-go">Add</button>
    `;
    addBtn.parentNode.insertBefore(row, addBtn);
    refreshAddDropdown();

    $("#tools-add-go").addEventListener("click", () => {
      const sel = $("#tools-add-select");
      doAdd(sel.value);
      sel.value = "";
    });
  }

  function loadTools(tools) {
    const builtinNames = new Set(builtinTools.map((t) => t.function.name));
    userTools.length = 0;
    if (tools && tools.length > 0) {
      for (const t of tools) {
        if (builtinNames.has(t.function.name)) continue;
        userTools.push({
          type: "function",
          function: {
            name: t.function.name,
            description: t.function.description ?? "",
            parameters: t.function.parameters ?? {},
          },
          _open: false,
        });
      }
    }
    renderAll();
  }

  // Load built-in tools, then set up UI
  fetch("/api/tools")
    .then((res) => res.json())
    .then((data) => {
      for (const t of data.builtin) {
        builtinTools.push({
          type: "function",
          function: {
            name: t.function.name,
            description: t.function.description ?? "",
            parameters: t.function.parameters ?? {},
          },
          _open: false,
        });
      }
      renderAll();
      setupAddArea();
      syncTools();
    })
    .catch((err) => {
      console.warn("Failed to load built-in tools:", err.message);
      $("#tools-list").innerHTML =
        '<div class="exec-err" style="padding:6px;font-size:12px">Failed to load built-in tools. Is the server running?</div>';
      setupAddArea();
    });

  return { syncTools, loadTools };
}
