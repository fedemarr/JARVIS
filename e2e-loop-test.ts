import { runAgentTurn, resolvePendingConfirmation } from './backend/src/agent/loop';
import { getToolRegistry } from './backend/src/tools';
import { LlmMessage, LlmProvider, LlmEvent, ToolDefinition } from './shared/llm';

const registry = getToolRegistry();
const toolDefs = registry.definitions();

let pass = 0;
let fail = 0;

function check(label: string, cond: boolean, detail?: string) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.log(`  ✗ ${label}${detail ? ` :: ${detail}` : ''}`);
  }
}

interface MockTurn {
  event: LlmEvent;
}

class MockProvider implements LlmProvider {
  constructor(private script: ((callsSoFar: number) => LlmEvent[])[], private system: string) {}
  async *stream(opts: { system: string; messages: LlmMessage[]; tools: ToolDefinition[] }): AsyncIterable<LlmEvent> {
    const callCount = opts.messages.filter((m) => m.role === 'assistant' && m.toolCalls?.length).length;
    const events = this.script[callCount]?.(callCount);
    if (!events) {
      yield { type: 'text', delta: '(script agotado)' };
      yield { type: 'end', reason: 'stop' };
      return;
    }
    for (const e of events) yield e;
  }
}

async function runScenario(name: string, script: ((n: number) => LlmEvent[])[], prompt: string) {
  console.log(`\n=== ${name} ===`);
  const events: { ev: string; data: any }[] = [];
  const provider = new MockProvider(script, 'test');
  const resultPromise = runAgentTurn({
    provider,
    systemPrompt: prompt,
    history: [{ role: 'user', text: prompt }],
    registry,
    emit: (ev, data) => events.push({ ev, data }),
  });

  let approved = false;
  for (let i = 0; i < 200; i++) {
    const pending = events.find((e) => e.ev === 'confirmation_required' && !approved);
    if (pending) {
      approved = true;
      resolvePendingConfirmation(pending.data.pendingId, true);
    }
    await new Promise((r) => setTimeout(r, 10));
  }

  const result = await resultPromise;
  return { events, result };
}

const toolCall = (name: string, args: Record<string, unknown>): LlmEvent[] => [
  { type: 'tool_calls', calls: [{ id: name + '-1', name, args }] },
  { type: 'end', reason: 'tool_calls' },
];

