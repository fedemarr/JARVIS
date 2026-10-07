import { z } from 'zod';
import { Tool } from './index';
import { MemoryRepository } from '../memory/repositories/memoryRepository';

const schema = z.object({
  key: z.string().min(1, 'Falta el argumento key.'),
});

export const forget: Tool<typeof schema> = {
  name: 'forget',
  description: 'Elimina una memoria long-term por su key.',
  schema,
  dangerous: false,
  dangerReason: () => null,
  handler: ({ key }) => {
    const removed = new MemoryRepository().forget(key);
    return removed ? `Memoria "${key}" eliminada.` : `No existía una memoria con key "${key}".`;
  },
};
