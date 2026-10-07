import { ProjectRepository } from '../memory/repositories/projectRepository';

interface SeedProject {
  name: string;
  path: string;
  description?: string;
  stack?: string;
  status?: string;
  notes?: string;
}

const SEED_PROJECTS: SeedProject[] = [
  {
    name: 'lastmile',
    path: 'C:/Users/fede/Documents/sistemalogistica',
    description: 'Sistema de logística de última milla — panel web + app móvil.',
    stack: 'TypeScript, React, Node, turbo, pnpm',
    status: 'active',
    notes: 'Proyecto principal de logística. npm dev vía turbo.',
  },
];

export function seedProjects(repo: ProjectRepository): number {
  let count = 0;
  for (const p of SEED_PROJECTS) {
    if (!repo.findByName(p.name)) {
      repo.upsert(p);
      count++;
    }
  }
  return count;
}
