import { getDb } from '../db';
import { randomUUID } from 'crypto';

export interface Task {
  id: string;
  title: string;
  detail: string | null;
  status: string;
  due_date: string | null;
  project_id: string | null;
  created_at: string;
  completed_at: string | null;
}

export class TaskRepository {
  private db = getDb();

  create(data: { title: string; detail?: string; due_date?: string; project_id?: string }): Task {
    const id = randomUUID();
    this.db
      .prepare(
        'INSERT INTO tasks (id, title, detail, due_date, project_id, status) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(id, data.title, data.detail ?? null, data.due_date ?? null, data.project_id ?? null, 'pending');
    return this.findById(id)!;
  }

  findById(id: string): Task | undefined {
    return this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task | undefined;
  }

  listPending(): Task[] {
    return this.db
      .prepare("SELECT * FROM tasks WHERE status != 'done' ORDER BY COALESCE(due_date, '9999') ASC")
      .all() as Task[];
  }

  listOverdue(date = new Date()): Task[] {
    const iso = date.toISOString().slice(0, 10);
    return this.db
      .prepare(
        "SELECT * FROM tasks WHERE status != 'done' AND due_date IS NOT NULL AND due_date < ? ORDER BY due_date ASC",
      )
      .all(iso) as Task[];
  }

  listAll(): Task[] {
    return this.db.prepare('SELECT * FROM tasks ORDER BY COALESCE(due_date, \'9999\') ASC').all() as Task[];
  }

  complete(id: string): Task | undefined {
    this.db
      .prepare("UPDATE tasks SET status = 'done', completed_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(id);
    return this.findById(id);
  }

  dueToday(date = new Date()): Task[] {
    const iso = date.toISOString().slice(0, 10);
    return this.db
      .prepare(
        "SELECT * FROM tasks WHERE status != 'done' AND due_date = ? ORDER BY created_at ASC",
      )
      .all(iso) as Task[];
  }
}
