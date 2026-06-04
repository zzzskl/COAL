// sb-context.js — Sidebar Context Builder section

function esc(s) { const d = document.createElement("div"); d.textContent = String(s ?? ""); return d.innerHTML; }

export function initContextBuilder(refreshAll) {
  const $ = id => document.getElementById(id);
  const ctxAddRole = $("ctx-add-role");
  const ctxAddContent = $("ctx-add-content");
  const ctxAddToolCallId = $("ctx-add-tool-call-id");
  const ctxAddToolCalls = $("ctx-add-tool-calls");
  const ctxAddBtn = $("ctx-add-btn");
  const ctxList = $("ctx-list");
  const ctxFilename = $("ctx-filename");
  const ctxSaveBtn = $("ctx-save-btn");
  const ctxLoadSelect = $("ctx-load-select");
  const ctxLoadBtn = $("ctx-load-btn");
  const ctxDelFileBtn = $("ctx-del-file-btn");

  let _lastMessages = [];

  ctxAddRole.addEventListener("change", () => {
    ctxAddToolCallId.style.display = ctxAddRole.value === "tool" ? "" : "none";
    ctxAddToolCalls.style.display = ctxAddRole.value === "assistant" ? "" : "none";
  });

  ctxAddBtn.addEventListener("click", async () => {
    const role = ctxAddRole.value;
    const content = ctxAddContent.value.trim();
    if (!content && role !== "assistant") return;

    const body = { role, content: content || null };
    if (role === "tool") {
      const tcid = ctxAddToolCallId.value.trim();
      if (!tcid) return alert("tool_call_id is required for tool messages");
      body.tool_call_id = tcid;
    }
    if (role === "assistant" && ctxAddToolCalls.value.trim()) {
      try { body.tool_calls = JSON.parse(ctxAddToolCalls.value.trim()); }
      catch { return alert("Invalid tool_calls JSON"); }
    }

    await fetch("/api/context/message", { method: "POST", headers: window.COAL.headers(), body: JSON.stringify(body) });
    ctxAddContent.value = "";
    ctxAddToolCallId.value = "";
    ctxAddToolCalls.value = "";
    await refreshAll();
  });

  ctxSaveBtn.addEventListener("click", async () => {
    const name = ctxFilename.value.trim();
    if (!name) return alert("Enter a filename to save");
    await fetch("/api/context/save", { method: "POST", headers: window.COAL.headers(), body: JSON.stringify({ filename: name }) });
    ctxFilename.value = "";
    await refreshFileList();
  });

  ctxLoadBtn.addEventListener("click", async () => {
    const name = ctxLoadSelect.value;
    if (!name) return;
    await fetch("/api/context/load", { method: "POST", headers: window.COAL.headers(), body: JSON.stringify({ filename: name }) });
    await refreshAll();
  });

  ctxDelFileBtn.addEventListener("click", async () => {
    const name = ctxLoadSelect.value;
    if (!name) return;
    await fetch(`/api/context/file/${name}`, { method: "DELETE", headers: window.COAL.headers() });
    await refreshFileList();
  });

  async function deleteCtxMessage(index) {
    await fetch(`/api/context/message/${index}`, { method: "DELETE", headers: window.COAL.headers() });
    await refreshAll();
  }

  function startEdit(index, m) {
    const item = $(`ctx-item-${index}`);
    if (!item) return;
    const toolCallId = m.tool_call_id ?? "";
    const tcJson = m.tool_calls?.length ? JSON.stringify(m.tool_calls, null, 2) : "";

    item.innerHTML = `
      <div class="ctx-edit-form">
        <select class="ctx-edit-role">
          <option value="system" ${m.role === "system" ? "selected" : ""}>system</option>
          <option value="user" ${m.role === "user" ? "selected" : ""}>user</option>
          <option value="assistant" ${m.role === "assistant" ? "selected" : ""}>assistant</option>
          <option value="tool" ${m.role === "tool" ? "selected" : ""}>tool</option>
        </select>
        <input type="text" class="ctx-edit-tool-call-id" placeholder="tool_call_id" value="${esc(toolCallId)}" style="display:${m.role === 'tool' ? '' : 'none'}">
        <textarea class="ctx-edit-tool-calls" placeholder="tool_calls JSON" rows="4" style="display:${m.role === 'assistant' ? '' : 'none'}">${esc(tcJson)}</textarea>
        <textarea class="ctx-edit-content" rows="3">${esc(m.content ?? "")}</textarea>
        <div class="ctx-edit-actions">
          <button class="ctx-save-btn">Save</button>
          <button class="ctx-cancel-btn">Cancel</button>
        </div>
      </div>`;

    item.querySelector(".ctx-edit-role").addEventListener("change", e => {
      const r = e.target.value;
      item.querySelector(".ctx-edit-tool-call-id").style.display = r === "tool" ? "" : "none";
      item.querySelector(".ctx-edit-tool-calls").style.display = r === "assistant" ? "" : "none";
    });

    item.querySelector(".ctx-save-btn").addEventListener("click", async () => {
      const role = item.querySelector(".ctx-edit-role").value;
      const content = item.querySelector(".ctx-edit-content").value.trim();
      const tcid = item.querySelector(".ctx-edit-tool-call-id")?.value.trim() ?? "";
      const tcRaw = item.querySelector(".ctx-edit-tool-calls")?.value.trim() ?? "";
      const body = { role, content: content || null };
      if (role === "tool" && tcid) body.tool_call_id = tcid;
      if (role === "assistant" && tcRaw) { try { body.tool_calls = JSON.parse(tcRaw); } catch {} }

      await fetch(`/api/context/message/${index}`, { method: "PUT", headers: window.COAL.headers(), body: JSON.stringify(body) });
      await refreshAll();
    });

    item.querySelector(".ctx-cancel-btn").addEventListener("click", () => renderCtxList(_lastMessages));
  }

  function renderCtxList(messages) {
    _lastMessages = messages;
    ctxList.innerHTML = "";
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      const div = document.createElement("div");
      div.className = "ctx-item";
      div.id = `ctx-item-${i}`;

      let extra = "";
      if (m.tool_calls?.length) extra = ` +${m.tool_calls.length} tool_call(s)`;
      if (m.role === "tool" && m.tool_call_id) extra = ` ← ${m.tool_call_id}`;

      div.innerHTML = `
        <span class="ctx-role ctx-role-${m.role}">${m.role}</span>
        <span class="ctx-preview">${esc((m.content ?? "").slice(0, 40))}${(m.content ?? "").length > 40 ? "..." : ""}<span class="ctx-extra">${extra}</span></span>
        <button class="ctx-edit-btn" title="Edit">&#9998;</button>
        <button class="ctx-del-btn" title="Delete">&times;</button>`;

      div.querySelector(".ctx-edit-btn").addEventListener("click", () => startEdit(i, m));
      div.querySelector(".ctx-del-btn").addEventListener("click", () => deleteCtxMessage(i));

      ctxList.appendChild(div);
    }
  }

  async function refreshFileList() {
    try {
      const res = await fetch("/api/context/list", { headers: window.COAL.headers() });
      const data = await res.json();
      ctxLoadSelect.innerHTML = '<option value="">-- load --</option>';
      for (const f of data.files) {
        ctxLoadSelect.innerHTML += `<option value="${esc(typeof f === "string" ? f : f.name || "")}">${esc(typeof f === "string" ? f : f.name || "")}</option>`;
      }
    } catch {}
  }

  refreshFileList();

  return { renderCtxList };
}
