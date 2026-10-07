import { z } from 'zod';
import { Tool } from './index';
import { ProjectRepository } from '../memory/repositories/projectRepository';

const schema = z.object({});

export const listProjects: Tool<typeof schema> = {
  name: 'list_projects',
  description: 'Lista los proyectos registrados del usuario (de la tabla projects): nombre, stack, estado, ruta y notas.',
  schema,
  dangerous: false,
  dangerReason: () => null,
  handler: () => {
    const projects = new ProjectRepository().listActive();
    if (projects.length === 0) return 'No hay proyectos registrados.';
    return projects
      .map(
        (p) =>
          `- ${p.name}${p.stack ? ` (${p.stack})` : ''} [${p.status}]\n  Ruta: ${p.path}${p.description ? `\n  ${p.description}` : ''}`,
      )
      .join('\n');
  },
};
