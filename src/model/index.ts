import { config } from "../config/index.js";
import type { ToolCall } from "../types/index.js";
import type { Context } from "../context/index.js";
import { logger } from "../logger/index.js";

type ThinkingEffort = "high" | "max";

interface ThinkingConfig {
  type: "enabled";
  reasoning_effort: ThinkingEffort;
}

interface DeepSeekMessage {
  role: string;
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

interface DeepSeekResponse {
  choices: Array<{
    message: {
      content: string | null;
      tool_calls?: ToolCall[];
    };
  }>;
}

export class Model {
  private modelName: string;
  private temp: number;
  private maxTok: number;
  private topPVal: number | null;
  private stopSeq: string[] | null;
  private thinkingCfg: ThinkingConfig | { type: "disabled" } | null;
  private ctx: Context | null;

  constructor(options?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  }) {
    this.modelName = options?.model ?? config.defaults.model;
    this.temp = options?.temperature ?? config.defaults.temperature;
    this.maxTok = options?.maxTokens ?? config.defaults.maxTokens;
    this.topPVal = null;
    this.stopSeq = null;
    this.thinkingCfg = null;
    this.ctx = null;
  }

  model(name: string): this {
    this.modelName = name;
    return this;
  }

  thinking(effort: ThinkingEffort = "high"): this {
    this.thinkingCfg = { type: "enabled", reasoning_effort: effort };
    return this;
  }

  noThinking(): this {
    this.thinkingCfg = { type: "disabled" };
    return this;
  }

  temperature(t: number): this {
    this.temp = t;
    return this;
  }

  maxTokens(n: number): this {
    this.maxTok = n;
    return this;
  }

  topP(p: number): this {
    this.topPVal = p;
    return this;
  }

  stop(sequences: string[]): this {
    this.stopSeq = sequences;
    return this;
  }

  context(ctx: Context): this {
    this.ctx = ctx;
    return this;
  }

  async ask(
    userMessage?: string
  ): Promise<{ content: string | null; tool_calls?: ToolCall[] }> {
    // If called with a string, append it as a user message to context
    if (userMessage !== undefined) {
      if (!this.ctx) {
        throw new Error(
          "Model has no context. Call model.context(ctx) first."
        );
      }
      this.ctx.user(userMessage);
    }

    // Resolve messages and tools from context (or fallback for direct mode)
    let messages: DeepSeekMessage[];
    let tools: unknown;
    let toolChoice: unknown;

    if (this.ctx) {
      messages = this.ctx.messages as DeepSeekMessage[];
      tools = this.ctx.getTools();
      toolChoice = this.ctx.getToolChoice();
    } else {
      throw new Error(
        "No input provided. Either call ask('message') with a string, or set a context via model.context(ctx)."
      );
    }

    const apiKey = config.api.apiKey;
    if (!apiKey) {
      throw new Error("DEEPSEEK_API_KEY is not set");
    }

    const body: Record<string, unknown> = {
      model: this.modelName,
      messages,
      temperature: this.temp,
      max_tokens: this.maxTok,
    };

    if (this.topPVal !== null) body.top_p = this.topPVal;
    if (this.stopSeq !== null) body.stop = this.stopSeq;
    if (this.thinkingCfg !== null) body.thinking = this.thinkingCfg;
    if (tools) body.tools = tools;
    if (toolChoice) body.tool_choice = toolChoice;

    logger.info(`ask() → ${this.modelName}`, {
      msgCount: messages.length,
      temperature: this.temp,
      maxTokens: this.maxTok,
      hasTools: tools != null,
      hasThinking: this.thinkingCfg !== null,
    });

    const startTime = Date.now();
    const response = await fetch(config.api.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error(`API error ${response.status}`, { errorBody });
      throw new Error(
        `DeepSeek API error (${response.status}): ${errorBody}`
      );
    }

    const data = (await response.json()) as DeepSeekResponse;
    const msg = data.choices[0].message;
    const elapsed = Date.now() - startTime;

    logger.info(`ask() ← ${elapsed}ms`, {
      hasContent: msg.content !== null,
      contentLen: msg.content?.length ?? 0,
      toolCalls: msg.tool_calls?.map((t) => t.function.name),
    });

    const result = {
      content: msg.content,
      tool_calls: msg.tool_calls,
    };

    // Auto-append assistant response to context
    if (this.ctx) {
      this.ctx.assistant(result.content, result.tool_calls);
    }

    return result;
  }
}
