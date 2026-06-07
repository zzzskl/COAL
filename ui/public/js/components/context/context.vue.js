// context.vue.js — Vue 3 版 ContextCompact + ContextList + ContextBuilder

import { ref, defineComponent } from "vue";
import { openEditModal } from "../message/message.vue.js";

// ── VueContextCompact ───────────────────────────────────
export const VueContextCompact = defineComponent({
  props: {
    ctx: Object, name: String, active: Boolean,
    onDelete: Function, onChange: Function,
  },
  data() {
    return { editing: false, editValue: "" };
  },
  computed: {
    displayName() { return this.name || "Unnamed"; },
    msgCount() { return this.ctx?.messages?.length ?? 0; },
    toolCount() { return this.ctx?.tools?.length ?? 0; },
  },
  methods: {
    startEdit(e) {
      e.stopPropagation();
      this.editValue = this.displayName;
      this.editing = true;
      this.$nextTick(() => {
        const input = this.$el?.querySelector(".ctx-compact-name-input");
        if (input) { input.focus(); input.select(); }
      });
    },
    finishEdit() {
      const val = this.editValue.trim() || "Unnamed";
      if (val !== this.displayName) this.onChange?.({ name: val });
      this.editing = false;
    },
    handleKeydown(e) {
      if (e.key === "Enter") { e.preventDefault(); this.finishEdit(); }
      if (e.key === "Escape") { this.editing = false; }
    },
    select() { this.$emit("select"); },
  },
  template: `
    <div :class="['ctx-compact', { active }]" @click="select">
      <template v-if="editing">
        <input class="ctx-compact-name-input"
          v-model="editValue"
          @blur="finishEdit"
          @keydown="handleKeydown"
          :style="{ width: Math.min(editValue.length * 8 + 40, 200) + 'px' }">
      </template>
      <template v-else>
        <span class="ctx-compact-name"
          :title="onChange ? 'Click to rename' : ''"
          :style="{ cursor: onChange ? 'pointer' : 'default' }"
          @click.stop="onChange ? startEdit($event) : undefined">{{ displayName }}</span>
      </template>
      <span class="ctx-compact-meta">
        <span>{{ msgCount }} msg{{ msgCount !== 1 ? 's' : '' }}</span>
        <span>{{ toolCount }} tool{{ toolCount !== 1 ? 's' : '' }}</span>
      </span>
      <button v-if="onDelete" class="ctx-compact-del" @click.stop="onDelete">×</button>
    </div>
  `,
});

// ── VueContextList ──────────────────────────────────────
export const VueContextList = defineComponent({
  props: {
    contexts: Array, activeIndex: Number,
    names: Object,
    onSelect: Function, onAdd: Function, onDelete: Function, onChange: Function,
  },
  methods: {
    handleSelect(i) { this.onSelect?.(i); },
    handleAdd() {
      this.contexts.push({ messages: [], tools: [] });
      this.onAdd?.(this.contexts.length - 1);
    },
  },
  template: `
    <div class="ctx-list">
      <div class="ctx-list-header">
        <span>{{ names?.[activeIndex]?.name ?? ('Chat ' + (activeIndex + 1)) }}</span>
        <span style="font-size:11px;color:var(--c-text-dim)">{{ contexts.length }} conversations</span>
        <button v-if="onAdd" class="cmp-btn add-btn" @click="handleAdd">+ New</button>
      </div>
      <div class="ctx-list-items">
        <div v-for="(ctx, i) in contexts" :key="i">
          <VueContextCompact
            :ctx="ctx"
            :name="names?.[i]?.name"
            :active="i === activeIndex"
            :onDelete="onDelete ? () => { contexts.splice(i, 1); onDelete(i); } : undefined"
            :onChange="onChange ? (data) => onChange(i, data) : undefined"
            @select="handleSelect(i)" />
        </div>
      </div>
    </div>
  `,
  components: { VueContextCompact },
});

