import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { Context } from "../../context/core/index.js";
import type { User, Config } from "../../types/index.js";
import { Model } from "../../model/core/index.js";
import { registry, getBuiltinToolDefs } from "../../tools/core/index.js";
import { executePendingTools } from "../../executor/core/index.js";
import { logger } from "../../logger/core/index.js";

export const DATA_DIR = resolve(process.cwd(), "data", "users");

export interface UserEntry {
  userData: User;
  contexts: Context[];
}

function userDir(user: string) { return resolve(DATA_DIR, user); }
function userDataPath(user: string) { return resolve(userDir(user), "data.json"); }

function ensureDir(p: string) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

function atomicWrite(filePath: string, data: string) {
  const tmp = filePath + ".tmp";
  ensureDir(dirname(filePath));
  writeFileSync(tmp, data, "utf-8");
  renameSync(tmp, filePath);
}

function createDefaultUser(): { userData: User; contexts: Context[] } {
  const defaultCfg: Config = {
    name: "Default",
    model: "deepseek-v4-flash",
    temperature: 0.7,
    maxTokens: 4096,
    topP: 1,
    thinking: "disabled",
    stop: [],
    autoExecute: false,
  };
  const defaultCtx = new Context();
  const userData: User = {
    version: 1,
    configs: [defaultCfg],
    activeCfg: 0,
    contexts: [defaultCtx.toJSON()],
    activeCtx: 0,
    ui: { collapsed: {}, context: { 0: { name: "Chat 1" } } },
  };
  return { userData, contexts: [defaultCtx] };
}

function readUserData(user: string): User | null {
  const p = userDataPath(user);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, "utf-8")) as User; }
  catch { return null; }
}

export function writeUserData(user: string, data: User, contexts: Context[]) {
  const payload = { ...data, contexts: contexts.map(c => c.toJSON()) };
  atomicWrite(userDataPath(user), JSON.stringify(payload, null, 2));
}

export const userCache = new Map<string, UserEntry>();

export function loadUser(userName: string): UserEntry {
  const cached = userCache.get(userName);
  if (cached) return cached;

  const raw = readUserData(userName);
  if (raw) {
    const r = raw as any;
    if (!r.ui) r.ui = { collapsed: {}, context: {} };
    if (!r.ui.context) r.ui.context = {};
    for (let i = 0; i < r.contexts.length; i++) {
      if (r.contexts[i]?.name && !r.ui.context[i]) {
        r.ui.context[i] = { name: r.contexts[i].name };
      }
      delete r.contexts[i]?.name;
    }
    const entry: UserEntry = {
      userData: raw,
      contexts: raw.contexts.map((c: any) => Context.fromJSON(c)),
    };
    userCache.set(userName, entry);
    return entry;
  }

  const entry = createDefaultUser();
  userCache.set(userName, entry);
  return entry;
}

export function buildModel(ctx: Context, cfg?: Config): Model {
  const m = new Model().context(ctx);
  if (cfg) {
    if (cfg.model) m.model(cfg.model);
    if (cfg.temperature !== undefined) m.temperature(cfg.temperature);
    if (cfg.maxTokens !== undefined) m.maxTokens(cfg.maxTokens);
    if (cfg.topP !== undefined) m.topP(cfg.topP);
    if (cfg.stop) m.stop(cfg.stop);
    if (cfg.thinking === "disabled") {
      m.noThinking();
    } else if (cfg.thinking && typeof cfg.thinking === "object" && "effort" in cfg.thinking) {
      m.thinking((cfg.thinking as { effort: "high" | "max" }).effort);
    }
  }
  return m;
}

export function resolveUser(req: any, _res: any, next: any) {
  const userName = (req.headers["x-user"] as string) || "default";
  req.userName = userName;
  req.user = loadUser(userName);
  req.sessionId = req.headers["x-session-id"] ?? "none";
  next();
}

export { executePendingTools, registry, getBuiltinToolDefs, logger };
