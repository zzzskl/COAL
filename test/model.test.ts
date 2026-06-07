import assert from "node:assert/strict";
import { test, mock } from "node:test";
import { Context } from "../src/context/core/index.js";
import { Model } from "../src/model/core/index.js";

function mockFetch(response: object) {
  return mock.method(globalThis, "fetch", () =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve(response),
    } as Response)
  );
}

function fetchBody(): unknown {
  const call = (globalThis.fetch as any).mock.calls[0];
  let bodyStr: string;
  if (typeof call.arguments[1] === "string") {
    bodyStr = call.arguments[1];
  } else {
    bodyStr = call.arguments[1].body;
  }
  return JSON.parse(bodyStr);
}

test("Model — context() stores context and is chainable", () => {
  const ctx = new Context("sys");
  const m = new Model();
  const returned = m.context(ctx);
  assert.equal(returned, m);
});

test("Model — ask() without context throws", async () => {
  const m = new Model();
  await assert.rejects(
    () => m.ask("hello"),
    /no context/i
  );
});

test("Model — ask(message) appends user message to context", async (t) => {
  mockFetch({ choices: [{ message: { content: "reply" } }] });
  t.after(() => mock.restoreAll());

  const ctx = new Context("sys");
  const m = new Model().context(ctx);
  await m.ask("hello");

  assert.equal(ctx.messages.length, 3);
  assert.equal(ctx.messages[1].role, "user");
  assert.equal(ctx.messages[1].content, "hello");
});

test("Model — ask(message) sends correct model in body", async (t) => {
  mockFetch({ choices: [{ message: { content: "reply" } }] });
  t.after(() => mock.restoreAll());

  const ctx = new Context("sys");
  const m = new Model().model("deepseek-v4-flash").context(ctx);
  await m.ask("q");

  assert.equal(fetchBody().model, "deepseek-v4-flash");
});

test("Model — ask(message) sends messages from context", async (t) => {
  mockFetch({ choices: [{ message: { content: "r" } }] });
  t.after(() => mock.restoreAll());

  const ctx = new Context("You are helpful.");
  ctx.user("existing question");
  ctx.assistant("existing answer");

  const m = new Model().context(ctx);
  await m.ask("new question");

  const body = fetchBody() as any;
  assert.equal(body.messages.length, 4);
  assert.equal(body.messages[0].role, "system");
  assert.equal(body.messages[1].content, "existing question");
  assert.equal(body.messages[2].content, "existing answer");
  assert.equal(body.messages[3].content, "new question");
});

test("Model — ask(message) sends tools from context", async (t) => {
  mockFetch({ choices: [{ message: { content: "r" } }] });
  t.after(() => mock.restoreAll());

  const ctx = new Context("sys");
  ctx.setTools([
    { type: "function", function: { name: "get_weather" } },
  ]);

  const m = new Model().context(ctx);
  await m.ask("weather?");

  const body = fetchBody() as any;
  assert.equal(body.tools.length, 1);
  assert.equal(body.tools[0].function.name, "get_weather");
});

test("Model — ask(message) sends toolChoice from context", async (t) => {
  mockFetch({ choices: [{ message: { content: "r" } }] });
  t.after(() => mock.restoreAll());

  const ctx = new Context("sys");
  ctx.setToolChoice("required");

  const m = new Model().context(ctx);
  await m.ask("do it");

  const body = fetchBody() as any;
  assert.equal(body.tool_choice, "required");
});

test("Model — ask() without args sends existing context messages", async (t) => {
  mockFetch({ choices: [{ message: { content: "r" } }] });
  t.after(() => mock.restoreAll());

  const ctx = new Context("sys");
  ctx.user("q");

  const m = new Model().context(ctx);
  await m.ask();

  const body = fetchBody() as any;
  assert.equal(body.messages.length, 2);
});

test("Model — ask() auto-appends assistant response to context", async (t) => {
  mockFetch({
    choices: [{ message: { content: "the reply", tool_calls: undefined } }],
  });
  t.after(() => mock.restoreAll());

  const ctx = new Context("sys");
  const m = new Model().context(ctx);
  const result = await m.ask("q");

  assert.equal(result.content, "the reply");

  const lastMsg = ctx.messages[ctx.messages.length - 1] as any;
  assert.equal(lastMsg.role, "assistant");
  assert.equal(lastMsg.content, "the reply");
});

