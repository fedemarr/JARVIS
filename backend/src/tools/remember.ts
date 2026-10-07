import { z } from 'zod';
import { Tool } from './index';
import { MemoryRepository } from '../memory/repositories/memoryRepository';

const schema = z.object({
  category: z
    .enum(['preference', 'project', 'fact', 'task_context', 'note'])
    .describe('Categoría de la memoria (preference | project | fact | task_context | note)'),
  key: z.string().min(1, 'Falta el argumento key.'),
  value: z.string().min(1, 'Falta el argumento value.'),
});

export const remember: Tool<typeof schema> = {
  name: 'remember',
  description:
    'Guarda una memoria long-term (clave-valor) por categoría. Usala cuando el usuario pida explícitamente "acordate de X" o cuando detectes un dato estable y reutilizable (stack habitual, cómo trabaja, dónde vive un proyecto). Categorías: preference, project, fact, task_context, note. No guardes charla casual.',
  schema,
  dangerous: false,
  dangerReason: () => null,
  handler: ({ category, key, value }) => {
    const repo = new MemoryRepository();
    repo.upsert(category, key, value);
    return `Memoria guardada: [${category}] ${key} = ${value}`;
  },
};
