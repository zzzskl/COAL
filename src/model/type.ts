import type { ToolCall } from "../context/type.js";

/** SSE 流式事件——服务端推送 AI 响应的各个阶段 */
export type StreamEvent =
  | { type: "status"; status: string; round?: number }
  | { type: "token"; token: string }
  | { type: "tool_call"; id: string; name: string; arguments: string }
  | { type: "tool_result"; id: string; result: string }
  | { type: "done"; toolCalls?: ToolCall[] }
  | { type: "error"; message: string };
