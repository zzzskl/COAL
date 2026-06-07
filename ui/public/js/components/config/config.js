// Config components: Compact / Detail / List

function esc(s) { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }

// ── ConfigCompact ───────────────────────────────────────────

export function ConfigCompact(config, { active, onDelete } = {}) {
  const el = document.createElement("div");
  el.className = "cfg-compact" + (active ? " active" : "");

  el.innerHTML = `
    <span class="cfg-compact-name">${esc(config.name)}</span>
    <span class="cfg-compact-model">${esc(config.model ?? "—")}</span>
    <label class="cfg-compact-auto">
      <input type="checkbox" ${config.autoExecute ? "checked" : ""} disabled> Auto
    </label>
  `;
  if (onDelete) {
    const del = document.createElement("button");
    del.className = "cfg-compact-del"; del.textContent = "×";
    del.addEventListener("click", (e) => { e.stopPropagation(); onDelete(); });
    el.appendChild(del);
  }
  el.addEventListener("click", () => el.dispatchEvent(new CustomEvent("select")));
  return el;
}

// ── ConfigDetail ────────────────────────────────────────────

export function ConfigDetail(config, { onSave, onDelete } = {}) {
  const el = document.createElement("div");
  el.className = "cfg-detail";
  render();
  return el;

  function render() {
    const c = config;
    el.innerHTML = `
      <div class="cfg-detail-header">
        <input class="cfg-detail-name" value="${esc(c.name)}" data-field="name">
      </div>
      <div class="cfg-detail-body">
        <label>Model
          <select data-field="model">
            <option value="deepseek-v4-flash" ${c.model==="deepseek-v4-flash"?"selected":""}>deepseek-v4-flash</option>
            <option value="deepseek-v4-pro" ${c.model==="deepseek-v4-pro"?"selected":""}>deepseek-v4-pro</option>
          </select>
        </label>
        <label>Temperature <span data-display="temperature">${c.temperature ?? 0.7}</span>
          <input type="range" min="0" max="2" step="0.1" value="${c.temperature ?? 0.7}" data-field="temperature">
        </label>
        <label><input type="checkbox" data-field="autoExecute" ${c.autoExecute?"checked":""}> Auto-execute tool calls</label>
        <details class="cfg-detail-adv">
          <summary>Advanced</summary>
          <div class="adv-body">
            <label>Max Tokens <input type="number" min="1" max="65536" value="${c.maxTokens ?? 4096}" data-field="maxTokens"></label>
            <label>Top P <span data-display="topP">${c.topP ?? 1}</span>
              <input type="range" min="0" max="1" step="0.05" value="${c.topP ?? 1}" data-field="topP">
            </label>
            <label>Thinking
              <select data-field="thinking">
                <option value="disabled" ${c.thinking==="disabled"?"selected":""}>Disabled</option>
                <option value="high" ${c.thinking?.effort==="high"?"selected":""}>Effort: High</option>
                <option value="max" ${c.thinking?.effort==="max"?"selected":""}>Effort: Max</option>
              </select>
            </label>
            <label>Stop Sequences
              <input type="text" value="${esc((c.stop ?? []).join(", "))}" data-field="stop" placeholder="comma-separated">
            </label>
          </div>
        </details>
      </div>
      <div class="cfg-detail-actions">
        ${onDelete ? '<button class="cmp-btn danger btn-del">Delete</button>' : ''}
        ${onSave ? '<button class="cmp-btn primary btn-save">Save</button>' : ''}
      </div>
    `;

    // Live temp/topP display
    el.querySelectorAll('input[type="range"]').forEach(r => {
      r.addEventListener("input", () => {
        const disp = el.querySelector(`[data-display="${r.dataset.field}"]`);
        if (disp) disp.textContent = r.value;
      });
    });

    if (onSave) el.querySelector(".btn-save")?.addEventListener("click", () => {
      const data = { ...config };
      el.querySelectorAll("[data-field]").forEach(inp => {
        const f = inp.dataset.field;
        if (!f) return;
        if (inp.type === "checkbox" && f === "autoExecute") data.autoExecute = inp.checked;
        else if (f === "thinking") {
          const v = inp.value;
          data.thinking = v === "disabled" ? "disabled" : { effort: v };
        }
        else if (f === "temperature" || f === "topP") data[f] = parseFloat(inp.value);
        else if (f === "maxTokens") data[f] = parseInt(inp.value);
        else if (f === "stop") data[f] = inp.value.trim() ? inp.value.split(",").map(s=>s.trim()).filter(Boolean) : [];
        else if (f === "name") {
          const nv = inp.value?.trim();
          if (nv) data.name = nv;
        }
        else if (f === "model") data.model = inp.value;
      });
      onSave(data);
    });

    if (onDelete) el.querySelector(".btn-del")?.addEventListener("click", () => onDelete(config));
  }
}

// ── ConfigList ──────────────────────────────────────────────

export function ConfigList(configs, activeIndex, { onSelect, onAdd, onDelete } = {}) {
  const el = document.createElement("div");
  el.className = "cfg-list";
  render();
  return el;

  function render() {
    el.innerHTML = `
      <div class="cfg-list-header">
        <span>Configs (${configs.length})</span>
        ${onAdd ? '<button class="cmp-btn add-btn">+ New</button>' : ''}
      </div>
      <div class="cfg-list-items"></div>
    `;
    const items = el.querySelector(".cfg-list-items");
    configs.forEach((c, i) => {
      const compact = ConfigCompact(c, {
        active: i === activeIndex,
        onDelete: onDelete ? () => { configs.splice(i, 1); render(); onDelete(i); } : undefined,
      });
      compact.addEventListener("select", () => {
        if (onSelect) onSelect(i);
        render();
      });
      items.appendChild(compact);
    });
    if (onAdd) el.querySelector(".add-btn").addEventListener("click", () => {
      const cfg = { name: "Preset " + (configs.length + 1), model: "deepseek-v4-flash", temperature: 0.7, maxTokens: 4096, topP: 1, thinking: "disabled", autoExecute: false };
      configs.push(cfg);
      onAdd(configs.length - 1);
      render();
    });
  }
}
