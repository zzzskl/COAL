// Tool components: Compact / Detail / List

function esc(s) { const d = document.createElement("div"); d.textContent = String(s ?? ""); return d.innerHTML; }

// ── ToolCompact ─────────────────────────────────────────────

export function ToolCompact(tool, { active, onDelete } = {}) {
  const el = document.createElement("div");
  el.className = "tool-compact" + (active ? " active" : "");
  const fn = tool.function;
  el.innerHTML = `
    <span class="tool-compact-name">${esc(fn.name)}</span>
    <span class="tool-compact-desc">${esc(fn.description ?? "")}</span>
  `;
  if (onDelete) {
    const del = document.createElement("button");
    del.className = "tool-compact-del"; del.textContent = "×";
    del.addEventListener("click", (e) => { e.stopPropagation(); onDelete(); });
    el.appendChild(del);
  }
  el.addEventListener("click", () => el.dispatchEvent(new CustomEvent("select")));
  return el;
}

// ── ToolDetail ──────────────────────────────────────────────

export function ToolDetail(tool, { builtin, onSave, onDelete } = {}) {
  const el = document.createElement("div");
  el.className = "tool-detail";
  const fn = tool.function;
  el.innerHTML = `
    <div class="tool-detail-row">
      <label>Function Name</label>
      <input type="text" value="${esc(fn.name)}" data-field="name" ${builtin ? "disabled" : ""}>
    </div>
    <div class="tool-detail-row">
      <label>Description</label>
      <textarea data-field="description" ${builtin ? "disabled" : ""}>${esc(fn.description ?? "")}</textarea>
    </div>
    <div class="tool-detail-row">
      <label>Parameters (JSON Schema)</label>
      <textarea data-field="parameters" ${builtin ? "disabled" : ""}>${esc(JSON.stringify(fn.parameters ?? {}, null, 2))}</textarea>
    </div>
    ${builtin ? '<span class="tool-detail-builtin">built-in</span>' : ''}
    ${!builtin ? `
      <div class="tool-detail-actions">
        ${onDelete ? '<button class="cmp-btn danger btn-del">Delete</button>' : ''}
        ${onSave ? '<button class="cmp-btn primary btn-save">Save</button>' : ''}
      </div>
    ` : ''}
  `;

  if (!builtin && onSave) el.querySelector(".btn-save")?.addEventListener("click", () => {
    const data = {
      type: "function",
      function: {
        name: el.querySelector("[data-field=name]").value.trim(),
        description: el.querySelector("[data-field=description]").value.trim(),
        parameters: (() => {
          try { return JSON.parse(el.querySelector("[data-field=parameters]").value); }
          catch (_) { return {}; }
        })(),
      },
    };
    onSave(data);
  });

  if (!builtin && onDelete) el.querySelector(".btn-del")?.addEventListener("click", () => onDelete(tool));

  return el;
}

// ── ToolList ────────────────────────────────────────────────

export function ToolList(tools, activeIndex, { onSelect, onAdd, onDelete } = {}) {
  const el = document.createElement("div");
  el.className = "tool-list";
  render();
  return el;

  function render() {
    el.innerHTML = `
      <div class="tool-list-header">
        <span>Tools (${tools.length})</span>
        ${onAdd ? '<button class="cmp-btn add-btn">+ New</button>' : ''}
      </div>
      <div class="tool-list-items"></div>
    `;
    const items = el.querySelector(".tool-list-items");
    tools.forEach((t, i) => {
      const compact = ToolCompact(t, {
        active: i === activeIndex,
        onDelete: onDelete ? () => { tools.splice(i, 1); render(); onDelete(i); } : undefined,
      });
      compact.addEventListener("select", () => {
        if (onSelect) onSelect(i);
        render();
      });
      items.appendChild(compact);
    });
    if (onAdd) el.querySelector(".add-btn").addEventListener("click", () => {
      tools.push({
        type: "function",
        function: { name: "my_function", description: "", parameters: {} },
      });
      onAdd(tools.length - 1);
      render();
    });
  }
}
