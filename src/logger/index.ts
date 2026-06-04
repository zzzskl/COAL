import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";

type Level = "debug" | "info" | "warn" | "error";

interface LogEntry {
  time: string;
  level: Level;
  tag?: string;
  message: string;
  data?: unknown;
}

class Logger {
  private entries: LogEntry[] = [];
  private maxEntries = 200;
  private readonly filePath = resolve(process.cwd(), "data", "coal.log");

  private format(level: Level, message: string, data?: unknown, tag?: string): LogEntry {
    return {
      time: new Date().toISOString(),
      level,
      tag,
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
    const prefix = `[${entry.time}] ${entry.level.toUpperCase()}${entry.tag ? ` [${entry.tag}]` : ""}`;
    const extra =
      entry.data !== undefined ? ` ${JSON.stringify(entry.data)}` : "";
    console.log(`${prefix} ${entry.message}${extra}`);
    this.writeToFile(entry);
  }

  interaction(message: string, data?: unknown) {
    this.write(this.format("info", message, data, "chat"));
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
