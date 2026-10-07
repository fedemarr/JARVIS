import { z } from 'zod';
import { Tool } from './index';
import { TaskRepository, Task } from '../memory/repositories/taskRepository';

const schema = z.object({
  filter: z.enum(['today', 'pending', 'overdue', 'all']).optional().default('pending'),
  projectId: z.string().optional(),
});

function formatTasks(tasks: Task[]): string {
  if (tasks.length === 0) return 'No hay tareas.';
  return tasks
    .map((t, i) => `${i + 1}. [${t.status === 'done' ? '✓' : t.status}] ${t.title}${t.due_date ? ` (vence: ${t.due_date})` : ''}`)
    .join('\n');
}

export const listTasks: Tool<typeof schema> = {
  name: 'list_tasks',
  description:
    'Lista las tareas del usuario. Args: filter (today | pending | overdue | all, default pending), projectId opcional.',
  schema,
  dangerous: false,
  dangerReason: () => null,
  handler: ({ filter, projectId }) => {
    const repo = new TaskRepository();
    let tasks: Task[];
    switch (filter) {
      case 'today':
        tasks = repo.dueToday();
        break;
      case 'overdue':
        tasks = repo.listOverdue();
        break;
      case 'all':
        tasks = repo.listAll();
        break;
      default:
        tasks = repo.listPending();
    }
    if (projectId) tasks = tasks.filter((t) => t.project_id === projectId);
    return formatTasks(tasks);
  },
};
