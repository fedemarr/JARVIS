import { z } from 'zod';
import { Tool } from './index';
import { NoteRepository } from '../memory/repositories/noteRepository';

const schema = z.object({
  title: z.string().optional(),
  body: z.string().min(1, 'Falta el argumento body.'),
  tags: z.array(z.string()).optional(),
});

export const createNote: Tool<typeof schema> = {
  name: 'create_note',
  description: 'Crea una nota. Args: title?, body, tags? (array de strings).',
  schema,
  dangerous: false,
  dangerReason: () => null,
  handler: ({ title, body, tags }) => {
    const note = new NoteRepository().create({ title, body, tags });
    return `Nota creada${note.title ? `: "${note.title}"` : ''} (${body.length} caracteres).`;
  },
};
