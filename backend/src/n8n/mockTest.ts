import { createServer } from 'http';
import { runN8nWorkflow } from './client';
import { loadRegistry } from './registry';

const PORT = 5678;

let failures = 0;

function check(name: string, ok: boolean, detail?: string) {
  if (ok) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function main() {
  const server = createServer((req, res) => {
    const url = req.url || '';
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      if (req.method === 'POST' && url === '/webhook/jarvis') {
        let parsed: any = null;
        try {
          parsed = JSON.parse(body);
        } catch {
          /* invalid body */
        }
        const echoed = parsed?.json;
        res.end(JSON.stringify({ ok: true, received: echoed, ts: new Date().toISOString() }));
        return;
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'not found', url }));
    });
  });

  await new Promise<void>((r) => server.listen(PORT, '127.0.0.1', r));
  console.log(`Mock n8n escuchando en :${PORT}`);

  try {
    const health = loadRegistry().workflows.find((w) => w.name === 'health_check');
    check('registry.json define health_check con webhook_path', Boolean(health?.webhook_path));
    check('registry.json define daily_briefing con webhook_path', Boolean(loadRegistry().workflows.find((w) => w.name === 'daily_briefing')?.webhook_path));

    if (!health) throw new Error('sin health_check en registry');

    const res = await runN8nWorkflow({
      baseUrl: `http://127.0.0.1:${PORT}`,
      webhookPath: health.webhook_path,
      envelope: { action: 'health_check', workflow: health.n8n_workflow, input: {}, request_id: 'test-1' },
    });

    check('webhook responde ok', res.ok, res.error);
    const data = res.data as any;
    check('envelope viaja intacto (action)', data?.received?.action === 'health_check', JSON.stringify(data));

    const missing = await runN8nWorkflow({
      baseUrl: `http://127.0.0.1:${PORT}`,
      webhookPath: 'no_existe',
      envelope: { action: 'x', workflow: 'x', input: {}, request_id: 'test-2' },
    });
    check('webhook inexistente falla limpio (404)', missing.ok === false, String(missing.status));
  } finally {
    server.close();
  }

  console.log(failures === 0 ? '\n--- mock E2E PASSED ---' : `\n--- mock E2E FAILED (${failures}) ---`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
