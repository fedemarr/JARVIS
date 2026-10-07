import { z } from 'zod';
import { Tool } from './index';
import { TaskRepository } from '../memory/repositories/taskRepository';

const schema = z.object({
  title: z.string().min(1, 'Falta el argumento title.'),
  detail: z.string().optional(),
  dueDate: z.string().optional().describe('Fecha de vencimiento en formato YYYY-MM-DD'),
  projectId: z.string().optional(),
});

export const createTask: Tool<typeof schema> = {
  name: 'create_task',
  description:
    'Crea una tarea para el usuario. Args: title, detail?, dueDate? (YYYY-MM-DD), projectId?. Queda pendiente.',
  schema,
  dangerous: false,
  dangerReason: () => null,
  handler: ({ title, detail, dueDate, projectId }) => {
    const task = new TaskRepository().create({ title, detail, due_date: dueDate, project_id: projectId });
    const due = task.due_date ? ` (vencimiento: ${task.due_date})` : '';
    return `Tarea creada: "${task.title}"${due}`;
  },
};
