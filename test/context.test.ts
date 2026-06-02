import assert from "node:assert/strict";
import { test } from "node:test";
import { Context } from "../src/context/index.js";

test("Context — constructor without system prompt", () => {
  const ctx = new Context();
  assert.equal(ctx.messages.length, 0);
});

test("Context — constructor with system prompt", () => {
  const ctx = new Context("You are helpful.");
  assert.equal(ctx.messages.length, 1);
  assert.deepEqual(ctx.messages[0], { role: "system", content: "You are helpful." });
});

test("Context — system() sets system message", () => {
  const ctx = new Context();
  ctx.system("Be concise.");
  assert.equal(ctx.messages.length, 1);
  assert.equal(ctx.messages[0].role, "system");
  assert.equal(ctx.messages[0].content, "Be concise.");
});

test("Context — system() replaces existing", () => {
  const ctx = new Context("original");
  ctx.system("replaced");
  assert.equal(ctx.messages.length, 1);
  assert.equal(ctx.messages[0].content, "replaced");
});

test("Context — user() appends", () => {
  const ctx = new Context();
  ctx.user("q1");
  ctx.user("q2");
  assert.equal(ctx.messages.length, 2);
  assert.equal(ctx.messages[0].role, "user");
  assert.equal(ctx.messages[1].role, "user");
});

test("Context — assistant() without tool calls", () => {
  const ctx = new Context();
  ctx.assistant("reply");
  assert.equal(ctx.messages.length, 1);
  assert.deepEqual(ctx.messages[0], { role: "assistant", content: "reply" });
});

test("Context — assistant() with tool calls", () => {
  const ctx = new Context();
  ctx.assistant(null, [
    { id: "c1", type: "function", function: { name: "f", arguments: "{}" } },
  ]);
  const msg = ctx.messages[0] as any;
  assert.equal(msg.role, "assistant");
  assert.equal(msg.content, null);
  assert.equal(msg.tool_calls.length, 1);
  assert.equal(msg.tool_calls[0].id, "c1");
});

test("Context — toolResult()", () => {
  const ctx = new Context();
  ctx.toolResult("call_1", "result text");
  assert.equal(ctx.messages.length, 1);
  assert.deepEqual(ctx.messages[0], {
    role: "tool",
    content: "result text",
    tool_call_id: "call_1",
  });
});

test("Context — add() for system role", () => {
  const ctx = new Context();
  ctx.add("system", "sys msg");
  assert.equal(ctx.messages.length, 1);
  assert.equal(ctx.messages[0].role, "system");
});

test("Context — add() for user role", () => {
  const ctx = new Context();
  ctx.add("user", "hello");
  assert.equal(ctx.messages.length, 1);
  assert.equal(ctx.messages[0].role, "user");
});

test("Context — add() for assistant with toolCalls", () => {
  const ctx = new Context();
  ctx.add("assistant", "", {
    toolCalls: [{ id: "t1", type: "function", function: { name: "g", arguments: "{}" } }],
  });
  const msg = ctx.messages[0] as any;
  assert.equal(msg.role, "assistant");
  assert.equal(msg.tool_calls.length, 1);
});

test("Context — add() for tool role", () => {
  const ctx = new Context();
  ctx.add("tool", "result", { toolCallId: "id1" });
  const msg = ctx.messages[0] as any;
  assert.equal(msg.role, "tool");
  assert.equal(msg.tool_call_id, "id1");
});

test("Context — removeAt() valid index", () => {
  const ctx = new Context();
  ctx.user("a");
  ctx.user("b");
  ctx.user("c");
  ctx.removeAt(1);
  assert.equal(ctx.messages.length, 2);
  assert.equal(ctx.messages[0].content, "a");
  assert.equal(ctx.messages[1].content, "c");
});

test("Context — removeAt() invalid index (no-op)", () => {
  const ctx = new Context();
  ctx.user("a");
  ctx.removeAt(5);
  assert.equal(ctx.messages.length, 1);
  ctx.removeAt(-1);
  assert.equal(ctx.messages.length, 1);
});