async function main() {
  // Escenario 1: tool segura (get_current_time) seguida de respuesta final
  {
    const script: ((n: number) => LlmEvent[])[] = [
      () => toolCall('get_current_time', {}),
      () => [
        { type: 'text', delta: 'Son las ' },
        { type: 'text', delta: '14:30.' },
        { type: 'end', reason: 'stop' },
      ],
    ];
    const { events, result } = await runScenario('tool segura -> respuesta', script, '¿Qué hora es?');
    const starts = events.filter((e) => e.ev === 'tool_start');
    const results = events.filter((e) => e.ev === 'tool_result');
    const tokens = events.filter((e) => e.ev === 'token').map((e) => e.data.text).join('');
    const confirmed = events.filter((e) => e.ev === 'confirmation_required');
    check('1 tool_start emitido', starts.length === 1 && starts[0].data.name === 'get_current_time');
    check('tool_result ok', results.length === 1 && results[0].data.ok === true);
    check('sin confirmation_required (tool segura)', confirmed.length === 0);
    check('tokens de respuesta', tokens === 'Son las 14:30.');
    check('mensajes guardados: user, assistant(toolcall), tool, assistant', result.added.length === 3 && result.added[2].role === 'assistant' && result.added[2].text === 'Son las 14:30.');
  }

  // Escenario 2: dos tools en paralelo (segura + segura)
  {
    const script: ((n: number) => LlmEvent[])[] = [
      () => [
        {
          type: 'tool_calls',
          calls: [
            { id: 'calc-1', name: 'calculator', args: { expression: '2*3' } },
            { id: 'time-1', name: 'get_current_time', args: {} },
          ],
        },
        { type: 'end', reason: 'tool_calls' },
      ],
      () => [
        { type: 'text', delta: 'Resultados listos.' },
        { type: 'end', reason: 'stop' },
      ],
    ];
    const { events, result } = await runScenario('2 tools paralelas', script, 'calculá y dame la hora');
    const starts = events.filter((e) => e.ev === 'tool_start');
    const results = events.filter((e) => e.ev === 'tool_result');
    const toolNames = results.map((r) => r.data.name).sort();
    check('2 tool_start emitidos', starts.length === 2);
    check('2 tool_result ok', results.length === 2 && results.every((r) => r.data.ok === true));
    check('ambas tools ejecutadas', toolNames.join(',') === 'calculator,get_current_time');
    check('mensajes: assistant(toolcall) + tool + assistant', result.added.length === 3 && result.added[1].role === 'tool' && result.added[1].results.length === 2 && result.added[2].text === 'Resultados listos.');
  }

  // Escenario 3: tool peligrosa APROBADA
  {
    const script: ((n: number) => LlmEvent[])[] = [
      () => toolCall('write_file', { path: './data/e2e_test.txt', content: 'hola' }),
      () => [
        { type: 'text', delta: 'Archivo creado.' },
        { type: 'end', reason: 'stop' },
      ],
    ];
    const { events, result } = await runScenario('write_file aprobada', script, 'creá un archivo');
    const confirmReq = events.filter((e) => e.ev === 'confirmation_required');
    const confirmRes = events.filter((e) => e.ev === 'confirmation');
    const results = events.filter((e) => e.ev === 'tool_result');
    check('confirmation_required emitida', confirmReq.length === 1 && confirmReq[0].data.tool === 'write_file' && confirmReq[0].data.reason.length > 0);
    check('confirmation emitida (approved=true)', confirmRes.length === 1 && confirmRes[0].data.approved === true);
    check('tool_result ok (se ejecutó)', results.length === 1 && results[0].data.ok === true);
    const exists = (await import('fs')).existsSync('./data/e2e_test.txt');
    check('archivo creado en disco', exists);
    if (exists) (await import('fs')).unlinkSync('./data/e2e_test.txt');
  }

  // Escenario 4: tool peligrosa RECHAZADA
  {
    const script: ((n: number) => LlmEvent[])[] = [
      () => toolCall('write_file', { path: './data/e2e_rechazado.txt', content: 'x' }),
      () => [
        { type: 'text', delta: 'Entendido, no lo hago.' },
        { type: 'end', reason: 'stop' },
      ],
    ];
    const provider = new MockProvider(script, 'test');
    const events: { ev: string; data: any }[] = [];
    const resultPromise = runAgentTurn({
      provider,
      systemPrompt: 'test',
      history: [{ role: 'user', text: 'creá un archivo' }],
      registry,
      emit: (ev, data) => events.push({ ev, data }),
    });
    let approved = false;
    for (let i = 0; i < 200; i++) {
      const pending = events.find((e) => e.ev === 'confirmation_required' && !approved);
      if (pending) {
        approved = true;
        resolvePendingConfirmation(pending.data.pendingId, false);
      }
      await new Promise((r) => setTimeout(r, 10));
    }
    const result = await resultPromise;
    const confirmRes = events.filter((e) => e.ev === 'confirmation');
    const results = events.filter((e) => e.ev === 'tool_result');
    check('confirmation approved=false', confirmRes.length === 1 && confirmRes[0].data.approved === false);
    check('tool_result ok=false (rechazada)', results.length === 1 && results[0].data.ok === false);
    const exists = (await import('fs')).existsSync('./data/e2e_rechazado.txt');
    check('archivo NO creado', !exists);
  }

  console.log(`\n======== RESULTADO: ${pass} pasan, ${fail} fallan ========`);
  process.exit(fail > 0 ? 1 : 0);
}

main();