// ── VueContextBuilder ───────────────────────────────────
export const VueContextBuilder = defineComponent({
  props: {
    ctx: Object,
    name: String,
    collapsed: { type: Array, default: () => [] },
    onChange: Function,
  },
  data() {
    return {
      builtinTools: [],
      // Add form
      addRole: "user",
      addContent: "",
      addTcid: "",
      addTcs: "",
      // Edit state
      editingIdx: -1,
      editRole: "user",
      editContent: "",
      editTcid: "",
      editTcs: "",
    };
  },
  computed: {
    messages() { return this.ctx?.messages ?? []; },
    tools() { return this.ctx?.tools ?? []; },
    availableTools() {
      const toolNames = new Set(this.tools.map(t => t.function?.name));
      return this.builtinTools.filter(bt => !toolNames.has(bt.function?.name));
    },
    localCollapsed: {
      get() { return this.collapsed; },
      set(v) { /* parent controls this */ },
    },
    /** toolChoice 双向绑定：映射字符串 ↔ ToolChoice 类型 */
    localToolChoice: {
      get() {
        const tc = this.ctx?.toolChoice;
        if (!tc) return "auto";
        if (typeof tc === "string") return tc;
        if (tc.type === "function") return "tool:" + tc.function.name;
        return "auto";
      },
      set(val) {
        if (val.startsWith("tool:")) {
          this.ctx.toolChoice = { type: "function", function: { name: val.slice(5) } };
        } else {
          this.ctx.toolChoice = val;
        }
        this.changed({});
      },
    },
    /** 当前 toolChoice 是否为函数指定模式 */
    isToolChoiceFunction() {
      return typeof this.localToolChoice === "string" && this.localToolChoice.startsWith("tool:");
    },
  },
  methods: {
    // ── Messages ──
    toggleFold(idx) {
      const pos = this.collapsed.indexOf(idx);
      if (pos >= 0) this.collapsed.splice(pos, 1);
      else this.collapsed.push(idx);
      this.collapsed.sort((a, b) => a - b);
      this.changed({ collapsed: [...this.collapsed] });
    },
    isFolded(idx) { return this.collapsed.includes(idx); },
    msgPreview(m) {
      const c = (m.content ?? "").slice(0, 40);
      const extra = m.tool_calls?.length ? ` +${m.tool_calls.length} tc`
        : m.role === "tool" && m.tool_call_id ? " ←" : "";
      return c + ((m.content ?? "").length > 40 ? "…" : "") + extra;
    },
    deleteMsg(idx) {
      if (!confirm("Delete this message?")) return;
      this.ctx.messages.splice(idx, 1);
      const nc = this.collapsed.map(c => c > idx ? c - 1 : c).filter(c => c !== idx);
      this.collapsed.length = 0;
      this.collapsed.push(...nc);
      this.changed({ collapsed: [...nc] });
    },
    /** 从此处分支：截断至此消息并创建新 context */
    branchMsg(idx) {
      this.changed({ branch: idx });
    },
    editMsg(idx) {
      const m = this.ctx.messages[idx];
      this.editingIdx = idx;
      this.editRole = m.role;
      this.editContent = m.content ?? "";
      this.editTcid = m.tool_call_id ?? "";
      this.editTcs = m.tool_calls?.length ? JSON.stringify(m.tool_calls, null, 2) : "";
    },
    saveEdit() {
      if (this.editingIdx < 0) return;
      const data = { role: this.editRole, content: this.editContent || null };
      if (this.editRole === "tool" && this.editTcid) data.tool_call_id = this.editTcid;
      if (this.editRole === "assistant" && this.editTcs) {
        try { data.tool_calls = JSON.parse(this.editTcs); } catch { return; }
      }
      this.ctx.messages[this.editingIdx] = { ...this.ctx.messages[this.editingIdx], ...data };
      this.editingIdx = -1;
      this.changed({});
    },
    cancelEdit() { this.editingIdx = -1; },
    addMsg() {
      const body = { role: this.addRole, content: this.addContent || null };
      if (this.addRole === "tool") {
        if (!this.addTcid) return;
        body.tool_call_id = this.addTcid;
      }
      if (this.addRole === "assistant" && this.addTcs) {
        try { body.tool_calls = JSON.parse(this.addTcs); } catch { return; }
      }
      this.ctx.messages.push(body);
      this.addContent = ""; this.addTcid = ""; this.addTcs = "";
      this.changed({});
    },
    // ── Tools ──
    removeTool(idx) {
      this.ctx.tools = this.ctx.tools.filter((_, i) => i !== idx);
      this.changed({});
    },
    addBuiltinTool(name) {
      const src = this.builtinTools.find(t => t.function?.name === name);
      if (!src) return;
      this.ctx.tools = [...(this.ctx.tools ?? []), JSON.parse(JSON.stringify(src))];
      this.changed({});
    },
    addCustomTool() {
      this.ctx.tools = [...(this.ctx.tools ?? []), {
        type: "function",
        function: { name: "my_function", description: "", parameters: { type: "object", properties: {}, required: [] } },
      }];
      this.changed({});
    },
    // ── Name ──
    onNameChange(e) {
      this.changed({ name: e.target.value.trim() || "Unnamed" });
    },
    changed(extra) { this.onChange?.(extra); },
  },
  created() {
    fetch("/api/tools").then(r => r.json()).then(d => {
      this.builtinTools = d.builtin ?? [];
    }).catch(() => {});
  },
  template: `
    <div class="ctx-builder">
      <div class="ctxb-name">
        <input class="ctxb-name-input" :value="name ?? 'Unnamed'" @change="onNameChange" placeholder="Conversation name">
      </div>

      <!-- Messages section -->
      <div class="ctxb-section-label">Messages ({{ messages.length }})</div>
      <div class="ctx-builder-msgs">
        <div v-for="(m, i) in messages" :key="i" class="ctx-item">
          <template v-if="editingIdx === i">
            <!-- Edit form -->
            <div class="ctx-edit-form" style="width:100%">
              <select v-model="editRole" style="width:100%;padding:5px 8px;background:var(--c-bg);border:1px solid var(--c-border);border-radius:4px;color:var(--c-text);font-size:12px">
                <option value="system">system</option>
                <option value="user">user</option>
                <option value="assistant">assistant</option>
                <option value="tool">tool</option>
              </select>
              <input v-if="editRole === 'tool'" v-model="editTcid" type="text" placeholder="tool_call_id" style="width:100%;padding:5px 8px;background:var(--c-bg);border:1px solid var(--c-border);border-radius:4px;color:var(--c-text);font-size:12px;margin-top:4px">
              <textarea v-if="editRole === 'assistant'" v-model="editTcs" rows="4" placeholder="tool_calls JSON" style="width:100%;padding:5px 8px;background:var(--c-bg);border:1px solid var(--c-border);border-radius:4px;color:var(--c-text);font-size:12px;margin-top:4px;resize:vertical"></textarea>
              <textarea v-model="editContent" rows="3" placeholder="Message content" style="width:100%;padding:5px 8px;background:var(--c-bg);border:1px solid var(--c-border);border-radius:4px;color:var(--c-text);font-size:12px;margin-top:4px;resize:vertical"></textarea>
              <div style="display:flex;gap:6px;margin-top:6px">
                <button class="cmp-btn primary" @click="saveEdit">Save</button>
                <button class="cmp-btn" @click="cancelEdit">Cancel</button>
              </div>
            </div>
          </template>
          <template v-else>
            <span :class="['ctx-role', 'ctx-role-' + m.role]">{{ m.role }}</span>
            <span class="ctx-preview">{{ msgPreview(m) }}</span>
            <button class="ctx-edit-btn" title="Edit" @click="editMsg(i)">✎</button>
            <button class="ctx-branch-btn" title="Branch from here" @click="branchMsg(i)">⊞</button>
            <button class="ctx-fold-btn" :title="isFolded(i) ? 'Expand' : 'Collapse'" @click="toggleFold(i)">{{ isFolded(i) ? '▸' : '▾' }}</button>
            <button class="ctx-del-btn" title="Delete" @click="deleteMsg(i)">×</button>
          </template>
        </div>
      </div>

      <!-- Add message form -->
      <div class="ctx-builder-add">
        <select v-model="addRole" style="width:100%;padding:5px 8px;background:var(--c-bg);border:1px solid var(--c-border);border-radius:4px;color:var(--c-text);font-size:12px">
          <option value="system">system</option>
          <option value="user">user</option>
          <option value="assistant">assistant</option>
          <option value="tool">tool</option>
        </select>
        <input v-if="addRole === 'tool'" v-model="addTcid" type="text" placeholder="tool_call_id (tool)" style="width:100%;padding:5px 8px;background:var(--c-bg);border:1px solid var(--c-border);border-radius:4px;color:var(--c-text);font-size:12px">
        <textarea v-if="addRole === 'assistant'" v-model="addTcs" rows="2" placeholder='tool_calls JSON (assistant)' style="width:100%;padding:5px 8px;background:var(--c-bg);border:1px solid var(--c-border);border-radius:4px;color:var(--c-text);font-size:12px;resize:vertical"></textarea>
        <textarea v-model="addContent" rows="2" placeholder="Message content..." style="width:100%;padding:5px 8px;background:var(--c-bg);border:1px solid var(--c-border);border-radius:4px;color:var(--c-text);font-size:12px;resize:vertical"></textarea>
        <button class="cmp-btn primary" @click="addMsg">Add Message</button>
      </div>

      <!-- Tools section -->
      <div class="ctxb-section-label" style="margin-top:8px">Tools ({{ tools.length }})</div>
      <div class="ctxb-tools-list">
        <div v-if="tools.length === 0" class="ctxb-tools-empty">No tools</div>
        <div v-for="(t, i) in tools" :key="i" class="ctx-item" style="display:flex;align-items:center;gap:6px;padding:4px 6px;font-size:12px">
          <span class="ctxb-tool-name" style="flex:1;color:var(--c-accent);font-family:monospace">{{ t.function?.name ?? '?' }}</span>
          <button class="ctxb-tool-remove" title="Remove tool" @click="removeTool(i)">×</button>
        </div>
      </div>

      <!-- Available tools -->
      <div class="ctxb-section-label" style="margin-top:6px;font-size:11px;color:var(--c-text-dim)">Available</div>
      <div class="ctxb-avail-list">
        <div v-for="bt in availableTools" :key="bt.function?.name" class="ctxb-avail-item" style="display:flex;align-items:center;gap:6px;padding:3px 6px;font-size:11px">
          <span class="ctxb-avail-name" style="flex:1;font-family:monospace;color:var(--c-text)">{{ bt.function?.name }}</span>
          <button class="cmp-btn" style="font-size:10px;padding:2px 6px" @click="addBuiltinTool(bt.function?.name)">+Add</button>
        </div>
        <div class="ctxb-avail-item" style="display:flex;align-items:center;gap:6px;padding:3px 6px;font-size:11px">
          <span class="ctxb-avail-name" style="flex:1;color:var(--c-accent)">+ Custom Tool</span>
          <button class="cmp-btn" style="font-size:10px;padding:2px 6px" @click="addCustomTool">+Add</button>
        </div>
      </div>

      <!-- Tool choice -->
      <div class="ctxb-section-label" style="margin-top:8px">Tool Choice</div>
      <div style="display:flex;align-items:center;gap:8px;padding:4px 6px;font-size:12px">
        <select v-model="localToolChoice" style="flex:1;padding:4px 6px;background:var(--c-bg);border:1px solid var(--c-border);border-radius:4px;color:var(--c-text);font-size:12px">
          <option value="auto">auto</option>
          <option value="none">none</option>
          <option value="required">required</option>
          <option v-for="t in tools" :key="t.function?.name" :value="'tool:' + t.function?.name">{{ t.function?.name }}</option>
        </select>
      </div>
    </div>
  `,
});