test("Model — ask() auto-appends assistant with tool_calls to context", async (t) => {
  const toolCalls = [
    { id: "c1", type: "function" as const, function: { name: "f", arguments: "{}" } },
  ];
  mockFetch({
    choices: [{ message: { content: null, tool_calls: toolCalls } }],
  });
  t.after(() => mock.restoreAll());

  const ctx = new Context("sys");
  const m = new Model().context(ctx);
  const result = await m.ask("trigger tool");

  assert.equal(result.content, null);
  assert.equal(result.tool_calls![0].id, "c1");

  const lastMsg = ctx.messages[ctx.messages.length - 1] as any;
  assert.equal(lastMsg.role, "assistant");
  assert.equal(lastMsg.tool_calls.length, 1);
  assert.equal(lastMsg.tool_calls[0].id, "c1");
});

test("Model — temperature is sent correctly", async (t) => {
  mockFetch({ choices: [{ message: { content: "ok" } }] });
  t.after(() => mock.restoreAll());

  const ctx = new Context("sys");
  const m = new Model().temperature(0.3).context(ctx);
  await m.ask("q");

  assert.equal(fetchBody().temperature, 0.3);
});

test("Model — maxTokens is sent correctly", async (t) => {
  mockFetch({ choices: [{ message: { content: "ok" } }] });
  t.after(() => mock.restoreAll());

  const ctx = new Context("sys");
  const m = new Model().maxTokens(500).context(ctx);
  await m.ask("q");

  assert.equal(fetchBody().max_tokens, 500);
});

test("Model — topP is sent when set", async (t) => {
  mockFetch({ choices: [{ message: { content: "ok" } }] });
  t.after(() => mock.restoreAll());

  const ctx = new Context("sys");
  const m = new Model().topP(0.9).context(ctx);
  await m.ask("q");

  assert.equal(fetchBody().top_p, 0.9);
});

test("Model — stop sequences are sent when set", async (t) => {
  mockFetch({ choices: [{ message: { content: "ok" } }] });
  t.after(() => mock.restoreAll());

  const ctx = new Context("sys");
  const m = new Model().stop(["END", "STOP"]).context(ctx);
  await m.ask("q");

  assert.deepEqual(fetchBody().stop, ["END", "STOP"]);
});

test("Model — thinking enabled is sent", async (t) => {
  mockFetch({ choices: [{ message: { content: "ok" } }] });
  t.after(() => mock.restoreAll());

  const ctx = new Context("sys");
  const m = new Model().thinking("max").context(ctx);
  await m.ask("q");

  const body = fetchBody() as any;
  assert.deepEqual(body.thinking, { type: "enabled", reasoning_effort: "max" });
});

test("Model — noThinking is sent", async (t) => {
  mockFetch({ choices: [{ message: { content: "ok" } }] });
  t.after(() => mock.restoreAll());

  const ctx = new Context("sys");
  const m = new Model().noThinking().context(ctx);
  await m.ask("q");

  const body = fetchBody() as any;
  assert.deepEqual(body.thinking, { type: "disabled" });
});

test("Model — throws on API error", async (t) => {
  mock.method(globalThis, "fetch", () =>
    Promise.resolve({
      ok: false,
      status: 401,
      text: () => Promise.resolve("Unauthorized"),
    } as any)
  );
  t.after(() => mock.restoreAll());

  const ctx = new Context("sys");
  const m = new Model().context(ctx);
  await assert.rejects(
    () => m.ask("q"),
    /DeepSeek API error.*401/
  );
});

test("Model — ask(message) with tool_calls in response", async (t) => {
  const toolCalls = [
    { id: "call_1", type: "function" as const, function: { name: "search", arguments: '{"q":"x"}' } },
  ];
  mockFetch({
    choices: [{ message: { content: "searching...", tool_calls: toolCalls } }],
  });
  t.after(() => mock.restoreAll());

  const ctx = new Context("sys");
  const m = new Model().context(ctx);
  const result = await m.ask("search for x");

  assert.equal(result.content, "searching...");
  assert.equal(result.tool_calls!.length, 1);
  assert.equal(result.tool_calls![0].function.name, "search");

  const assistantMsg = ctx.messages[ctx.messages.length - 1] as any;
  assert.equal(assistantMsg.content, "searching...");
  assert.equal(assistantMsg.tool_calls.length, 1);
});

test("Model — multiple ask() calls build up context", async (t) => {
  mockFetch({ choices: [{ message: { content: "reply1" } }] });
  t.after(() => mock.restoreAll());

  const ctx = new Context("sys");
  const m = new Model().context(ctx);

  await m.ask("q1");
  assert.equal(ctx.messages.length, 3);

  mock.restoreAll();
  mockFetch({ choices: [{ message: { content: "reply2" } }] });

  await m.ask("q2");
  assert.equal(ctx.messages.length, 5);
  assert.equal(ctx.messages[3].content, "q2");
  assert.equal(ctx.messages[4].content, "reply2");
});
