import { FastifyInstance } from 'fastify';
import { TaskRepository } from '../../memory/repositories/taskRepository';

export async function briefRoutes(fastify: FastifyInstance) {
  fastify.get('/brief', async () => {
    const taskRepo = new TaskRepository();
    const now = new Date();
    const todayIso = now.toISOString().slice(0, 10);
    const dateText = new Intl.DateTimeFormat('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(now);

    return {
      date: todayIso,
      date_text: dateText,
      tasks_today: taskRepo.dueToday(now),
      pending_tasks: taskRepo.listPending(),
    };
  });
}
