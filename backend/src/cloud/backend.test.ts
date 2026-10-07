import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerAuth, validSession, createSession, validateAccessConfig } from '../security/auth';
import { buildCloudApp } from './app';
import { cloudTools } from './tools';
import type { CloudStore } from './store';
import type { LlmProvider } from '../../../shared/llm';
import { AnthropicLlmProvider } from '../llm/anthropic';

test('Claude reconstruye argumentos JSON parciales sin llamadas reales', async () => {
  const provider = new AnthropicLlmProvider('clave-ficticia', 'claude-haiku-4-5');
  let options: any;
  (provider as any).anthropic = { messages: { stream(input: unknown) {
    options = input;
    return (async function* () {
      yield { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 't1', name: 'remember', input: {} } };
      yield { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"key":"stack",' } };
      yield { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '"value":"TypeScript","category":"preference"}' } };
      yield { type: 'content_block_stop', index: 1 };
      yield { type: 'message_delta', delta: { stop_reason: 'tool_use' } };
      yield { type: 'message_stop' };
    })();
  } } };
  const events = [];
  for await (const event of provider.stream({ system: 'Prueba', messages: [{ role: 'user', text: 'Recordar stack' }], tools: [] })) events.push(event);
  const call = events.find((event) => event.type === 'tool_calls');
  assert.deepEqual(call?.type === 'tool_calls' ? call.calls[0].args : null, { key: 'stack', value: 'TypeScript', category: 'preference' });
  assert.equal(events.filter((event) => event.type === 'end').length, 1);
  assert.equal(options.max_tokens, 1024);
});

test('acceso autenticado, origen, manipulación, vencimiento y bloqueo de intentos', async () => {
  process.env.JARVIS_MODE = 'cloud';
  process.env.JARVIS_ACCESS_KEY = 'test-access-key-with-more-than-32-characters';
  process.env.ALLOWED_ORIGINS = 'https://jarvis.example';
  const app = Fastify();
  registerAuth(app);
  app.get('/api/private', async () => ({ secret: 'solo operador' }));
  try {
    assert.equal((await app.inject('/api/private')).statusCode, 401);
    assert.equal((await app.inject({ method: 'POST', url: '/api/session', headers: { origin: 'https://evil.example' }, payload: { accessKey: process.env.JARVIS_ACCESS_KEY } })).statusCode, 403);
    const login = await app.inject({ method: 'POST', url: '/api/session', headers: { origin: 'https://jarvis.example' }, payload: { accessKey: process.env.JARVIS_ACCESS_KEY } });
    assert.equal(login.statusCode, 200);
    const cookie = String(login.headers['set-cookie']);
    assert.match(cookie, /HttpOnly; SameSite=Strict/);
    assert.match(cookie, /Secure/);
    assert.equal((await app.inject({ url: '/api/private', headers: { cookie: cookie.split(';')[0] } })).statusCode, 200);
    assert.equal((await app.inject({ url: '/api/private', headers: { cookie: cookie.split(';')[0] + 'x' } })).statusCode, 401);
    const token = createSession(process.env.JARVIS_ACCESS_KEY, 0);
    assert.equal(validSession(token, process.env.JARVIS_ACCESS_KEY), false);
    for (let i = 0; i < 10; i++) assert.equal((await app.inject({ method: 'POST', url: '/api/session', payload: { accessKey: 'wrong' } })).statusCode, 401);
    assert.equal((await app.inject({ method: 'POST', url: '/api/session', payload: { accessKey: 'wrong' } })).statusCode, 429);
    assert.equal((await app.inject({ method: 'DELETE', url: '/api/session' })).statusCode, 200);
    const saved = process.env.JARVIS_ACCESS_KEY;
    delete process.env.JARVIS_ACCESS_KEY;
    assert.throws(validateAccessConfig, /requiere/);
    process.env.JARVIS_ACCESS_KEY = saved;
  } finally { await app.close(); }
});

test('chat valida entradas, persiste historial y bloquea herramientas de computadora', async () => {
  process.env.JARVIS_MODE = 'cloud';
  process.env.JARVIS_ACCESS_KEY = 'test-access-key-with-more-than-32-characters';
  process.env.ALLOWED_ORIGINS = 'https://jarvis.example';
  const messages: unknown[] = [];
  const id = '11111111-1111-4111-8111-111111111111';
  let leased = false;
  const store = {
    initialize: async () => {}, allowLogin: async () => true,
    acquire: async () => { if (leased) return false; leased = true; return true; },
    release: async () => { leased = false; },
    createConversation: async () => ({ id, title: 'Nueva conversación' }),
    conversation: async () => ({ id, title: 'Ticket' }),
    conversations: async () => [{ id }], history: async () => [], preferences: async () => [],
    append: async (_id: string, added: unknown[]) => { messages.push(...added); },
    log: async () => {}, tasks: async () => [],
  } as unknown as CloudStore;
  const provider: LlmProvider = { async *stream() { yield { type: 'text', delta: 'Ticket analizado con contexto.' }; yield { type: 'end', reason: 'stop' }; } };
  const app = buildCloudApp(store, provider);
  try {
    const login = await app.inject({ method: 'POST', url: '/api/session', payload: { accessKey: process.env.JARVIS_ACCESS_KEY } });
    const headers = { cookie: String(login.headers['set-cookie']).split(';')[0] };
    assert.equal((await app.inject({ method: 'POST', url: '/api/chat', headers, payload: { message: ' ' } })).statusCode, 400);
    assert.equal((await app.inject({ method: 'POST', url: '/api/chat', headers, payload: { message: 'x'.repeat(40001) } })).statusCode, 400);
    const chat = await app.inject({ method: 'POST', url: '/api/chat', headers, payload: { message: 'Analizá este ticket.' } });
    assert.equal(chat.statusCode, 200);
    assert.match(chat.payload, /Ticket analizado/);
    assert.match(chat.payload, /event: done/);
    assert.equal(messages.length, 2);
    assert.equal(leased, false);
    const tools = cloudTools(store);
    assert.equal(tools.get('execute_command'), undefined);
    assert.equal(tools.get('read_file'), undefined);
    assert.equal((await tools.run('execute_command', { command: 'node --version' })).ok, false);
    assert.equal((await tools.run('calculator', { expression: '2+2' })).content, '4');
    leased = true;
    assert.equal((await app.inject({ method: 'POST', url: '/api/chat', headers, payload: { message: 'Otra misión' } })).statusCode, 409);
  } finally { await app.close(); }
});
