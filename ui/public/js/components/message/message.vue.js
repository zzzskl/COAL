// message.vue.js — Vue 3 版 MessageList + MessageDetail + MessageEditModal
import { createApp, defineComponent } from "vue";

function esc(s) { const d = document.createElement("div"); d.textContent = String(s ?? ""); return d.innerHTML; }

function formatContent(text) {
  return esc(text)
    .replace(/```(\w*)\n([\s\S]*?)```/g, "<pre><code>$2</code></pre>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br>");
}

// ── VueMessageCompact ─────────────────────────────────────
export const VueMessageCompact = defineComponent({
  props: { message: Object },
  template: `
    <div class="msg-compact">
      <span class="msg-compact-role" :class="message.role">{{ message.role }}</span>
      <span class="msg-compact-content">{{ (message.content || '').slice(0, 80) }}{{ (message.content || '').length > 80 ? '…' : '' }}</span>
    </div>
  `,
});

// ── VueMessageDetail ──────────────────────────────────────
export const VueMessageDetail = defineComponent({
  props: {
    message: Object, index: Number, collapsed: Boolean,
    onEdit: Function, onDelete: Function, onBranch: Function,
  },
  methods: {
    del() { if (confirm("Delete this message?")) this.onDelete?.(this.index); },
    branch() { this.onBranch?.(this.index); },
  },
  computed: {
    formattedContent() {
      let html = formatContent(this.message?.content ?? "");
      if (this.message?.role === "tool") {
        html = `<span class="msg-detail-toolid">${esc(this.message.tool_call_id ?? "")}</span>` + html;
      }
      return html;
    },
    preview() { return (this.message?.content ?? "").replace(/\n/g, " ").slice(0, 80); },
    hasMore() { return (this.message?.content ?? "").length > 80; },
    hasToolCalls() { return this.message?.tool_calls?.length > 0; },
  },
  template: `
    <div :class="['msg-detail', message?.role, { collapsed }]">
      <span class="msg-detail-role">{{ message?.role }}</span>
      <template v-if="collapsed">
        <span class="msg-detail-collapsed-preview">{{ preview }}{{ hasMore ? '…' : '' }}</span>
        <div class="msg-detail-actions" v-if="onEdit || onDelete || onBranch">
          <button v-if="onEdit" class="msg-detail-action-btn edit" title="Edit" @click.stop="onEdit(index, null)">✎</button>
          <button v-if="onDelete" class="msg-detail-action-btn delete" title="Delete" @click.stop="del">×</button>
          <button v-if="onBranch" class="msg-detail-action-btn branch" title="Branch" @click.stop="branch">↯</button>
        </div>
      </template>
      <template v-else>
        <div class="msg-detail-content" v-html="formattedContent"></div>
        <div class="msg-detail-toolcalls" v-if="hasToolCalls">
          <span v-for="tc in message.tool_calls" :key="tc.id" class="tc-badge">{{ tc.function.name }}</span>
        </div>
        <div class="msg-detail-actions" v-if="onEdit || onDelete || onBranch">
          <button v-if="onEdit" class="msg-detail-action-btn edit" title="Edit" @click.stop="onEdit(index, null)">✎</button>
          <button v-if="onDelete" class="msg-detail-action-btn delete" title="Delete" @click.stop="del">×</button>
          <button v-if="onBranch" class="msg-detail-action-btn branch" title="Branch" @click.stop="branch">↯</button>
        </div>
      </template>
    </div>
  `,
});

// ── openEditModal ──────────────────────────────────────────
export function openEditModal(message, { onSave, onCancel } = {}) {
  const overlay = document.getElementById("modal-overlay");
  const body = document.getElementById("modal-body");
  if (!overlay || !body) return;
  body.innerHTML = '<div id="edit-modal-root"></div>';
  overlay.classList.add("visible");

  const app = createApp(defineComponent({
    props: { message: Object },
    emits: ["save", "cancel"],
    data() {
      const m = this.message || {};
      return {
        role: m.role ?? "user",
        content: m.content ?? "",
        toolCallId: m.tool_call_id ?? "",
        toolCallsJson: m.tool_calls?.length ? JSON.stringify(m.tool_calls, null, 2) : "",
      };
    },
    methods: {
      save() {
        const data = { role: this.role, content: this.content || null };
        if (this.role === "tool" && this.toolCallId) data.tool_call_id = this.toolCallId;
        if (this.role === "assistant" && this.toolCallsJson) {
          try { data.tool_calls = JSON.parse(this.toolCallsJson); } catch {}
        }
        onSave?.(data);
        app.unmount(); overlay.classList.remove("visible");
      },
      cancel() { onCancel?.(); app.unmount(); overlay.classList.remove("visible"); },
    },
    template: `
      <div class="msg-edit-modal">
        <div class="msg-edit-field">
          <label>Role</label>
          <select v-model="role">
            <option value="system">system</option>
            <option value="user">user</option>
            <option value="assistant">assistant</option>
            <option value="tool">tool</option>
          </select>
        </div>
        <div class="msg-edit-field" v-if="role === 'tool'">
          <label>tool_call_id</label>
          <input type="text" v-model="toolCallId" placeholder="tool_call_id">
        </div>
        <div class="msg-edit-field" v-if="role === 'assistant'">
          <label>tool_calls (JSON)</label>
          <textarea v-model="toolCallsJson" rows="4" placeholder='[{"id":"call_01","type":"function","function":{"name":"...","arguments":"{...}"}}]'></textarea>
        </div>
        <div class="msg-edit-field">
          <label>Content</label>
          <textarea v-model="content" rows="8"></textarea>
        </div>
        <div class="msg-edit-actions">
          <button class="cmp-btn primary" @click="save">Save</button>
          <button class="cmp-btn" @click="cancel">Cancel</button>
        </div>
      </div>
    `,
  }), { message });
  app.mount("#edit-modal-root");

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) { app.unmount(); overlay.classList.remove("visible"); }
  }, { once: true });
}

