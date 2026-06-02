import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { listDirectory } from "../src/tools/index.js";

test("tools — listDirectory lists files in ./src", () => {
  const files = listDirectory("./src");
  assert.ok(Array.isArray(files));
  const names = new Set(files);
  assert.ok(names.has("context"));
  assert.ok(names.has("model"));
  assert.ok(names.has("tools"));
  assert.ok(names.has("types"));
});

test("tools — listDirectory with temp dir", () => {
  const tmpDir = "./test/_tmp_listdir";
  if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });
  writeFileSync(tmpDir + "/a.txt", "a");
  writeFileSync(tmpDir + "/b.txt", "b");

  const files = listDirectory(tmpDir);
  assert.deepEqual(files.sort(), ["a.txt", "b.txt"]);

  rmSync(tmpDir, { recursive: true, force: true });
});

test("tools — listDirectory throws on invalid path", () => {
  assert.throws(() => listDirectory("./nonexistent_xyz"));
});
