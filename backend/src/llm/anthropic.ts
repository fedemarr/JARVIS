import Anthropic from '@anthropic-ai/sdk';
import { LlmProvider, LlmMessage, LlmEvent, LlmToolCall, ToolDefinition } from '../../../shared/llm';

export class AnthropicLlmProvider implements LlmProvider {
  private anthropic: Anthropic;
  private modelName: string;

  constructor(apiKey: string, modelName: string) {
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set.');
    this.anthropic = new Anthropic({ apiKey, maxRetries: 0 });
    this.modelName = modelName;
  }

  async *stream(opts: {
    system: string;
    messages: LlmMessage[];
    tools: ToolDefinition[];
    signal?: AbortSignal;
  }): AsyncIterable<LlmEvent> {
    const anthropicMessages = this.mapLlmMessagesToAnthropic(opts.messages);
    const anthropicTools = this.mapToolDefinitionsToAnthropic(opts.tools);

    try {
      const stream = this.anthropic.messages.stream({
        model: this.modelName,
        system: opts.system,
        messages: anthropicMessages,
        tools: anthropicTools.length > 0 ? anthropicTools : undefined,
        max_tokens: Math.min(4096, Math.max(128, Number(process.env.LLM_MAX_OUTPUT_TOKENS) || 1024)),
      }, { signal: opts.signal });

      let toolCallsBuffer: LlmToolCall[] = [];
      const toolsByIndex = new Map<number, LlmToolCall>();
      const partialInputs = new Map<number, string>();
      let ended = false;
      let stopReason: string | null | undefined;

      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          yield { type: 'text', delta: chunk.delta.text };
        } else if (chunk.type === 'content_block_start' && chunk.content_block.type === 'tool_use') {
          const toolCall: LlmToolCall = {
            id: chunk.content_block.id,
            name: chunk.content_block.name,
            args: (chunk.content_block.input ?? {}) as Record<string, unknown>,
          };
          toolCallsBuffer.push(toolCall);
          toolsByIndex.set(chunk.index, toolCall);
        } else if (chunk.type === 'content_block_delta' && chunk.delta.type === 'input_json_delta') {
          partialInputs.set(chunk.index, (partialInputs.get(chunk.index) || '') + chunk.delta.partial_json);
        } else if (chunk.type === 'content_block_stop' && toolsByIndex.has(chunk.index)) {
          const input = partialInputs.get(chunk.index);
          if (input) {
            const parsed = JSON.parse(input);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Claude devolvió argumentos de herramienta inválidos.');
            toolsByIndex.get(chunk.index)!.args = parsed;
          }
        } else if (chunk.type === 'message_delta') {
          stopReason = chunk.delta.stop_reason as string | null;
        } else if (chunk.type === 'message_stop') {
          ended = true;
          if (stopReason === 'tool_use' && toolCallsBuffer.length > 0) {
            yield { type: 'tool_calls', calls: toolCallsBuffer };
            toolCallsBuffer = []; // Clear buffer after emitting
            yield { type: 'end', reason: 'tool_calls' };
          } else {
            yield { type: 'end', reason: 'stop' };
          }
        }
      }
      // If stream ends without a message_stop chunk (e.g., due to an error or unexpected end)
      if (!ended && toolCallsBuffer.length > 0) {
        yield { type: 'tool_calls', calls: toolCallsBuffer };
        yield { type: 'end', reason: 'tool_calls' };
      } else if (!ended) {
        yield { type: 'end', reason: 'stop' };
      }

    } catch (error: any) {
      console.error('Anthropic streaming error:', error.status || error.name);
      yield { type: 'error', message: error.message || 'An unknown error occurred with Anthropic.' };
    }
  }

  private mapLlmMessagesToAnthropic(messages: LlmMessage[]): Anthropic.Messages.MessageParam[] {
    const anthropicMessages: Anthropic.Messages.MessageParam[] = [];

    for (const msg of messages) {
      if (msg.role === 'user') {
        anthropicMessages.push({
          role: 'user',
          content: msg.text,
        });
      } else if (msg.role === 'assistant') {
        const contentBlocks: Anthropic.Messages.MessageParam['content'] = [];
        if (msg.text) {
          contentBlocks.push({ type: 'text', text: msg.text });
        }
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          for (const toolCall of msg.toolCalls) {
            contentBlocks.push({
              type: 'tool_use',
              id: toolCall.id,
              name: toolCall.name,
              input: toolCall.args,
            });
          }
        }
        if (contentBlocks.length > 0) {
          anthropicMessages.push({
            role: 'assistant',
            content: contentBlocks,
          });
        }
      } else if (msg.role === 'tool') {
        anthropicMessages.push({
          role: 'user',
          content: msg.results.map((result) => ({
              type: 'tool_result',
              tool_use_id: result.id,
              content: result.content,
              is_error: !result.ok,
          })),
        });
      }
    }
    return anthropicMessages;
  }

  private mapToolDefinitionsToAnthropic(tools: ToolDefinition[]): Anthropic.Tool[] {
    return tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.schema as Anthropic.Tool['input_schema'],
    }));
  }
}
