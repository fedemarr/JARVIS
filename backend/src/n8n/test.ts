import dotenv from 'dotenv';
import { envPath } from '../config';
import { n8nBaseUrl, n8nApiKey, runN8nWorkflow, N8nEnvelope } from './client';
import { loadRegistry } from './registry';
import { N8nWorkflowRepository } from '../memory/repositories/n8nWorkflowRepository';

dotenv.config({ path: envPath() });

let failures = 0;

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function runN8nTest() {
  console.log('--- n8n contract test ---');
  console.log(`N8N_BASE_URL: ${process.env.N8N_BASE_URL || '(no configurado, usa default)'}`);

  const health = loadRegistry().workflows.find((w) => w.name === 'health_check');
  check('registry.json contiene health_check', Boolean(health), 'revisá n8n/registry.json');

  const repo = new N8nWorkflowRepository();
  const seeded = repo.findByName('health_check');
  check('health_check seedeado en la DB (n8n_workflows)', Boolean(seeded), 'levantá el backend antes');

  const briefController = new AbortController();
  const briefTimer = setTimeout(() => briefController.abort(), 10_000);
  const briefResult = await fetch('http://localhost:3001/api/brief', { signal: briefController.signal })
    .catch(() => null)
    .finally(() => clearTimeout(briefTimer));
  check(
    'backend responde GET /api/brief (localhost:3001)',
    briefResult !== null && briefResult.ok,
    'levantá el backend (npm run dev:backend)',
  );

  if (!health) return;

  const envelope: N8nEnvelope = {
    action: 'health_check',
    workflow: health.n8n_workflow,
    input: {},
    request_id: `test-${Date.now()}`,
  };

  const webhookResult = await runN8nWorkflow({
    baseUrl: n8nBaseUrl(),
    apiKey: n8nApiKey(),
    webhookPath: health.webhook_path,
    envelope,
  });

  check(
    `webhook POST /webhook/${health.webhook_path} responde (n8n corriendo con el workflow activo)`,
    webhookResult.ok,
    `${webhookResult.error}${webhookResult.ok ? '' : '. Levantá n8n (docker compose up -d) e importá n8n/workflows/jarvis_health_check.json activándolo.'}`,
  );

  if (webhookResult.ok) {
    const data = webhookResult.data as any;
    const echoed = data?.received ?? data?.json?.received;
    check('respuesta del webhook tiene ok:true', echoed !== undefined || data?.ok === true, JSON.stringify(webhookResult.data).slice(0, 200));
    check('envelope viaja intacto (received.action === health_check)', echoed?.action === 'health_check', JSON.stringify(echoed).slice(0, 200));
  }

  const apiKey = n8nApiKey();
  check('N8N_API_KEY cargada en .env (para n8n_execution_status)', Boolean(apiKey), 'generala en n8n → Settings → API');

  console.log(failures === 0 ? '\n--- n8n contract test PASSED ---' : `\n--- n8n contract test FAILED (${failures}) ---`);
  process.exitCode = failures === 0 ? 0 : 1;
}

runN8nTest();
