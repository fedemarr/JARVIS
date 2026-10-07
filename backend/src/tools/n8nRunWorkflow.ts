import { z } from 'zod';
import { Tool } from './index';
import { findWorkflow } from '../n8n/registry';
import { runN8nWorkflow, n8nBaseUrl, n8nApiKey } from '../n8n/client';
import { randomUUID } from 'crypto';

const schema = z.object({
  workflow: z.string().min(1, 'Falta el argumento workflow (nombre del registry, ej: daily_briefing).'),
  input: z.record(z.any()).optional(),
});

function workflowRisk(name: string): 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN' {
  return findWorkflow(name)?.risk ?? 'UNKNOWN';
}

export const n8nRunWorkflow: Tool<typeof schema> = {
  name: 'n8n_run_workflow',
  description:
    'Ejecuta un workflow en n8n de forma síncrona vía el webhook POST /webhook/jarvis. Args: workflow (nombre del registry), input (objeto opcional). Espera la respuesta hasta 90s. Los workflows de riesgo HIGH requieren confirmación del usuario.',
  schema,
  dangerous: false,
  dangerReason: (args) => {
    const name = String(args?.workflow ?? '');
    const risk = workflowRisk(name);
    if (risk === 'HIGH') {
      return `El workflow "${name}" es de riesgo HIGH y ejecuta acciones con efectos externos.`;
    }
    if (risk === 'UNKNOWN') {
      return `El workflow "${name}" no está en el registry (n8n/registry.json).`;
    }
    return null;
  },
  handler: async ({ workflow, input }) => {
    const reg = findWorkflow(workflow);
    if (!reg) {
      return `Workflow desconocido: "${workflow}". Usá n8n_list_workflows para ver los registrados.`;
    }

    const baseUrl = n8nBaseUrl();
    if (process.env.N8N_BASE_URL === undefined) {
      return `N8N_BASE_URL no está configurada en .env. Esperado: ${baseUrl}`;
    }

    const result = await runN8nWorkflow({
      baseUrl,
      apiKey: n8nApiKey(),
      webhookPath: reg.webhook_path,
      envelope: {
        action: reg.name,
        workflow: reg.n8n_workflow,
        input: input ?? {},
        request_id: randomUUID(),
      },
    });

    if (!result.ok) {
      return `Error al ejecutar "${workflow}" en n8n: ${result.error} (${result.status}). Verificá que n8n esté corriendo (docker compose up -d) y que el workflow esté activo con su webhook /webhook/${reg.webhook_path}.`;
    }

    const data = JSON.stringify(result.data);
    const max = 2000;
    return `Workflow "${workflow}" ejecutado OK (HTTP ${result.status}).\nRespuesta: ${data.length > max ? data.slice(0, max) + '…' : data}`;
  },
};
