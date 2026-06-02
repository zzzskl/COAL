import { readdirSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import type { ToolDef } from "../types/index.js";

export type ToolFn = (args: Record<string, unknown>) => string;

function resolvePath(raw: string): string {
  let p = raw.trim();
  if (p.startsWith("~")) {
    p = homedir() + p.slice(1);
  }
  return resolve(p);
}

export function listDirectory(path: string): string[] {
  return readdirSync(resolvePath(path));
}

export function printDirectory(path: string): void {
  const files = listDirectory(path);
  console.log(`\n${path}/`);
  if (files.length === 0) {
    console.log("  (empty)");
    return;
  }
  for (const f of files) {
    console.log(`  ${f}`);
  }
  console.log(`\n${files.length} file(s)`);
}

export const toolDefs: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "list_directory",
      description:
        "List all filenames (files and subdirectories) in a given directory path. Returns a JSON array of filename strings.\n\n" +
        "PATH RULES:\n" +
        "- Use absolute Windows paths like C:\\Users\\f\\Desktop or relative paths like ./src\n" +
        '- Forward slashes (/) are accepted and will be normalized (e.g. C:/Users/f/Desktop works)\n' +
        '- ~/ at the start of a path will be expanded to the current user home directory\n' +
        "- Do NOT use shell-specific patterns like ~username/other — only ~/ at the beginning is supported\n" +
        "- Relative paths are resolved against the server's current working directory\n\n" +
        "EXAMPLES of valid paths:\n" +
        '- "." — current working directory\n' +
        '- "./src" — src subdirectory relative to CWD\n' +
        '- "C:/Users/f/Desktop" — absolute Windows path to Desktop\n' +
        '- "~/Desktop" — user home directory + Desktop\n' +
        '- "~/Documents" — user home directory + Documents\n\n' +
        "BEHAVIOR:\n" +
        "- On success: returns JSON array like [\"file1.txt\",\"subdir\",\"file2.js\"]\n" +
        "- On error (directory not found, permission denied, etc.): returns {\"error\":\"...\"} with the error message\n" +
        "- Empty directories return []",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description:
              "Directory path to list. Supports: absolute Windows paths (C:\\Users\\...), " +
              "relative paths (./src, ..), and ~/ for home directory. " +
              'For the user\'s Desktop try "~/Desktop". For the current directory try ".".',
          },
        },
        required: ["path"],
      },
    },
  },
];

export function getBuiltinToolDefs(): ToolDef[] {
  return toolDefs;
}

export const registry: Record<string, ToolFn> = {
  list_directory: (args) => {
    try {
      const files = listDirectory(args.path as string);
      return JSON.stringify(files);
    } catch (err) {
      return JSON.stringify({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },
};