// ── VueMessageList ────────────────────────────────────────
export const VueMessageList = defineComponent({
  props: {
    onSubmit: Function,
    onClear: Function,
    onEditMessage: Function,
    onDeleteMessage: Function,
    onBranchMessage: Function,
  },
  data() {
    return {
      loading: false,
      enabled: true,
      streamingContent: null,
      errorMsg: "",
      inputText: "",
    };
  },
  computed: {
    // 从全局 reactive state 读取消息
    messages() {
      const s = window.__COAL_APP__?.state;
      if (!s) return [];
      return s.contexts[s.activeCtx]?.messages ?? [];
    },
    collapsedIndices() {
      const s = window.__COAL_APP__?.state;
      if (!s) return [];
      return s.ui?.collapsed?.[s.activeCtx] ?? [];
    },
    streamedHtml() {
      const t = this.streamingContent;
      if (!t) return "";
      return formatContent(t);
    },
  },
  methods: {
    // 暴露给 main.js 的命令式 API
    setLoading(on) { this.loading = !!on; if (on) this.errorMsg = ''; },
    setEnabled(on) { this.enabled = !!on; },
    setStreamingText(text) { this.streamingContent = text; if (text !== null) this.errorMsg = ''; },
    addError(msg) { this.errorMsg = msg; this.loading = false; },
    refresh() {},
    handleClear() { this.onClear?.(); },
    doSubmit() {
      const content = this.inputText.trim();
      this.inputText = "";
      this.onSubmit?.(content);
    },
    onKeydown(e) {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); this.doSubmit(); }
    },
    isCollapsed(idx) { return this.collapsedIndices.includes(idx); },
    scrollDown() {
      const area = this.$el?.querySelector?.(".msg-list");
      if (area) area.scrollTop = area.scrollHeight;
    },
  },
  watch: {
    messages: { handler() { this.$nextTick(() => this.scrollDown()); }, deep: true },
    streamingContent() { this.$nextTick(() => this.scrollDown()); },
    errorMsg(val) { if (val) this.$nextTick(() => this.scrollDown()); },
  },
  mounted() { this.scrollDown(); },
  template: `
    <div class="msg-list-root" style="display:flex;flex-direction:column;flex:1;overflow:hidden">
      <!-- Control row -->
      <div class="msg-list-ctrl" style="display:flex;align-items:center;justify-content:space-between;padding:6px 16px;border-bottom:1px solid var(--c-border)">
        <span class="msg-list-count" style="font-size:12px;color:var(--c-text-dim)">{{ messages.length }} messages</span>
        <button v-if="onClear" class="cmp-btn msg-list-clear" @click="handleClear">Clear</button>
      </div>

      <!-- Scroll area -->
      <div class="msg-list">
        <div v-if="messages.length === 0 && !loading" class="msg-list-empty">No messages yet</div>

        <div v-for="(msg, i) in messages" :key="i">
          <VueMessageDetail
            :message="msg" :index="i"
            :collapsed="isCollapsed(i)"
            :onEdit="onEditMessage"
            :onDelete="onDeleteMessage"
            :onBranch="onBranchMessage" />
        </div>

        <div v-if="loading" class="msg-detail assistant" id="msg-loading">
          <span class="msg-detail-role">assistant</span>
          <div class="msg-detail-content">
            <div class="loading-bounce"><span></span><span></span><span></span></div>
          </div>
        </div>

        <div v-if="streamingContent !== null" class="msg-detail assistant" id="msg-streaming">
          <span class="msg-detail-role">assistant</span>
          <div class="msg-detail-content"><span class="streaming-text" v-html="streamedHtml"></span></div>
        </div>

        <div v-if="errorMsg" class="msg-detail assistant msg-list-error">
          <span class="msg-detail-role" style="color:var(--c-danger)">error</span>
          <div class="msg-detail-content" style="color:var(--c-danger)">{{ errorMsg }}</div>
        </div>
      </div>

      <!-- Input row -->
      <div v-if="onSubmit" class="msg-list-input-row">
        <textarea rows="2" placeholder="Type a message and press Enter..."
          :disabled="!enabled" v-model="inputText"
          @keydown="onKeydown"
          style="flex:1;background:var(--c-bg);border:1px solid var(--c-border);border-radius:6px;color:var(--c-text);padding:8px 12px;font-size:14px;resize:none;font-family:inherit"></textarea>
        <button class="cmp-btn primary send-btn" :disabled="!enabled" @click="doSubmit">Send</button>
      </div>
    </div>
  `,
  components: { VueMessageDetail },
});
