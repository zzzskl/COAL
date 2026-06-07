import assert from "node:assert/strict";
import { test } from "node:test";
import { Context } from "../src/context/core/index.js";
import { executePendingTools } from "../src/executor/core/index.js";

const fakeTools = {
  get_weather: (args: Record<string, unknown>) =>
    `Sunny, 25°C in ${args.city}`,
  add: (args: Record<string, unknown>) =>
    String(Number(args.a) + Number(args.b)),
};

test("executor — empty context returns []", () => {
  const ctx = new Context();
  const result = executePendingTools(ctx, fakeTools);
  assert.deepEqual(result, []);
  assert.equal(ctx.messages.length, 0);
});

test("executor — no tool_calls in context returns []", () => {
  const ctx = new Context("sys");
  ctx.user("hello");
  ctx.assistant("hi");
  const result = executePendingTools(ctx, fakeTools);
  assert.deepEqual(result, []);
  assert.equal(ctx.messages.length, 3);
});

test("executor — executes pending tool_call and appends result", () => {
  const ctx = new Context("sys");
  ctx.user("weather?");
  ctx.assistant(null, [
    { id: "c1", type: "function", function: { name: "get_weather", arguments: '{"city":"Beijing"}' } },
  ]);

  const result = executePendingTools(ctx, fakeTools);

  assert.deepEqual(result, ["c1"]);
  assert.equal(ctx.messages.length, 4);

  const toolMsg = ctx.messages[ctx.messages.length - 1] as any;
  assert.equal(toolMsg.role, "tool");
  assert.equal(toolMsg.tool_call_id, "c1");
  assert.equal(toolMsg.content, "Sunny, 25°C in Beijing");
});

test("executor — skips already resolved tool_calls", () => {
  const ctx = new Context("sys");
  ctx.assistant(null, [
    { id: "c1", type: "function", function: { name: "get_weather", arguments: '{"city":"Beijing"}' } },
  ]);
  ctx.toolResult("c1", "already done");

  const result = executePendingTools(ctx, fakeTools);

  assert.deepEqual(result, []);
  assert.equal(ctx.messages.length, 3);
});

test("executor — mixed: some resolved, some pending", () => {
  const ctx = new Context("sys");
  ctx.assistant(null, [
    { id: "c1", type: "function", function: { name: "get_weather", arguments: '{"city":"Beijing"}' } },
    { id: "c2", type: "function", function: { name: "get_weather", arguments: '{"city":"Shanghai"}' } },
  ]);
  ctx.toolResult("c1", "done");

  const result = executePendingTools(ctx, fakeTools);

  assert.deepEqual(result, ["c2"]);
  const toolMsg = ctx.messages[ctx.messages.length - 1] as any;
  assert.equal(toolMsg.tool_call_id, "c2");
  assert.equal(toolMsg.content, "Sunny, 25°C in Shanghai");
});

test("executor — unknown tool returns error in result", () => {
  const ctx = new Context("sys");
  ctx.assistant(null, [
    { id: "c1", type: "function", function: { name: "nonexistent", arguments: "{}" } },
  ]);

  const result = executePendingTools(ctx, fakeTools);

  assert.deepEqual(result, ["c1"]);
  const toolMsg = ctx.messages[ctx.messages.length - 1] as any;
  const parsed = JSON.parse(toolMsg.content);
  assert.ok(parsed.error);
  assert.match(parsed.error, /Unknown tool/);
});

test("executor — broken arguments JSON returns error", () => {
  const ctx = new Context("sys");
  ctx.assistant(null, [
    { id: "c1", type: "function", function: { name: "get_weather", arguments: "not valid json" } },
  ]);

  const result = executePendingTools(ctx, fakeTools);

  assert.deepEqual(result, ["c1"]);
  const toolMsg = ctx.messages[ctx.messages.length - 1] as any;
  const parsed = JSON.parse(toolMsg.content);
  assert.ok(parsed.error);
});

test("executor — second call is idempotent", () => {
  const ctx = new Context("sys");
  ctx.assistant(null, [
    { id: "c1", type: "function", function: { name: "add", arguments: '{"a":1,"b":2}' } },
  ]);

  const r1 = executePendingTools(ctx, fakeTools);
  assert.deepEqual(r1, ["c1"]);
  assert.equal(ctx.messages.length, 3);

  const r2 = executePendingTools(ctx, fakeTools);
  assert.deepEqual(r2, []);
  assert.equal(ctx.messages.length, 3);
});

test("executor — handles multiple assistant messages with tool_calls", () => {
  const ctx = new Context("sys");
  ctx.assistant(null, [
    { id: "c1", type: "function", function: { name: "get_weather", arguments: '{"city":"Tokyo"}' } },
  ]);
  ctx.toolResult("c1", "rainy");
  ctx.assistant("Tokyo is rainy.");
  ctx.user("What about London?");
  ctx.assistant(null, [
    { id: "c2", type: "function", function: { name: "get_weather", arguments: '{"city":"London"}' } },
  ]);

  const result = executePendingTools(ctx, fakeTools);

  assert.deepEqual(result, ["c2"]);
  const toolMsg = ctx.messages[ctx.messages.length - 1] as any;
  assert.equal(toolMsg.content, "Sunny, 25°C in London");
});

test("executor — uses real registry from tools module", async () => {
  const { registry } = await import("../src/tools/core/index.js");

  const ctx = new Context("sys");
  ctx.assistant(null, [
    { id: "c1", type: "function", function: { name: "list_directory", arguments: '{"path":"./src"}' } },
  ]);

  const result = executePendingTools(ctx, registry);

  assert.deepEqual(result, ["c1"]);
  const toolMsg = ctx.messages[ctx.messages.length - 1] as any;
  const parsed = JSON.parse(toolMsg.content);
  assert.ok(Array.isArray(parsed));
  assert.ok(parsed.includes("context"));
  assert.ok(parsed.includes("tools"));
});
