import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";

type Level = "debug" | "info" | "warn" | "error";

interface LogEntry {
  time: string;
  level: Level;
  message: string;
  data?: unknown;
}

class Logger {
  private entries: LogEntry[] = [];
  private maxEntries = 200;
  private _filePath: string | null = null;
  private resolved = false;

  private get filePath(): string {
    if (!this.resolved) {
      this.resolved = true;
      this._filePath = this.resolvePath();
    }
    return this._filePath ?? resolve(process.cwd(), "coal.log");
  }

  private resolvePath(): string {
    try {
      const configPath = resolve(process.cwd(), "coal.config.json");
      const raw = readFileSync(configPath, "utf-8");
      const config = JSON.parse(raw);
      if (config.logFile) {
        return resolve(process.cwd(), config.logFile);
      }
    } catch {
      // config not found, use default
    }
    return resolve(process.cwd(), "coal.log");
  }

  private format(level: Level, message: string, data?: unknown): LogEntry {
    return {
      time: new Date().toISOString(),
      level,
      message,
      data,
    };
  }

  private writeToFile(entry: LogEntry) {
    try {
      const dir = dirname(this.filePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      appendFileSync(this.filePath, JSON.stringify(entry) + "\n", "utf-8");
    } catch {
      // file write failed — don't crash, the in-memory log still works
    }
  }

  private write(entry: LogEntry) {
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }
    const prefix = `[${entry.time}] ${entry.level.toUpperCase()}`;
    const extra =
      entry.data !== undefined ? ` ${JSON.stringify(entry.data)}` : "";
    console.log(`${prefix} ${entry.message}${extra}`);
    this.writeToFile(entry);
  }

  debug(message: string, data?: unknown) {
    this.write(this.format("debug", message, data));
  }

  info(message: string, data?: unknown) {
    this.write(this.format("info", message, data));
  }

  warn(message: string, data?: unknown) {
    this.write(this.format("warn", message, data));
  }

  error(message: string, data?: unknown) {
    this.write(this.format("error", message, data));
  }

  getEntries(): ReadonlyArray<LogEntry> {
    return this.entries;
  }

  getRecent(n: number): ReadonlyArray<LogEntry> {
    return this.entries.slice(-n);
  }

  clear() {
    this.entries = [];
  }
}

export const logger = new Logger();
