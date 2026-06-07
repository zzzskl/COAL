// tool.vue.js — Vue 3 版 ToolCompact + ToolDetail + ToolList

import { defineComponent } from "vue";

const DEFAULT_TOOL = () => ({
  type: "function",
  function: { name: "my_function", description: "", parameters: { type: "object", properties: {}, required: [] } },
});

export const VueToolCompact = defineComponent({
  props: { tool: Object, active: Boolean, onDelete: Function, canDelete: Boolean },
  template: `
    <div :class="['tool-compact', { active }]" @click="$emit('select')">
      <span class="tool-compact-name">{{ tool?.function?.name }}</span>
      <span class="tool-compact-desc">{{ tool?.function?.description || '' }}</span>
      <button v-if="onDelete && canDelete" class="tool-compact-del" @click.stop="onDelete">×</button>
    </div>
  `,
});

export const VueToolDetail = defineComponent({
  props: { tool: Object, builtin: Boolean, onSave: Function, onDelete: Function },
  data() {
    const fn = this.tool?.function || {};
    return {
      name: fn.name || "",
      description: fn.description || "",
      parameters: JSON.stringify(fn.parameters || {}, null, 2),
    };
  },
  methods: {
    save() {
      const params = (() => { try { return JSON.parse(this.parameters); } catch { return {}; } })();
      this.onSave?.({ type: "function", function: { name: this.name, description: this.description, parameters: params } });
    },
  },
  template: `
    <div class="tool-detail">
      <div class="tool-detail-row">
        <label>Function Name</label>
        <input type="text" v-model="name" :disabled="builtin">
      </div>
      <div class="tool-detail-row">
        <label>Description</label>
        <textarea v-model="description" :disabled="builtin"></textarea>
      </div>
      <div class="tool-detail-row">
        <label>Parameters (JSON Schema)</label>
        <textarea v-model="parameters" :disabled="builtin" rows="6"></textarea>
      </div>
      <span v-if="builtin" class="tool-detail-builtin">built-in</span>
      <div v-if="!builtin" class="tool-detail-actions">
        <button v-if="onDelete" class="cmp-btn danger" @click="onDelete(tool)">Delete</button>
        <button v-if="onSave" class="cmp-btn primary" @click="save">Save</button>
      </div>
    </div>
  `,
});

export const VueToolList = defineComponent({
  props: { tools: Array, activeIndex: Number, onSelect: Function, onAdd: Function, onDelete: Function },
  methods: {
    handleSelect(i) { this.onSelect?.(i); },
    handleAdd() {
      this.tools.push(DEFAULT_TOOL());
      this.onAdd?.(this.tools.length - 1);
    },
  },
  template: `
    <div class="tool-list">
      <div class="tool-list-header">
        <span>Tools ({{ tools.length }})</span>
        <button v-if="onAdd" class="cmp-btn add-btn" @click="handleAdd">+ New</button>
      </div>
      <div class="tool-list-items">
        <div v-for="(t, i) in tools" :key="i">
          <VueToolCompact
            :tool="t" :active="i === activeIndex"
            :canDelete="tools.length > 1"
            :onDelete="() => { tools.splice(i, 1); onDelete?.(i); }"
            @select="handleSelect(i)" />
        </div>
      </div>
    </div>
  `,
  components: { VueToolCompact },
});
