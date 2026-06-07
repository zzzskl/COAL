// config.vue.js — Vue 3 版 ConfigList + ConfigDetail
// 使用 template 字符串 + 已有 CSS 类名

import { defineComponent } from "vue";

const DEFAULT_CONFIG = () => ({
  name: "New Config",
  model: "deepseek-v4-flash",
  temperature: 0.7,
  maxTokens: 4096,
  topP: 1,
  thinking: "disabled",
  stop: [],
  autoExecute: false,
});

export const VueConfigCompact = defineComponent({
  props: {
    config: Object,
    active: Boolean,
    onSelect: Function,
    onDelete: Function,
    canDelete: Boolean,
  },
  template: `
    <div :class="['cfg-compact', { active }]" @click="onSelect">
      <span class="cfg-compact-name">{{ config.name || config.model }}</span>
      <select class="cfg-compact-model" :value="config.model" disabled>
        <option>{{ config.model }}</option>
      </select>
      <label class="cfg-compact-auto">
        <input type="checkbox" :checked="config.autoExecute" disabled>
        Auto
      </label>
      <button
        v-if="onDelete && canDelete"
        class="cfg-compact-del"
        @click.stop="onDelete">×</button>
    </div>
  `,
});

export const VueConfigDetail = defineComponent({
  props: {
    config: Object,
    onSave: Function,
    onDelete: Function,
    canDelete: Boolean,
  },
  emits: ["save", "delete"],
  data() {
    return { local: { ...(this.config || DEFAULT_CONFIG()) } };
  },
  watch: {
    config: { deep: true, handler(val) { if (val) this.local = { ...val }; } },
  },
  computed: {
    thinkingType() {
      const t = this.local.thinking;
      if (t === "disabled") return "disabled";
      if (typeof t === "object" && t?.effort) return t.effort;
      return "disabled";
    },
  },
  methods: {
    save() {
      this.onSave?.({ ...this.local,
        thinking: this.thinkingType === "disabled" ? "disabled" : { effort: this.thinkingType },
      });
    },
    stopInput(e) {
      this.local.stop = e.target.value
        ? e.target.value.split(",").map(s => s.trim()).filter(Boolean) : [];
    },
  },
  template: `
    <div class="cfg-detail" v-if="config">
      <div class="cfg-detail-header">
        <input class="cfg-detail-name" v-model="local.name" placeholder="Config name">
      </div>
      <div class="cfg-detail-body">
        <label>
          <span>Model</span>
          <select v-model="local.model">
            <option value="deepseek-v4-flash">deepseek-v4-flash</option>
            <option value="deepseek-v4-pro">deepseek-v4-pro</option>
          </select>
        </label>
        <label>
          <span>Temperature</span>
          <input type="number" step="0.1" min="0" max="2" v-model.number="local.temperature">
        </label>
        <label>
          <span>Max Tokens</span>
          <input type="number" step="1" min="1" max="131072" v-model.number="local.maxTokens">
        </label>
        <label>
          <span>Top P</span>
          <input type="number" step="0.05" min="0" max="1" v-model.number="local.topP">
        </label>
        <label>
          <span>Thinking</span>
          <select :value="thinkingType" @change="local.thinking = $event.target.value === 'disabled' ? 'disabled' : { effort: $event.target.value }">
            <option value="disabled">Disabled</option>
            <option value="high">High</option>
            <option value="max">Max</option>
          </select>
        </label>
        <label>
          <span>Stop Sequences</span>
          <input :value="(local.stop || []).join(', ')" @input="stopInput" placeholder="comma-separated">
        </label>
        <label class="cfg-checkbox">
          <input type="checkbox" v-model="local.autoExecute">
          Auto-execute tools
        </label>
      </div>
      <div class="cfg-detail-actions">
        <button class="cmp-btn primary" @click="save">Save</button>
        <button v-if="canDelete" class="cmp-btn" @click="onDelete">Delete</button>
      </div>
    </div>
    <div v-else class="cfg-detail" style="padding:20px;text-align:center;color:var(--c-text-dim)">Select a config</div>
  `,
});

export const VueConfigList = defineComponent({
  props: {
    configs: Array,
    activeIndex: Number,
    onSelect: Function,
    onAdd: Function,
    onDelete: Function,
  },
  methods: {
    handleSelect(i) { this.onSelect?.(i); },
    handleAdd() {
      this.configs.push(DEFAULT_CONFIG());
      this.onAdd?.(this.configs.length - 1);
    },
  },
  template: `
    <div class="cfg-list">
      <div class="cfg-list-header">
        <span>Configs ({{ configs.length }})</span>
        <button class="cmp-btn" @click="handleAdd">+ New</button>
      </div>
      <div class="cfg-list-items">
        <div v-for="(cfg, i) in configs" :key="i">
          <VueConfigCompact
            :config="cfg"
            :active="i === activeIndex"
            :canDelete="configs.length > 1"
            :onSelect="() => handleSelect(i)"
            :onDelete="() => { configs.splice(i, 1); onDelete?.(i); }" />
        </div>
      </div>
    </div>
  `,
  components: { VueConfigCompact },
});
