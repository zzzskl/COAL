import type { ToolCall } from "../context/type.js";

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
