import { z } from 'zod';
import { Tool } from './index';
import { NoteRepository } from '../memory/repositories/noteRepository';

const schema = z.object({
  query: z.string().min(1, 'Falta el argumento query.'),
});

export const searchNotes: Tool<typeof schema> = {
  name: 'search_notes',
  description: 'Busca notas del usuario por texto en título, cuerpo o tags.',
  schema,
  dangerous: false,
  dangerReason: () => null,
  handler: ({ query }) => {
    const notes = new NoteRepository().search(query);
    if (notes.length === 0) return 'No encontré notas para esa búsqueda.';
    return notes
      .map((n) => {
        const title = n.title ? `${n.title} — ` : '';
        const body = n.body.length > 200 ? n.body.slice(0, 200) + '…' : n.body;
        return `- ${title}${body}`;
      })
      .join('\n\n');
  },
};
