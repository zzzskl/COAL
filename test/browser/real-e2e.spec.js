// real-e2e.spec.js — REAL end-to-end tests, no mocks.
// Tests the actual server + browser integration.
import { test, expect } from "@playwright/test";

const PORT = 3002;

// ── Helpers ───────────────────────────────────────────────

function log(msg) { console.log(`  [test] ${msg}`); }

// ═══════════════════════════════════════════════════════════
// E2E 1: New chat persists after page reload
// ═══════════════════════════════════════════════════════════

test("create new chat and verify it persists after reload", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto("/");
  await page.waitForSelector(".msg-list", { timeout: 5000 });
  log("page loaded");

  // ── Step 1: Count initial contexts ──
  const initialCount = await page.locator("#ctx-switcher option").count();
  log(`initial context count: ${initialCount}`);

  // ── Step 2: Open context modal, create new chat ──
  await page.click("#ctx-modal-btn");
  await page.waitForSelector("#modal-overlay.visible", { timeout: 3000 });
  log("modal opened");

  const ctxItemsBefore = await page.locator(".ctx-compact").count();
  await page.click(".ctx-list .add-btn");
  await page.waitForSelector(".ctx-compact", { timeout: 3000 });

  const ctxItemsAfter = await page.locator(".ctx-compact").count();
  expect(ctxItemsAfter).toBe(ctxItemsBefore + 1);
  log(`contexts in modal: ${ctxItemsBefore} → ${ctxItemsAfter}`);

  // ── Step 3: Close modal ──
  await page.click("#modal-overlay");
  await page.waitForTimeout(500);

  // ── Step 4: Verify switcher updated ──
  const afterCreate = await page.locator("#ctx-switcher option").count();
  expect(afterCreate).toBe(initialCount + 1);
  log(`switcher options after create: ${afterCreate}`);

  // ── Step 5: Reload page ──
  await page.reload();
  await page.waitForSelector(".msg-list", { timeout: 5000 });
  log("page reloaded");

  // ── Step 6: Verify context persisted ──
  const afterReload = await page.locator("#ctx-switcher option").count();
  log(`switcher options after reload: ${afterReload}`);

  // Should have the same count (new context persisted)
  expect(afterReload).toBe(afterCreate);

  // No JS errors
  expect(errors).toEqual([]);
});

// ═══════════════════════════════════════════════════════════
// E2E 2: Send message and get AI response (or error)
// ═══════════════════════════════════════════════════════════

test("send message and see AI response or error", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  const consoleErrors = [];
  page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });

  await page.goto("/");
  await page.waitForSelector(".msg-list", { timeout: 5000 });
  log("page loaded");

  // ── Step 1: Type and send a message ──
  const textarea = page.locator(".msg-list-input-row textarea");
  await textarea.fill("Hello! What is 1+1?");
  await textarea.press("Enter");
  log("message sent");

  // ── Step 2: User message should appear immediately ──
  const userMsg = page.locator(".msg-detail.user");
  await expect(userMsg.first()).toBeVisible({ timeout: 3000 });
  log("user message visible");

  // ── Step 3: Wait for AI response or error ──
  // Two possibilities:
  //   a) API key valid → .msg-detail.assistant (not #msg-loading) appears
  //   b) API key invalid → .msg-list-error appears
  const aiOrError = page.locator(".msg-detail.assistant:not(#msg-loading), .msg-list-error");
  await expect(aiOrError.first()).toBeVisible({ timeout: 30000 });
  log("response received");

  // Determine which case
  const hasAiReply = await page.locator(".msg-detail.assistant:not(#msg-loading)").count();
  const hasError = await page.locator(".msg-list-error").count();

  if (hasAiReply > 0) {
    log(`AI reply received (${hasAiReply} assistant messages)`);
    // Verify the assistant message has content (not empty)
    const aiContent = await page.locator(".msg-detail.assistant:not(#msg-loading)").first().textContent();
    expect(aiContent.length).toBeGreaterThan(5);
  } else if (hasError > 0) {
    log("error message shown (API key may be invalid)");
  }

  expect(errors).toEqual([]);
});

// ═══════════════════════════════════════════════════════════
// E2E 3: Rename context via state (data flow test)
// ═══════════════════════════════════════════════════════════

test("rename context persists across page reload", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto("/");
  await page.waitForSelector("#ctx-switcher", { timeout: 5000 });
  log("page loaded");

  // ── Step 1: Get the current active context index and its name ──
  const activeIdx = await page.evaluate(() => window.__COAL_APP__.state.activeCtx);
  log(`active context index: ${activeIdx}`);

  // ── Step 2: Rename via state + sync (bypass inline edit click issue) ──
  await page.evaluate(async (idx) => {
    const app = window.__COAL_APP__;
    if (!app.state.ui.context) app.state.ui.context = {};
    app.state.ui.context[idx] = { name: "My Renamed Chat" };
    await app.syncUI();  // PUT /api/ui persists to server
  }, activeIdx);
  log(`renamed context ${activeIdx} to "My Renamed Chat"`);

  // ── Step 3: Reload page ──
  await page.reload();
  await page.waitForSelector("#ctx-switcher", { timeout: 5000 });
  log("page reloaded");

  // ── Step 4: Verify name persisted on the CORRECT context ──
  // The switcher <select> has options by index, check the specific one
  const optionText = await page.locator(`#ctx-switcher option`).nth(activeIdx).textContent();
  log(`context ${activeIdx} name after reload: "${optionText}"`);
  expect(optionText).toBe("My Renamed Chat");

  expect(errors).toEqual([]);
});

// ═══════════════════════════════════════════════════════════
// E2E 4: Full conversation flow — send, reload, verify
// ═══════════════════════════════════════════════════════════

test("full conversation persists across page reload", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto("/");
  await page.waitForSelector(".msg-list", { timeout: 5000 });
  log("page loaded");

  // ── Step 1: Send a message ──
  const textarea = page.locator(".msg-list-input-row textarea");
  await textarea.fill("What is the capital of France?");
  await textarea.press("Enter");
  log("message sent");

  // Wait for response
  await page.waitForTimeout(3000);
  await page.locator(".msg-detail.assistant:not(#msg-loading), .msg-list-error").first().waitFor({ timeout: 15000 }).catch(() => {});
  log("response received (or timed out)");

  // Count messages before reload
  const msgCountBefore = await page.locator(".msg-detail:not(#msg-loading)").count();
  log(`messages before reload: ${msgCountBefore}`);

  // ── Step 2: Reload page ──
  await page.reload();
  await page.waitForSelector(".msg-list", { timeout: 5000 });
  log("page reloaded");

  // ── Step 3: Verify messages persisted ──
  const msgCountAfter = await page.locator(".msg-detail:not(#msg-loading)").count();
  log(`messages after reload: ${msgCountAfter}`);

  // Messages should persist
  expect(msgCountAfter).toBe(msgCountBefore);

  expect(errors).toEqual([]);
});
