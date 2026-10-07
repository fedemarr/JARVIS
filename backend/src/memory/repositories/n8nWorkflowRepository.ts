import { getDb } from '../db';
import { randomUUID } from 'crypto';

export interface N8nWorkflow {
  id: string;
  name: string;
  n8n_workflow: string;
  webhook_path: string;
  description: string | null;
  category: string | null;
  risk: string;
  input_schema: string | null;
  active: number;
}

export interface RegistryEntry {
  name: string;
  n8n_workflow: string;
  webhook_path: string;
  description?: string;
  category?: string;
  risk?: string;
  input_schema?: unknown;
  active?: boolean;
}

export class N8nWorkflowRepository {
  private db = getDb();

  upsert(entry: RegistryEntry): void {
    const stmt = this.db.prepare(`
      INSERT INTO n8n_workflows (id, name, n8n_workflow, webhook_path, description, category, risk, input_schema, active)
      VALUES (@id, @name, @n8n_workflow, @webhook_path, @description, @category, @risk, @input_schema, @active)
      ON CONFLICT(name) DO UPDATE SET
        n8n_workflow = excluded.n8n_workflow,
        webhook_path = excluded.webhook_path,
        description = excluded.description,
        category = excluded.category,
        risk = excluded.risk,
        input_schema = excluded.input_schema,
        active = excluded.active,
        updated_at = CURRENT_TIMESTAMP
    `);
    stmt.run({
      id: randomUUID(),
      name: entry.name,
      n8n_workflow: entry.n8n_workflow,
      webhook_path: entry.webhook_path,
      description: entry.description ?? null,
      category: entry.category ?? null,
      risk: entry.risk ?? 'LOW',
      input_schema: entry.input_schema ? JSON.stringify(entry.input_schema) : null,
      active: entry.active === false ? 0 : 1,
    });
  }

  listActive(): N8nWorkflow[] {
    return this.db
      .prepare('SELECT * FROM n8n_workflows WHERE active = 1 ORDER BY name')
      .all() as N8nWorkflow[];
  }

  listAll(): N8nWorkflow[] {
    return this.db.prepare('SELECT * FROM n8n_workflows ORDER BY name').all() as N8nWorkflow[];
  }

  findByName(name: string): N8nWorkflow | undefined {
    return this.db
      .prepare('SELECT * FROM n8n_workflows WHERE name = ?')
      .get(name) as N8nWorkflow | undefined;
  }
}
