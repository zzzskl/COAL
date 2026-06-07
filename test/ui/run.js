// Node runner for UI component tests.
// Sets up DOM via linkedom, runs test suite, prints results.

import { parseHTML } from "linkedom";
import { ContextCompact, ContextList, ContextDetail } from "../../ui/public/js/components/context/context.js";
import { registerContextTests } from "./context.spec.js";

// ── Setup global DOM ──────────────────────────────────────────

const { document, window } = parseHTML("<!DOCTYPE html><html><body></body></html>");
global.document = document;
global.window = window;
global.self = window;
global.CustomEvent = window.CustomEvent;

// Polyfill: linkedom does not implement HTMLInputElement.prototype.select
if (global.window.HTMLInputElement && !global.window.HTMLInputElement.prototype.select) {
  global.window.HTMLInputElement.prototype.select = function () {
    // no-op: select() is a visual helper in browsers, not needed for test logic
  };
}

// Polyfill: linkedom may not implement KeyboardEvent
if (typeof global.KeyboardEvent !== 'function') {
  class KeyboardEvent extends Event {
    constructor(type, opts = {}) {
      super(type, opts);
      this.key = opts.key || '';
    }
  }
  global.KeyboardEvent = KeyboardEvent;
}

// Polyfill: Node's native Event has read-only getters for eventPhase,
// currentTarget, and target. linkedom's dispatchEvent tries to set
// these during dispatch. Replace them with writable versions.
for (const prop of ["eventPhase", "currentTarget", "target"]) {
  const desc = Object.getOwnPropertyDescriptor(Event.prototype, prop);
  if (desc && desc.get && !desc.set) {
    const storage = "_" + prop;
    Object.defineProperty(Event.prototype, prop, {
      get() { return this[storage] ?? (prop === "eventPhase" ? 0 : null); },
      set(v) { this[storage] = v; },
      configurable: true,
      enumerable: true,
    });
  }
}

// Polyfill: ensure _path is initialized before dispatchEvent runs.
// linkedom's dispatchEvent pushes to event._path but native Event
// doesn't have this property.
const OrigEventTarget = global.window.EventTarget || EventTarget;
const origDispatchEvent = OrigEventTarget.prototype.dispatchEvent;
OrigEventTarget.prototype.dispatchEvent = function (event) {
  if (!event._path) event._path = [];
  return origDispatchEvent.call(this, event);
};

// ── Bootstrap the same test framework used in browser ─────────

const _tests = [];

function test(name, fn) {
  _tests.push({ name, fn });
}

const assert = {
  ok(condition, message) {
    if (!condition) throw new Error(message || `Expected truthy, got ${condition}`);
  },
  equal(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  },
  includes(haystack, needle, message) {
    if (typeof haystack !== "string" || !haystack.includes(needle)) {
      throw new Error(message || `Expected "${String(haystack).slice(0, 100)}" to include "${needle}"`);
    }
  },
};

async function run() {
  const results = [];
  for (const { name, fn } of _tests) {
    try {
      await fn();
      results.push({ name, passed: true, error: null });
    } catch (err) {
      results.push({ name, passed: false, error: err instanceof Error ? err : new Error(String(err)) });
    }
  }
  return results;
}

// ── Register and run tests ────────────────────────────────────

registerContextTests({ test, assert, ContextCompact, ContextList, ContextDetail });

const results = await run();

// ── Report ────────────────────────────────────────────────────

let passed = 0, failed = 0;
for (const r of results) {
  const icon = r.passed ? "✓" : "✗";
  if (r.passed) passed++; else failed++;
  console.log(`  ${icon} ${r.name}`);
  if (r.error) {
    // Indent error message for readability
    console.log(`       ${r.error.message.split("\n").join("\n       ")}`);
  }
}
console.log(`\n  Results: ${passed} passed, ${failed} failed, ${results.length} total`);
if (failed > 0) process.exit(1);
