export type LlmRole = 'user' | 'assistant' | 'tool';

export interface LlmToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  thoughtSignature?: string;
}
export interface LlmToolResult { id: string; name: string; ok: boolean; content: string; }

export type LlmMessage =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text?: string; toolCalls?: LlmToolCall[] }
  | { role: 'tool'; results: LlmToolResult[] };

export type LlmEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool_calls'; calls: LlmToolCall[] }
  | { type: 'end'; reason: 'stop' | 'tool_calls' | 'max_tokens' }
  | { type: 'error'; message: string };

// ToolDefinition based on the description in the prompt
export interface ToolDefinition {
  name: string;
  description: string;
  schema: Record<string, unknown>; // This will be a JSON schema representation of the Zod schema
  dangerous?: boolean;
}

export interface LlmProvider {
  stream(opts: {
    system: string;
    messages: LlmMessage[];
    tools: ToolDefinition[];
    signal?: AbortSignal;
  }): AsyncIterable<LlmEvent>;
}
