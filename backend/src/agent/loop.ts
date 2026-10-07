import { randomUUID } from 'crypto';
import { LlmProvider, LlmMessage, LlmToolCall, LlmToolResult } from '../../../shared/llm';
import { ToolRegistry } from '../tools';
import { redactArgs, summarize } from '../security/redact';
import type { ToolLog } from '../memory/repositories/toolLogRepository';

const MAX_ITERATIONS = 8;
const PENDING_TIMEOUT_MS = 5 * 60 * 1000;

export interface SseEmitter {
  (event: string, data: unknown): void;
}

export interface RunResult {
  added: LlmMessage[];
  finalText: string;
  reason: 'stop' | 'tool_calls' | 'max_iterations' | 'error';
}

interface PendingRun {
  resolve: (approved: boolean) => void;
}

const pendingRuns = new Map<string, PendingRun>();

export function resolvePendingConfirmation(pendingId: string, approved: boolean): boolean {
  const run = pendingRuns.get(pendingId);
  if (!run) return false;
  run.resolve(approved);
  return true;
}

export function requestConfirmation(pendingId: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => {
      pendingRuns.delete(pendingId);
      resolve(false);
    }, PENDING_TIMEOUT_MS);
    pendingRuns.set(pendingId, {
      resolve: (approved) => {
        clearTimeout(timeout);
        pendingRuns.delete(pendingId);
        resolve(approved);
      },
    });
  });
}

export async function runAgentTurn(opts: {
  provider: LlmProvider;
  systemPrompt: string;
  history: LlmMessage[];
  registry: ToolRegistry;
  emit: SseEmitter;
  signal?: AbortSignal;
  log?: (entry: Omit<ToolLog, 'id' | 'created_at'>) => Promise<void> | void;
  maxIterations?: number;
}): Promise<RunResult> {
  const { provider, systemPrompt, history, registry, emit } = opts;
  const messages = [...history];
  const added: LlmMessage[] = [];
  let finalText = '';

  const limit = Math.min(MAX_ITERATIONS, Math.max(1, opts.maxIterations || MAX_ITERATIONS));
  for (let iteration = 0; iteration < limit; iteration++) {
    opts.signal?.throwIfAborted();
    const toolDefs = registry.definitions();
    let turnText = '';
    let calls: LlmToolCall[] = [];
    let streamError: string | null = null;

    for await (const event of provider.stream({ system: systemPrompt, messages, tools: toolDefs, signal: opts.signal })) {
      if (event.type === 'text') {
        turnText += event.delta;
        emit('token', { text: event.delta });
      } else if (event.type === 'tool_calls') {
        calls = event.calls;
      } else if (event.type === 'error') {
        streamError = event.message;
        emit('error', { message: event.message });
      }
    }

    if (streamError) {
      const msg: LlmMessage = { role: 'assistant', text: turnText || `Error: ${streamError}` };
      added.push(msg);
      finalText = msg.text || '';
      return { added, finalText, reason: 'error' };
    }

    if (calls.length === 0) {
      const text = turnText.trim();
      if (text) {
        const msg: LlmMessage = { role: 'assistant', text };
        added.push(msg);
        finalText = text;
      }
      return { added, finalText, reason: 'stop' };
    }

    const assistantMsg: LlmMessage = {
      role: 'assistant',
      text: turnText || undefined,
      toolCalls: calls,
    };
    messages.push(assistantMsg);
    added.push(assistantMsg);

    const checks = calls.map((call) => {
      const { dangerous, reason } = registry.isDangerous(call.name, call.args);
      return { call, dangerous, reason };
    });
    const hasDangerous = checks.some((c) => c.dangerous);

    let batchApproved = true;
    if (hasDangerous) {
      const pendingId = randomUUID();
      for (const c of checks.filter((x) => x.dangerous)) {
        emit('confirmation_required', {
          pendingId,
          tool: c.call.name,
          args: redactArgs(c.call.args),
          reason: c.reason,
        });
      }
      batchApproved = await requestConfirmation(pendingId);
      emit('confirmation', { pendingId, approved: batchApproved });
    }

    const results: LlmToolResult[] = await Promise.all(
      checks.map(async ({ call, dangerous }) => {
        const { id, name, args } = call;
        const tool = registry.get(name);
        emit('tool_start', { id, name, args: redactArgs(args) });
        const start = Date.now();

        let runResult: { ok: boolean; content: string };
        if (!tool) {
          runResult = { ok: false, content: `Tool desconocida: ${name}` };
        } else if (dangerous && !batchApproved) {
          runResult = { ok: false, content: 'El usuario rechazó la ejecución' };
        } else {
          runResult = await registry.run(name, args);
        }

        const durationMs = Date.now() - start;
        const summary = summarize(runResult.content);
        const entry = {
          tool: name,
          args: JSON.stringify(redactArgs(args)),
          result_summary: summary,
          status: runResult.ok ? 'success' : 'error',
          duration_ms: durationMs,
        };
        if (opts.log) await opts.log(entry);
        else {
        const { ToolLogRepository } = await import('../memory/repositories/toolLogRepository.js');
          new ToolLogRepository().add(entry);
        }
        emit('tool_result', { id, name, ok: runResult.ok, summary, durationMs });
        return { id, name, ok: runResult.ok, content: runResult.content };
      }),
    );

    messages.push({ role: 'tool', results });
    added.push({ role: 'tool', results });
  }

  finalText = 'Detuve el turno: superé el máximo de iteraciones de herramientas.';
  emit('token', { text: `\n\n(${finalText})` });
  return { added, finalText, reason: 'max_iterations' };
}
