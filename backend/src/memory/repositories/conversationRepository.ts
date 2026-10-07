import { getDb } from '../db';
import { randomUUID } from 'crypto';

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export class ConversationRepository {
  private db = getDb();

  create(title: string): Conversation {
    const id = randomUUID();
    const stmt = this.db.prepare(
      'INSERT INTO conversations (id, title) VALUES (?, ?)'
    );
    stmt.run(id, title);
    return this.findById(id)!;
  }

  findById(id: string): Conversation | undefined {
    const stmt = this.db.prepare('SELECT * FROM conversations WHERE id = ?');
    return stmt.get(id) as Conversation | undefined;
  }

  findAll(): Conversation[] {
    const stmt = this.db.prepare('SELECT * FROM conversations ORDER BY updated_at DESC');
    return stmt.all() as Conversation[];
  }

  updateTitle(id: string, title: string): void {
    const stmt = this.db.prepare(
      'UPDATE conversations SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    );
    stmt.run(title, id);
  }
}