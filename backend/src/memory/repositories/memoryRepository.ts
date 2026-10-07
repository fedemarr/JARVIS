import { getDb } from '../db';
import { randomUUID } from 'crypto';

export interface Memory {
  id: string;
  category: string;
  key: string;
  value: string;
  created_at: string;
  updated_at: string;
}

export class MemoryRepository {
  private db = getDb();

  upsert(category: string, key: string, value: string): Memory {
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO memories (id, category, key, value)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           category = excluded.category,
           value = excluded.value,
           updated_at = CURRENT_TIMESTAMP`,
      )
      .run(id, category, key, value);
    return this.findByKey(key)!;
  }

  findByKey(key: string): Memory | undefined {
    return this.db.prepare('SELECT * FROM memories WHERE key = ?').get(key) as Memory | undefined;
  }

  findById(id: string): Memory | undefined {
    return this.db.prepare('SELECT * FROM memories WHERE id = ?').get(id) as Memory | undefined;
  }

  listByCategories(categories: string[], limit = 50): Memory[] {
    if (categories.length === 0) return [];
    const placeholders = categories.map(() => '?').join(', ');
    return this.db
      .prepare(`SELECT * FROM memories WHERE category IN (${placeholders}) ORDER BY updated_at DESC LIMIT ?`)
      .all(...categories, limit) as Memory[];
  }

  search(query: string, limit = 20): Memory[] {
    const like = `%${query}%`;
    return this.db
      .prepare(
        'SELECT * FROM memories WHERE key LIKE ? OR value LIKE ? OR category LIKE ? ORDER BY updated_at DESC LIMIT ?',
      )
      .all(like, like, like, limit) as Memory[];
  }

  forget(key: string): boolean {
    const result = this.db.prepare('DELETE FROM memories WHERE key = ?').run(key);
    return result.changes > 0;
  }

  all(): Memory[] {
    return this.db.prepare('SELECT * FROM memories ORDER BY updated_at DESC').all() as Memory[];
  }
}
