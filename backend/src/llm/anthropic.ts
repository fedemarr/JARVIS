import Anthropic from '@anthropic-ai/sdk';
import { LlmProvider, LlmMessage, LlmEvent, LlmToolCall, ToolDefinition } from '../../../shared/llm';

export class AnthropicLlmProvider implements LlmProvider {
  private anthropic: Anthropic;
  private modelName: string;

  constructor(apiKey: string, modelName: string) {
    // Anthropic SDK can be initialized without an API key, but calls will fail.
    // The prompt says "dejala completa y funcional, sin key configurada."
    this.anthropic = new Anthropic({ apiKey: apiKey || 'dummy-key' });
    this.modelName = modelName;
  }

  async *stream(opts: {
    system: string;
    messages: LlmMessage[];
    tools: ToolDefinition[];
  }): AsyncIterable<LlmEvent> {
    const anthropicMessages = this.mapLlmMessagesToAnthropic(opts.messages);
    const anthropicTools = this.mapToolDefinitionsToAnthropic(opts.tools);

    try {
      const stream = this.anthropic.messages.stream({
        model: this.modelName,
        system: opts.system,
        messages: anthropicMessages,
        tools: anthropicTools.length > 0 ? anthropicTools : undefined,
        max_tokens: 4096, // A reasonable default
      });

      let toolCallsBuffer: LlmToolCall[] = [];
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
        } else if (chunk.type === 'message_delta') {
          stopReason = chunk.delta.stop_reason as string | null;
        } else if (chunk.type === 'message_stop') {
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
      if (toolCallsBuffer.length > 0) {
        yield { type: 'tool_calls', calls: toolCallsBuffer };
        yield { type: 'end', reason: 'tool_calls' };
      } else {
        yield { type: 'end', reason: 'stop' };
      }

    } catch (error: any) {
      console.error('Anthropic streaming error:', error);
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
        for (const result of msg.results) {
          anthropicMessages.push({
            role: 'user', // Tool results are sent back as user messages
            content: [{
              type: 'tool_result',
              tool_use_id: result.id,
              content: result.content,
            }],
          });
        }
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