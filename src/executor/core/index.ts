import type { Context } from "../../context/core/index.js";
import type { ToolCall } from "../../context/type.js";
import type { ToolFn } from "../../tools/type.js";

export function executePendingTools(
  ctx: Context,
  availableTools: Record<string, ToolFn>
): string[] {
  // Collect existing tool_call_ids (already executed)
  const resolved = new Set<string>();
  for (const m of ctx.messages) {
    if (m.role === "tool") {
      resolved.add((m as any).tool_call_id as string);
    }
  }

  const executed: string[] = [];

  for (const m of ctx.messages) {
    if (m.role !== "assistant") continue;
    const toolCalls = (m as any).tool_calls as ToolCall[] | undefined;
    if (!toolCalls || toolCalls.length === 0) continue;

    for (const tc of toolCalls) {
      if (resolved.has(tc.id)) continue;

      const fn = availableTools[tc.function.name];
      let result: string;
      if (!fn) {
        result = JSON.stringify({
          error: `Unknown tool: ${tc.function.name}`,
        });
      } else {
        try {
          const args = JSON.parse(tc.function.arguments);
          result = fn(args);
        } catch (err) {
          result = JSON.stringify({
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      ctx.toolResult(tc.id, result);
      resolved.add(tc.id);
      executed.push(tc.id);
    }
  }

  return executed;
}
