import { z } from 'zod';
import { Tool } from './index';
import { TaskRepository } from '../memory/repositories/taskRepository';
import { NoteRepository } from '../memory/repositories/noteRepository';
import { ProjectRepository } from '../memory/repositories/projectRepository';

const schema = z.object({});

export const dailyBrief: Tool<typeof schema> = {
  name: 'daily_brief',
  description:
    'Arma el resumen del día: fecha/hora actual, tareas de hoy, tareas vencidas, proyectos activos y últimas notas. Sin argumentos.',
  schema,
  dangerous: false,
  dangerReason: () => null,
  handler: () => {
    const now = new Date();
    const dateText = new Intl.DateTimeFormat('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      dateStyle: 'full',
      timeStyle: 'short',
    }).format(now);

    const taskRepo = new TaskRepository();
    const today = taskRepo.dueToday(now);
    const overdue = taskRepo.listOverdue(now);
    const projects = new ProjectRepository().listActive();
    const notes = new NoteRepository().listRecent(3);

    const lines: string[] = [`Resumen de hoy — ${dateText}`];

    lines.push(
      today.length > 0
        ? `\nTareas de hoy:\n${today.map((t) => `- ${t.title}`).join('\n')}`
        : '\nTareas de hoy: no tenés nada pendiente para hoy.',
    );

    if (overdue.length > 0) {
      lines.push(`\nVencidas sin hacer:\n${overdue.map((t) => `- ${t.title} (vence: ${t.due_date})`).join('\n')}`);
    }

    lines.push(
      projects.length > 0
        ? `\nProyectos activos:\n${projects.map((p) => `- ${p.name}`).join('\n')}`
        : '\nProyectos activos: ninguno registrado.',
    );

    if (notes.length > 0) {
      lines.push(`\nÚltimas notas:\n${notes.map((n) => `- ${n.title || n.body.slice(0, 60)}`).join('\n')}`);
    }

    return lines.join('\n');
  },
};
