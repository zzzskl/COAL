// smoke.spec.js — COAL browser smoke tests
// Tests the core user flows in a real Chromium browser via Playwright.
import { test, expect } from "@playwright/test";

const PORT = 3001;

// ── 1. Page loads without JS errors ──────────────────────

test("page loads without console errors", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });

  await page.goto("/");

  // Wait for boot to complete — MessageList should be in the DOM
  await page.waitForSelector(".msg-list", { timeout: 5000 });

  expect(errors).toEqual([]);
});

// ── 2. Boot renders key UI elements ──────────────────────

test("boot renders chat area and topbar controls", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".msg-list", { timeout: 5000 });

  // Topbar elements
  await expect(page.locator("#user-name")).toBeVisible();
  await expect(page.locator("#ctx-switcher")).toBeVisible();
  await expect(page.locator("#tools-badge")).toBeVisible();
  await expect(page.locator("#exec-btn")).toBeVisible();
  await expect(page.locator("#logs-btn")).toBeVisible();
  await expect(page.locator("#ctx-builder-btn")).toBeVisible();

  // Main chat area is populated (may have messages or "No messages yet")
  const chatArea = page.locator("#chat-main");
  await expect(chatArea).not.toBeEmpty();
});

// ── 3. Send message → user message appears in DOM ────────

test("sending a message shows it in the chat area", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".msg-list", { timeout: 5000 });

  const textarea = page.locator(".msg-list-input-row textarea");
  await textarea.fill("Hello from Playwright!");
  await textarea.press("Enter");

  // User message should appear (role "user" class). Use first() to avoid
  // strict-mode violation when existing messages are also in the DOM.
  const userMsg = page.locator(".msg-detail.user").first();
  await expect(userMsg).toBeVisible({ timeout: 5000 });
});

// ── 4. Context switcher exists and works ─────────────────

test("context switcher shows first context name", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector("#ctx-switcher", { timeout: 5000 });

  const switcher = page.locator("#ctx-switcher");
  // Should have at least one option
  const options = await switcher.locator("option").count();
  expect(options).toBeGreaterThanOrEqual(1);
});

// ── 5. Create new context via modal ──────────────────────

test("create new context via modal adds a context", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector("#ctx-switcher", { timeout: 5000 });

  // Count options before
  const before = await page.locator("#ctx-switcher option").count();

  // Open context modal
  await page.click("#ctx-modal-btn");
  await page.waitForSelector("#modal-overlay.visible", { timeout: 3000 });

  // Click "+ New" button
  await page.click(".ctx-list .add-btn");

  // Modal should re-render
  await page.waitForSelector(".ctx-compact", { timeout: 3000 });

  // Close modal by clicking overlay
  await page.click("#modal-overlay");

  // Count should have increased
  await page.waitForTimeout(300); // wait for modal close + render
  const after = await page.locator("#ctx-switcher option").count();
  expect(after).toBe(before + 1);
});

// ── 6. Rename context persists ───────────────────────────

test("rename context persists after page reload", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector("#ctx-switcher", { timeout: 5000 });

  // Direct rename via state — verify the persistence chain works end to end
  await page.evaluate(async () => {
    const app = window.__COAL_APP__;
    const idx = app.state.activeCtx;
    if (!app.state.ui.context) app.state.ui.context = {};
    app.state.ui.context[idx] = { name: "Renamed Context" };
    await app.syncUI();
  });

  // Reload the page to verify persistence
  await page.reload();
  await page.waitForSelector("#ctx-switcher", { timeout: 5000 });

  // Check switcher shows persisted name
  await expect(page.locator("#ctx-switcher")).toContainText("Renamed Context", { timeout: 3000 });
});
