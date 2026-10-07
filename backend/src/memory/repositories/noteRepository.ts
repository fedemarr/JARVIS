import { getDb } from '../db';
import { randomUUID } from 'crypto';

export interface Note {
  id: string;
  title: string | null;
  body: string;
  tags: string | null;
  created_at: string;
}

export class NoteRepository {
  private db = getDb();

  create(data: { title?: string; body: string; tags?: string[] }): Note {
    const id = randomUUID();
    this.db
      .prepare('INSERT INTO notes (id, title, body, tags) VALUES (?, ?, ?, ?)')
      .run(id, data.title ?? null, data.body, data.tags && data.tags.length > 0 ? data.tags.join(',') : null);
    return this.findById(id)!;
  }

  findById(id: string): Note | undefined {
    return this.db.prepare('SELECT * FROM notes WHERE id = ?').get(id) as Note | undefined;
  }

  search(query: string, limit = 20): Note[] {
    const like = `%${query}%`;
    return this.db
      .prepare(
        'SELECT * FROM notes WHERE title LIKE ? OR body LIKE ? OR tags LIKE ? ORDER BY created_at DESC LIMIT ?',
      )
      .all(like, like, like, limit) as Note[];
  }

  listRecent(limit = 10): Note[] {
    return this.db.prepare('SELECT * FROM notes ORDER BY created_at DESC LIMIT ?').all(limit) as Note[];
  }
}
