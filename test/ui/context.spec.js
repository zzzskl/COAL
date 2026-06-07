// Shared context component test definitions.
// Used by both browser runner (context.test.js) and Node runner (run.js).

export function registerContextTests({ test, assert, ContextCompact, ContextList, ContextDetail }) {

  // ══ ContextCompact ═══════════════════════════════════════════

  test("ContextCompact — renders name prop", () => {
    const el = ContextCompact({ messages: [], tools: [] }, { name: "Test Chat" });
    assert.includes(el.innerHTML, "Test Chat");
  });

  test("ContextCompact — renders fallback name when not provided", () => {
    const el = ContextCompact({ messages: [], tools: [] }, {});
    assert.includes(el.innerHTML, "Unnamed");
  });

  test("ContextCompact — shows message count", () => {
    const ctx = { messages: [{ role: "user", content: "hi" }], tools: [] };
    const el = ContextCompact(ctx, { name: "Test" });
    assert.includes(el.innerHTML, "1 msg");
  });

  test("ContextCompact — shows plural messages", () => {
    const ctx = { messages: [{ role: "user", content: "a" }, { role: "assistant", content: "b" }], tools: [] };
    const el = ContextCompact(ctx, { name: "Test" });
    assert.includes(el.innerHTML, "2 msgs");
  });

  test("ContextCompact — shows tool count", () => {
    const ctx = { messages: [], tools: [{ type: "function", function: { name: "f1" } }] };
    const el = ContextCompact(ctx, { name: "Test" });
    assert.includes(el.innerHTML, "1 tool");
  });

  test("ContextCompact — onDelete button appears when provided", () => {
    const el = ContextCompact({ messages: [], tools: [] }, { name: "T", onDelete: () => {} });
    const btn = el.querySelector(".ctx-compact-del");
    assert.ok(btn, "delete button should exist");
  });

  test("ContextCompact — onDelete button absent when not provided", () => {
    const el = ContextCompact({ messages: [], tools: [] }, { name: "T" });
    const btn = el.querySelector(".ctx-compact-del");
    assert.ok(!btn, "delete button should not exist");
  });

  test("ContextCompact — onDelete fires on button click", () => {
    let called = false;
    const el = ContextCompact({ messages: [], tools: [] }, { name: "T", onDelete: () => { called = true; } });
    el.querySelector(".ctx-compact-del").click();
    assert.ok(called, "onDelete should be called");
  });

  test("ContextCompact — active class applied", () => {
    const el = ContextCompact({ messages: [], tools: [] }, { name: "T", active: true });
    assert.ok(el.classList.contains("active"), "active class should be present");
  });

  test("ContextCompact — no active class when not active", () => {
    const el = ContextCompact({ messages: [], tools: [] }, { name: "T" });
    assert.ok(!el.classList.contains("active"), "active class should not be present");
  });

  test("ContextCompact — onChange fires after inline name edit", () => {
    let calledWith = null;
    const el = ContextCompact({ messages: [], tools: [] }, {
      name: "Old Name",
      onChange: (data) => { calledWith = data; },
    });

    const nameSpan = el.querySelector(".ctx-compact-name");
    nameSpan.click();

    const input = el.querySelector(".ctx-compact-name-input");
    assert.ok(input, "input should appear after clicking name");

    input.value = "New Name";
    // try/catch: linkedom's replaceWith may throw after callback fires
    try { input.dispatchEvent(new Event("blur")); } catch (_) {}

    assert.ok(calledWith, "onChange should be called");
    assert.equal(calledWith.name, "New Name", "onChange should receive new name");
  });

  test("ContextCompact — Esc during rename cancels (restores old name)", () => {
    let calledWith = null;
    const el = ContextCompact({ messages: [], tools: [] }, {
      name: "Old Name",
      onChange: (data) => { calledWith = data; },
    });

    const nameSpan = el.querySelector(".ctx-compact-name");
    nameSpan.click();

    const input = el.querySelector(".ctx-compact-name-input");
    assert.ok(input, "input should appear");

    try { input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); } catch (_) {}

    assert.ok(!calledWith, "onChange should NOT be called on Escape");
  });

  // ══ ContextList ══════════════════════════════════════════════

  test("ContextList — returns { el, refresh }", () => {
    const result = ContextList([{ messages: [] }], 0, {});
    assert.ok(result.el, "result should have .el");
    assert.ok(typeof result.refresh === "function", "result should have .refresh function");
  });

  test("ContextList — renders names from prop", () => {
    const contexts = [{ messages: [] }, { messages: [] }];
    const names = { 0: { name: "Chat A" }, 1: { name: "Chat B" } };
    const result = ContextList(contexts, 0, { names });

    const items = result.el.querySelectorAll(".ctx-compact-name");
    assert.equal(items.length, 2, "should render 2 items");
    assert.includes(items[0].textContent, "Chat A");
    assert.includes(items[1].textContent, "Chat B");
  });

  test("ContextList — falls back to Chat N+1 when no names", () => {
    const contexts = [{ messages: [] }, { messages: [] }];
    const result = ContextList(contexts, 0, {});

    const items = result.el.querySelectorAll(".ctx-compact-name");
    assert.includes(items[0].textContent, "Chat 1");
    assert.includes(items[1].textContent, "Chat 2");
  });

  test("ContextList — falls back for missing index in names", () => {
    const contexts = [{ messages: [] }, { messages: [] }];
    const names = { 0: { name: "Only First" } };
    const result = ContextList(contexts, 0, { names });

    const items = result.el.querySelectorAll(".ctx-compact-name");
    assert.includes(items[0].textContent, "Only First");
    assert.includes(items[1].textContent, "Chat 2");
  });

  test("ContextList — onSelect callback fires", () => {
    let selected = -1;
    const contexts = [{ messages: [] }, { messages: [] }];
    const result = ContextList(contexts, 0, {
      onSelect: (i) => { selected = i; },
    });

    result.el.querySelectorAll(".ctx-compact")[1].click();
    assert.equal(selected, 1, "onSelect should be called with index 1");
  });

  test("ContextList — onAdd fires on + New button", () => {
    let added = false;
    const result = ContextList([{ messages: [] }], 0, {
      onAdd: () => { added = true; },
    });

    const addBtn = result.el.querySelector(".add-btn");
    assert.ok(addBtn, "add button should exist");
    addBtn.click();
    assert.ok(added, "onAdd should fire");
  });

  test("ContextList — refresh re-renders after data change", () => {
    const contexts = [{ messages: [] }];
    const names = { 0: { name: "Original" } };
    const result = ContextList(contexts, 0, { names });

    let nameEl = result.el.querySelector(".ctx-compact-name");
    assert.includes(nameEl.textContent, "Original");

    names[0].name = "Updated";
    result.refresh();

    nameEl = result.el.querySelector(".ctx-compact-name");
    assert.includes(nameEl.textContent, "Updated");
  });

  test("ContextList — header shows active context name", () => {
    const contexts = [{ messages: [] }, { messages: [] }];
    const names = { 0: { name: "Active Chat" }, 1: { name: "Other" } };
    const result = ContextList(contexts, 0, { names });

    const header = result.el.querySelector(".ctx-list-header");
    assert.includes(header.textContent, "Active Chat");
  });

  test("ContextList — header falls back when names missing", () => {
    const contexts = [{ messages: [] }, { messages: [] }];
    const result = ContextList(contexts, 1, {});

    const header = result.el.querySelector(".ctx-list-header");
    assert.includes(header.textContent, "Chat 2");
  });

  // ══ ContextDetail ════════════════════════════════════════════

  test("ContextDetail — renders name in header input", () => {
    const ctx = { messages: [], tools: [] };
    const detail = ContextDetail(ctx, { name: "Detail Chat" });

    const nameInput = detail.el.querySelector(".ctx-detail-name");
    assert.ok(nameInput, "name input should exist");
    assert.equal(nameInput.value, "Detail Chat");
  });

  test("ContextDetail — renders message count 0", () => {
    const ctx = { messages: [], tools: [] };
    const detail = ContextDetail(ctx, { name: "Empty", onMessageSubmit: () => {} });

    assert.ok(detail.el.querySelector(".msg-list-root"), "MessageList should be rendered");
    const count = detail.el.querySelector(".msg-list-count");
    assert.ok(count, "message count should be shown");
    assert.includes(count.textContent, "0");
  });

}
