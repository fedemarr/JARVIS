import { z } from 'zod';
import { Tool } from './index';
import { listWorkflows } from '../n8n/registry';

const schema = z.object({});

export const n8nListWorkflows: Tool<typeof schema> = {
  name: 'n8n_list_workflows',
  description:
    'Lista los workflows registrados para ejecutar en n8n (fuente: n8n/registry.json). Devuelve nombre, categoría, riesgo y descripción de cada uno. Usar antes de n8n_run_workflow para saber qué existe.',
  schema,
  dangerous: false,
  dangerReason: () => null,
  handler: () => {
    const workflows = listWorkflows();
    if (workflows.length === 0) return 'No hay workflows registrados en n8n/registry.json.';
    return workflows
      .map(
        (w) =>
          `- ${w.name} (n8n: ${w.n8n_workflow}, riesgo: ${w.risk}) [${w.category}]\n  ${w.description}`,
      )
      .join('\n\n');
  },
};
