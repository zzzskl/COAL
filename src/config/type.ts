/** 一个配置预设。包含全部模型参数。 */
export interface Config {
  name: string;
  model: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  thinking: "disabled" | { effort: "high" | "max" };
  stop: string[];
  autoExecute: boolean;
}
