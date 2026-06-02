import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Auto-load .env file if present
function loadEnv() {
  try {
    const envPath = resolve(process.cwd(), ".env");
    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  } catch {
    // .env file not found or unreadable — that's fine
  }
}
loadEnv();

interface ApiConfig {
  baseUrl: string;
  apiKey: string;
}

interface DefaultsConfig {
  model: string;
  temperature: number;
  maxTokens: number;
}

export interface CoalConfig {
  api: ApiConfig;
  defaults: DefaultsConfig;
}

function resolveEnv(value: string): string {
  return value.replace(/\$\{(\w+)\}/g, (_, name) => process.env[name] ?? "");
}

function loadConfig(): CoalConfig {
  const configPath = resolve(process.cwd(), "coal.config.json");
  const raw = readFileSync(configPath, "utf-8");
  const resolved = resolveEnv(raw);
  return JSON.parse(resolved) as CoalConfig;
}

export const config: CoalConfig = loadConfig();
