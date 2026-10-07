import { z } from 'zod';
import { Tool } from './index';
import { MemoryRepository } from '../memory/repositories/memoryRepository';

const schema = z.object({
  query: z.string().min(1, 'Falta el argumento query.'),
});

export const recall: Tool<typeof schema> = {
  name: 'recall',
  description: 'Busca memorias long-term guardadas (por key, value o categoría) que coincidan con la query.',
  schema,
  dangerous: false,
  dangerReason: () => null,
  handler: ({ query }) => {
    const results = new MemoryRepository().search(query);
    if (results.length === 0) return 'No encontré memorias para esa búsqueda.';
    return results
      .map((m) => `- [${m.category}] ${m.key}: ${m.value}`)
      .join('\n');
  },
};
