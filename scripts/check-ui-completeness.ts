import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const METHODS = [
  ["system", 1], ["user", 1], ["assistant", 1],
  ["toolResult", 1], ["removeAt", 1], ["updateAt", 1],
  ["setTools", 1], ["getTools", 1],
  ["setToolChoice", 1], ["getToolChoice", 1],
  ["clear", 1],
  ["constructor", 0], ["add", 0], ["toJSON", 0], ["fromJSON", 0],
];

const FILES = [
  "ui/public/js/components/context/context.vue.js",
  "ui/public/js/components/message/message.vue.js",
  "ui/public/js/components/config/config.vue.js",
  "ui/public/js/components/tool/tool.vue.js",
  "ui/public/js/main.js",
];

function getPatterns(method) {
  if (method === "toolResult") return ["toolResult", "tool_call_id"];
  if (method === "setTools") return ["setTools", "addBuiltin", "removeTool"];
  if (method === "getTools") return ["getTools", "refreshToolsBadge", "tools-badge"];
  if (method === "setToolChoice") return ["setToolChoice", "localToolChoice", "toolChoice"];
  if (method === "getToolChoice") return ["getToolChoice", "localToolChoice", "toolChoice"];
  if (method === "clear") return ["clear", "handleClear"];
  if (method === "removeAt") return ["removeAt", "deleteMsg"];
  if (method === "updateAt") return ["updateAt", "editMsg", "saveEdit"];
  return [method];
}

function main() {
  let ok = 0;
  let req = 0;

  for (const entry of METHODS) {
    const method = entry[0];
    const required = entry[1];
    const pats = getPatterns(method);
    let files = [];

    for (const rel of FILES) {
      const fp = resolve(ROOT, rel);
      if (!existsSync(fp)) continue;
      const content = readFileSync(fp, "utf-8");

      let found = false;
      for (const p of pats) {
        if (content.indexOf(p) >= 0) {
          found = true;
          break;
        }
      }
      if (found) files.push(rel.replace("ui/public/js/", ""));
    }

    const mapped = files.length > 0;
    if (required) {
      req++;
      if (mapped) ok++;
    }
    console.log("  " + (mapped ? "[OK]" : "[MISSING]") + " " + method + (mapped ? " -> " + files.join(", ") : ""));
  }

  console.log("\n" + ok + "/" + req + " required methods mapped");
  const pass = ok === req;
  console.log(pass ? "ALL PASS" : "FAIL: " + (req - ok) + " missing");
  return pass ? 0 : 1;
}

process.exit(main());
