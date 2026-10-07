import { z } from 'zod';
import { Tool } from './index';
import { ProjectRepository } from '../memory/repositories/projectRepository';

const schema = z.object({
  name: z.string().min(1, 'Falta el argumento name.'),
  description: z.string().optional(),
  path: z.string().min(1, 'Falta el argumento path.'),
  stack: z.string().optional(),
  status: z.enum(['active', 'archived', 'planned']).optional().default('active'),
  notes: z.string().optional(),
});

export const upsertProject: Tool<typeof schema> = {
  name: 'upsert_project',
  description:
    'Crea o actualiza un proyecto del usuario en la tabla projects (por nombre). Args: name, path, description?, stack?, status?, notes?.',
  schema,
  dangerous: false,
  dangerReason: () => null,
  handler: ({ name, path, description, stack, status, notes }) => {
    const project = new ProjectRepository().upsert({
      name,
      path,
      description,
      stack,
      status,
      notes,
    });
    return `Proyecto ${project.status === 'active' ? 'registrado' : 'actualizado'}: ${project.name} → ${project.path}${project.stack ? ` (${project.stack})` : ''}`;
  },
};
