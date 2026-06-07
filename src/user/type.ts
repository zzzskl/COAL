import type { Config } from "../config/type.js";

/** 一个用户包含的全量数据 */
export interface User {
  version: 1;
  configs: Config[];
  activeCfg: number;
  contexts: any[];   // Context.toJSON() 的输出 shape
  activeCtx: number;
  /** UI 偏好——不污染核心数据模型，只属于 User 的元信息 */
  ui: {
    collapsed: Record<number, number[]>;  // ctxIndex → 需折叠的 messageIndex[]
    context: Record<number, { name: string; savedAt?: string }>;  // ctxIndex → 对话名称 + 元信息
  };
}
