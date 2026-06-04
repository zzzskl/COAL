import type { Message, Role, ToolCall, ToolDef, ToolChoice } from "../types/index.js";

export type { Message, Role, ToolCall, ToolDef, ToolChoice };

export class Context {
  private _name: string;
  private _messages: Message[];
  private _tools: ToolDef[] | null;
  private _toolChoice: ToolChoice | null;

  constructor(systemPrompt?: string) {
    this._name = "Unnamed";
    this._messages = [];
    this._tools = null;
    this._toolChoice = null;
    if (systemPrompt !== undefined) {
      this.system(systemPrompt);
    }
  }

  get name(): string { return this._name; }
  setName(name: string): this { this._name = name; return this; }

  get messages(): ReadonlyArray<Message> {
    return this._messages;
  }

  system(content: string): this {
    const existing = this._messages.findIndex((m) => m.role === "system");
    if (existing !== -1) {
      this._messages[existing] = { role: "system", content };
    } else {
      this._messages.unshift({ role: "system", content });
    }
    return this;
  }

  user(content: string): this {
    this._messages.push({ role: "user", content });
    return this;
  }

  assistant(content: string | null, toolCalls?: ToolCall[]): this {
    const msg: Message = { role: "assistant", content };
    if (toolCalls && toolCalls.length > 0) {
      (msg as any).tool_calls = toolCalls;
    }
    this._messages.push(msg);
    return this;
  }

  toolResult(toolCallId: string, content: string): this {
    this._messages.push({
      role: "tool",
      content,
      tool_call_id: toolCallId,
    });
    return this;
  }

  add(
    role: Role,
    content: string,
    extra?: { toolCallId?: string; toolCalls?: ToolCall[] }
  ): this {
    if (role === "system") {
      return this.system(content);
    }
    if (role === "assistant" && extra?.toolCalls) {
      return this.assistant(content, extra.toolCalls);
    }
    if (role === "tool") {
      return this.toolResult(extra?.toolCallId ?? "", content);
    }
    this._messages.push({ role, content } as Message);
    return this;
  }

  removeAt(index: number): this {
    if (index >= 0 && index < this._messages.length) {
      this._messages.splice(index, 1);
    }
    return this;
  }

  updateAt(
    index: number,
    role: Role,
    content: string,
    extra?: { toolCallId?: string; toolCalls?: ToolCall[] }
  ): this {
    if (index < 0 || index >= this._messages.length) return this;

    let msg: Message;
    if (role === "system" || role === "user") {
      msg = { role, content } as Message;
    } else if (role === "assistant") {
      msg = { role: "assistant", content } as Message;
      if (extra?.toolCalls) {
        (msg as any).tool_calls = extra.toolCalls;
      }
    } else {
      msg = {
        role: "tool",
        content,
        tool_call_id: extra?.toolCallId ?? "",
      } as Message;
    }
    this._messages[index] = msg;
    return this;
  }

  setTools(defs: ToolDef[]): this {
    this._tools = defs;
    return this;
  }

  getTools(): ToolDef[] | null {
    return this._tools;
  }

  setToolChoice(choice: ToolChoice): this {
    this._toolChoice = choice;
    return this;
  }

  getToolChoice(): ToolChoice | null {
    return this._toolChoice;
  }

  clear(): this {
    this._messages = [];
    this._tools = null;
    this._toolChoice = null;
    return this;
  }

  toJSON(): { name: string; messages: Message[]; tools?: ToolDef[]; toolChoice?: ToolChoice } {
    const result: { name: string; messages: Message[]; tools?: ToolDef[]; toolChoice?: ToolChoice } = {
      name: this._name,
      messages: this._messages as Message[],
    };
    if (this._tools) result.tools = this._tools;
    if (this._toolChoice) result.toolChoice = this._toolChoice;
    return result;
  }

  static fromJSON(json: { name?: string; messages: Message[]; tools?: ToolDef[]; toolChoice?: ToolChoice }): Context {
    const ctx = new Context();
    ctx._name = json.name ?? "Unnamed";
    ctx._messages = json.messages;
    if (json.tools) ctx._tools = json.tools;
    if (json.toolChoice) ctx._toolChoice = json.toolChoice;
    return ctx;
  }
}
