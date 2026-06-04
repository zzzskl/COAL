export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolDef {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
    strict?: boolean;
  };
}

export type Role = "system" | "user" | "assistant" | "tool";

export type Message =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: ToolCall[];
    }
  | { role: "tool"; content: string; tool_call_id: string };

export type ToolChoice =
  | "auto"
  | "none"
  | "required"
  | { type: "function"; function: { name: string } };

// ═══════════════════════════════════════════════════════════════
// 统一数据模型——三端共享（内存 / API / 磁盘）
// ═══════════════════════════════════════════════════════════════

/** 一个配置预设。包含全部模型参数。 */
export interface Config {
  name: string;
  model: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  thinking: "disabled" | { effort: "high" | "max" };
  stop: string[];
  autoExecute: boolean;
}

/** 一个用户包含的全量数据。 */
export interface User {
  version: 1;
  configs: Config[];
  activeCfg: number;
  contexts: any[];   // Context.toJSON() 的输出 shape（不含 name，name 在 ui.context）
  activeCtx: number;
  /** 元信息——与 contexts[] 结构对应 */
  meta: {
    context: Record<number, { savedAt?: string }>;
  };
  /** UI 偏好——不污染核心数据模型，只属于 User 的元信息 */
  ui: {
    collapsed: Record<number, number[]>;  // ctxIndex → 需折叠的 messageIndex[]
    context: Record<number, { name: string }>;  // ctxIndex → 用户赋予的对话名称
  };
}
