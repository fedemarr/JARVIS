import { LlmProvider, LlmMessage, LlmEvent, LlmToolCall, ToolDefinition } from '../../../shared/llm';

import { setTimeout as delay } from 'timers/promises';
const sleep = (ms: number, signal?: AbortSignal) => delay(ms, undefined, { signal });

interface GeminiFunctionCall {
  name: string;
  args?: object;
  id?: string;
}

interface GeminiPart {
  text?: string;
  functionCall?: GeminiFunctionCall;
  thoughtSignature?: string;
}

interface GeminiCandidate {
  content?: { role: string; parts: GeminiPart[] };
  finishReason?: string;
}

interface GeminiChunk {
  candidates?: GeminiCandidate[];
}

export class GeminiLlmProvider implements LlmProvider {
  private apiKey: string;
  private modelName: string;

  constructor(apiKey: string, modelName: string) {
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not set.');
    }
    this.apiKey = apiKey;
    this.modelName = modelName;
  }

  async *stream(opts: {
    system: string;
    messages: LlmMessage[];
    tools: ToolDefinition[];
    signal?: AbortSignal;
  }): AsyncIterable<LlmEvent> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.modelName)}:streamGenerateContent?alt=sse`;
    const body = {
      systemInstruction: { parts: [{ text: opts.system }] },
      contents: this.mapLlmMessagesToGemini(opts.messages),
      tools: this.mapToolDefinitionsToGemini(opts.tools),
    };
    const response = await this.fetchWithRetry(url, body, 5, opts.signal);
    if (!response) {
      yield { type: 'error', message: 'No se pudo contactar a Gemini tras varios intentos.' };
      return;
    }

    if (!response.ok || !response.body) {
      let detail = '';
      try {
        detail = (await response.text()).slice(0, 500);
      } catch {
        /* ignore */
      }
      yield { type: 'error', message: `Gemini API error ${response.status}: ${detail || response.statusText}` };
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let toolCallsBuffer: LlmToolCall[] = [];
    let ended = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newlineIdx: number;
      while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIdx).trim();
        buffer = buffer.slice(newlineIdx + 1);
        if (!line.startsWith('data: ')) continue;

        const payload = line.slice(6).trim();
        if (!payload || payload === '[DONE]') {
          ended = true;
          break;
        }

        let chunk: GeminiChunk;
        try {
          chunk = JSON.parse(payload);
        } catch {
          continue;
        }

        const candidate = chunk.candidates?.[0];
        if (!candidate) continue;
        if (candidate.finishReason) ended = true;

        for (const part of candidate.content?.parts ?? []) {
          if (part.functionCall) {
            const fc = part.functionCall;
            const toolCall: LlmToolCall = {
              id: fc.id || fc.name + '-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9),
              name: fc.name,
              args: (fc.args ?? {}) as Record<string, unknown>,
              thoughtSignature: part.thoughtSignature,
            };
            toolCallsBuffer.push(toolCall);
          } else if (part.text) {
            if (toolCallsBuffer.length > 0) {
              yield { type: 'tool_calls', calls: toolCallsBuffer };
              yield { type: 'end', reason: 'tool_calls' };
              return;
            }
            yield { type: 'text', delta: part.text };
          }
        }
        if (ended) break;
      }
      if (ended) break;
    }

    if (toolCallsBuffer.length > 0) {
      yield { type: 'tool_calls', calls: toolCallsBuffer };
      yield { type: 'end', reason: 'tool_calls' };
    } else {
      yield { type: 'end', reason: 'stop' };
    }
  }

  private async fetchWithRetry(url: string, body: unknown, maxAttempts = 5, signal?: AbortSignal): Promise<Response | null> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let response: Response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: {
            'x-goog-api-key': this.apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal,
        });
      } catch (error: any) {
        if (signal?.aborted) throw error;
        if (attempt === maxAttempts) return null;
        await sleep(3000 * attempt, signal);
        continue;
      }

      if (response.status === 429 || response.status >= 500) {
        if (attempt === maxAttempts) return response;
        const waitMs = await this.retryDelayFrom(response);
        console.log(`[gemini] attempt ${attempt}/${maxAttempts} got HTTP ${response.status}, retrying in ${Math.round(waitMs / 1000)}s`);
        await sleep(waitMs, signal);
        continue;
      }
      return response;
    }
    return null;
  }

  private async retryDelayFrom(response: Response): Promise<number> {
    const retryAfter = response.headers.get('retry-after');
    if (retryAfter) {
      const seconds = parseInt(retryAfter, 10);
      if (!isNaN(seconds)) return Math.min(seconds * 1000, 120000);
    }
    const text = await response.text().catch(() => '');
    const match = text.match(/retry in (\d+(?:\.\d+)?)s/i);
    if (match) {
      const seconds = parseFloat(match[1]);
      if (!isNaN(seconds)) return Math.min(seconds * 1000, 120000);
    }
    return 5000 * 2;
  }

  private mapLlmMessagesToGemini(messages: LlmMessage[]): { role: string; parts: unknown[] }[] {
    const geminiContents: { role: string; parts: unknown[] }[] = [];

    const pushPart = (role: 'user' | 'model', part: unknown) => {
      const last = geminiContents[geminiContents.length - 1];
      if (last && last.role === role) {
        last.parts.push(part);
      } else {
        geminiContents.push({ role, parts: [part] });
      }
    };

    for (const msg of messages) {
      if (msg.role === 'user') {
        if (msg.text) {
          pushPart('user', { text: msg.text });
        }
      } else if (msg.role === 'assistant') {
        const parts: unknown[] = [];
        if (msg.text) {
          parts.push({ text: msg.text });
        }
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          for (const call of msg.toolCalls) {
            const part: Record<string, unknown> = {
              functionCall: {
                name: call.name,
                args: call.args,
                id: call.id,
              },
            };
            if (call.thoughtSignature) {
              part.thoughtSignature = call.thoughtSignature;
            }
            parts.push(part);
          }
        }
        for (const part of parts) {
          pushPart('model', part);
        }
      } else if (msg.role === 'tool') {
        for (const result of msg.results) {
          pushPart('user', {
            functionResponse: {
              name: result.name,
              response: { content: result.content },
              id: result.id,
            },
          });
        }
      }
    }

    // Gemini exige que el historial arranque con un turno de usuario con texto
    // real. Si el recorte del historial dejó turnos sueltos (un model sin su
    // user previo, o un functionResponse sin su functionCall), descartarlos.
    const isOrphan = (c: { role: string; parts: unknown[] }): boolean => {
      if (c.role === 'model') return true;
      return c.parts.every((p) => typeof p === 'object' && p !== null && 'functionResponse' in p);
    };
    while (geminiContents.length > 0 && isOrphan(geminiContents[0])) {
      geminiContents.shift();
    }

    return geminiContents;
  }

  private mapToolDefinitionsToGemini(tools: ToolDefinition[]): unknown[] {
    return [
      {
        functionDeclarations: tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          parameters: tool.schema,
        })),
      },
    ];
  }
}
