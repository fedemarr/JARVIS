import { z } from 'zod';
import { Tool } from './index';
import { n8nBaseUrl, n8nApiKey } from '../n8n/client';

const schema = z.object({
  executionId: z.string().min(1, 'Falta el argumento executionId.'),
});

export const n8nExecutionStatus: Tool<typeof schema> = {
  name: 'n8n_execution_status',
  description:
    'Consulta el estado de una ejecución de n8n por su ID (GET /api/v1/executions/{id}). Requiere N8N_API_KEY en .env. Args: executionId.',
  schema,
  dangerous: false,
  dangerReason: () => null,
  handler: async ({ executionId }) => {
    const apiKey = n8nApiKey();
    if (!apiKey) {
      return 'N8N_API_KEY no está configurada en .env. Generala en n8n (Settings → API) y agregala.';
    }

    const url = `${n8nBaseUrl().replace(/\/$/, '')}/api/v1/executions/${encodeURIComponent(executionId)}`;
    try {
      const response = await fetch(url, {
        headers: { 'X-N8N-API-KEY': apiKey },
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        return `Error al consultar la ejecución ${executionId}: HTTP ${response.status} ${response.statusText}`;
      }
      const data = (await response.json()) as { finished?: boolean; stoppedAt?: string | null };
      const finished = data.finished ? 'finalizada' : 'en curso';
      const stopped = data.stoppedAt ? `, detenida: ${data.stoppedAt}` : '';
      return `Ejecución ${executionId}: ${finished}${stopped}.`;
    } catch (err: any) {
      return `Error al consultar n8n: ${err?.message || String(err)}`;
    }
  },
};
