import { getDb } from '../db';
import { randomUUID } from 'crypto';

export interface Project {
  id: string;
  name: string;
  description: string | null;
  path: string;
  stack: string | null;
  status: string;
  notes: string | null;
  updated_at: string;
}

export interface ProjectInput {
  name: string;
  description?: string;
  path: string;
  stack?: string;
  status?: string;
  notes?: string;
}

export class ProjectRepository {
  private db = getDb();

  upsert(input: ProjectInput): Project {
    const existing = this.findByName(input.name);
    const id = existing?.id ?? randomUUID();
    this.db
      .prepare(
        `INSERT INTO projects (id, name, description, path, stack, status, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(name) DO UPDATE SET
           description = excluded.description,
           path = excluded.path,
           stack = excluded.stack,
           status = excluded.status,
           notes = excluded.notes,
           updated_at = CURRENT_TIMESTAMP`,
      )
      .run(
        id,
        input.name,
        input.description ?? null,
        input.path,
        input.stack ?? null,
        input.status ?? 'active',
        input.notes ?? null,
      );
    return this.findByName(input.name)!;
  }

  findByName(name: string): Project | undefined {
    return this.db.prepare('SELECT * FROM projects WHERE name = ?').get(name) as Project | undefined;
  }

  findById(id: string): Project | undefined {
    return this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project | undefined;
  }

  listActive(): Project[] {
    return this.db
      .prepare("SELECT * FROM projects WHERE status = 'active' ORDER BY updated_at DESC")
      .all() as Project[];
  }

  listAll(): Project[] {
    return this.db.prepare('SELECT * FROM projects ORDER BY name ASC').all() as Project[];
  }
}
