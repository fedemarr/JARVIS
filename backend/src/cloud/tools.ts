import { z } from 'zod';
import type { Tool, ToolRegistry } from '../tools';
import { zodToJsonSchema, safeParseArgs } from '../tools/schema';
import { calculator } from '../tools/calculator';
import { getCurrentTime } from '../tools/getCurrentTime';
import { CloudStore } from './store';

const text = z.string().trim().min(1).max(4000);
export function cloudTools(store: CloudStore): ToolRegistry {
  function tool(name: string, description: string, schema: z.ZodTypeAny, handler: Tool['handler']): Tool {
    return { name, description, schema, handler, dangerous: false, dangerReason: () => null };
  }
  const tools: Tool[] = [
    calculator, getCurrentTime,
    tool('remember', 'Guarda una preferencia o dato estable que el usuario quiera recordar.', z.object({ category: z.enum(['preference','project','fact','task_context','note']), key: text.max(200), value: text }), async ({ category, key, value }) => JSON.stringify(await store.remember(category,key,value))),
    tool('recall', 'Busca memorias personales guardadas.', z.object({ query: text.max(200) }), async ({ query }) => JSON.stringify(await store.recall(query))),
    tool('create_task', 'Crea una tarea pendiente.', z.object({ title: text.max(300), detail: text.optional(), dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }), async ({ title, detail, dueDate }) => JSON.stringify(await store.createTask(title,detail,dueDate))),
    tool('list_tasks', 'Lista tareas pendientes o completadas con sus identificadores.', z.object({ status: z.enum(['pending','completed']).default('pending') }), async ({ status }) => JSON.stringify(await store.tasks(status))),
    tool('complete_task', 'Marca como completada la tarea elegida por el usuario.', z.object({ id: z.string().uuid() }), async ({ id }) => JSON.stringify(await store.completeTask(id) || { error: 'Tarea no encontrada' })),
    tool('create_note', 'Guarda una nota personal.', z.object({ title: text.max(300).optional(), body: text, tags: z.array(text.max(100)).max(10).default([]) }), async ({ title, body, tags }) => JSON.stringify(await store.createNote(title,body,tags))),
    tool('search_notes', 'Busca notas por su texto.', z.object({ query: text.max(200) }), async ({ query }) => JSON.stringify(await store.searchNotes(query))),
  ];
  return {
    definitions: () => tools.map((t) => ({ name: t.name, description: t.description, schema: zodToJsonSchema(t.schema), dangerous: false })),
    get: (name) => tools.find((t) => t.name === name),
    isDangerous: () => ({ dangerous: false, reason: null }),
    async run(name, args) {
      const selected = tools.find((t) => t.name === name);
      if (!selected) return { ok: false, content: 'Herramienta no disponible en la nube.' };
      const parsed = safeParseArgs(selected.schema, args);
      if (!parsed.ok) return { ok: false, content: parsed.error };
      try { return { ok: true, content: await selected.handler(parsed.data) }; }
      catch { return { ok: false, content: 'No se pudo completar la operación. Volvé a intentarlo.' }; }
    },
  };
}
