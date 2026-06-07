// COAL UI Test Framework — minimal in-browser test runner
//
// Usage:
//   import { test, assert, run } from "./lib.js";
//
//   test("component renders", () => {
//     const el = MyComponent({ name: "test" });
//     assert.includes(el.innerHTML, "test");
//   });
//
//   // In your test runner page:
//   import { run } from "./lib.js";
//   await import("./my-test.js");
//   const results = await run();
//   renderResults(results);

const _tests = [];

export function test(name, fn) {
  _tests.push({ name, fn });
}

export const assert = {
  ok(condition, message) {
    if (!condition) {
      throw new Error(message || `Expected truthy, got ${condition}`);
    }
  },
  equal(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(
        message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
      );
    }
  },
  includes(haystack, needle, message) {
    if (typeof haystack !== "string" || !haystack.includes(needle)) {
      throw new Error(
        message || `Expected "${String(haystack).slice(0, 100)}" to include "${needle}"`
      );
    }
  },
  notIncludes(haystack, needle, message) {
    if (typeof haystack === "string" && haystack.includes(needle)) {
      throw new Error(
        message || `Expected "${String(haystack).slice(0, 100)}" to NOT include "${needle}"`
      );
    }
  },
};

export async function run() {
  const results = [];
  for (const { name, fn } of _tests) {
    const start = performance.now();
    try {
      await fn();
      results.push({ name, passed: true, error: null, duration: performance.now() - start });
    } catch (err) {
      results.push({
        name,
        passed: false,
        error: err instanceof Error ? err : new Error(String(err)),
        duration: performance.now() - start,
      });
    }
  }
  return results;
}
