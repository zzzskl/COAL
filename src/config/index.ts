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

const config: CoalConfig = {
  api: {
    baseUrl: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/v1/chat/completions",
    apiKey: process.env.DEEPSEEK_API_KEY ?? "",
  },
  defaults: {
    model: process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash",
    temperature: parseFloat(process.env.DEEPSEEK_TEMPERATURE ?? "0.7"),
    maxTokens: parseInt(process.env.DEEPSEEK_MAX_TOKENS ?? "4096", 10),
  },
};

export { config };
