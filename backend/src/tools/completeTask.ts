import { z } from 'zod';
import { Tool } from './index';
import { TaskRepository } from '../memory/repositories/taskRepository';

const schema = z.object({
  id: z.string().min(1, 'Falta el argumento id.'),
});

export const completeTask: Tool<typeof schema> = {
  name: 'complete_task',
  description: 'Marca una tarea como completada. Args: id (el id de la tarea).',
  schema,
  dangerous: false,
  dangerReason: () => null,
  handler: ({ id }) => {
    const task = new TaskRepository().complete(id);
    return task ? `Tarea completada: "${task.title}".` : `No existe una tarea con id "${id}".`;
  },
};