test("Context — updateAt()", () => {
  const ctx = new Context();
  ctx.user("original");
  ctx.updateAt(0, "assistant", "updated", {
    toolCalls: [{ id: "x", type: "function", function: { name: "f", arguments: "{}" } }],
  });
  const msg = ctx.messages[0] as any;
  assert.equal(msg.role, "assistant");
  assert.equal(msg.content, "updated");
  assert.equal(msg.tool_calls.length, 1);
});

test("Context — updateAt() invalid index (no-op)", () => {
  const ctx = new Context();
  ctx.user("a");
  ctx.updateAt(99, "system", "x");
  assert.equal(ctx.messages[0].content, "a");
});

test("Context — clear()", () => {
  const ctx = new Context("sys");
  ctx.user("q");
  ctx.clear();
  assert.equal(ctx.messages.length, 0);
});

test("Context — setTools() / getTools()", () => {
  const ctx = new Context();
  assert.equal(ctx.getTools(), null);
  const tools = [
    { type: "function" as const, function: { name: "f1" } },
    { type: "function" as const, function: { name: "f2" } },
  ];
  ctx.setTools(tools);
  assert.equal(ctx.getTools()!.length, 2);
  assert.equal(ctx.getTools()![0].function.name, "f1");
});

test("Context — setToolChoice() / getToolChoice()", () => {
  const ctx = new Context();
  assert.equal(ctx.getToolChoice(), null);
  ctx.setToolChoice("required");
  assert.equal(ctx.getToolChoice(), "required");
  ctx.setToolChoice({ type: "function", function: { name: "f" } });
  assert.deepEqual(ctx.getToolChoice(), { type: "function", function: { name: "f" } });
});

test("Context — clear() also clears tools", () => {
  const ctx = new Context();
  ctx.setTools([{ type: "function", function: { name: "f" } }]);
  ctx.clear();
  assert.equal(ctx.getTools(), null);
  assert.equal(ctx.getToolChoice(), null);
});

test("Context — toJSON() without tools", () => {
  const ctx = new Context("sys");
  ctx.user("q");
  const json = ctx.toJSON() as any;
  assert.equal(json.messages.length, 2);
  assert.equal(json.tools, undefined);
});

test("Context — toJSON() with tools", () => {
  const ctx = new Context("sys");
  ctx.setTools([{ type: "function", function: { name: "f" } }]);
  ctx.setToolChoice("auto");
  const json = ctx.toJSON() as any;
  assert.equal(json.tools.length, 1);
  assert.equal(json.toolChoice, "auto");
});

test("Context — fromJSON() restores messages", () => {
  const original = new Context("sys");
  original.user("q");
  original.assistant("a");

  const restored = Context.fromJSON(original.toJSON() as any);
  assert.equal(restored.messages.length, 3);
  assert.equal(restored.messages[0].role, "system");
  assert.equal(restored.messages[1].content, "q");
});

test("Context — fromJSON() restores tools", () => {
  const original = new Context();
  original.setTools([{ type: "function", function: { name: "f1" } }]);
  original.setToolChoice("required");

  const restored = Context.fromJSON(original.toJSON() as any);
  assert.equal(restored.getTools()!.length, 1);
  assert.equal(restored.getToolChoice(), "required");
});

test("Context — messages is readonly from outside", () => {
  const ctx = new Context();
  ctx.user("a");
  // ReadonlyArray prevents mutation at type level
  const msgs = ctx.messages;
  assert.equal(msgs.length, 1);
});

test("Context — toolResult() via add()", () => {
  const ctx = new Context();
  ctx.add("tool", "done", { toolCallId: "id_x" });
  const msg = ctx.messages[0] as any;
  assert.equal(msg.tool_call_id, "id_x");
  assert.equal(msg.content, "done");
});
