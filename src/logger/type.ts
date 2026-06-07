export type Level = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  time: string;
  level: Level;
  tag?: string;
  message: string;
  data?: unknown;
}
