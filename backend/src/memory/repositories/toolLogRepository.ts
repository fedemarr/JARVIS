import { getDb } from '../db';
import { randomUUID } from 'crypto';

export interface ToolLog {
  id: string;
  tool: string;
  args: string;
  result_summary: string;
  status: string;
  duration_ms: number;
  created_at: string;
}

export class ToolLogRepository {
  private db = getDb();

  add(log: Omit<ToolLog, 'id' | 'created_at'>): void {
    const stmt = this.db.prepare(
      'INSERT INTO tool_logs (id, tool, args, result_summary, status, duration_ms) VALUES (?, ?, ?, ?, ?, ?)',
    );
    stmt.run(randomUUID(), log.tool, log.args, log.result_summary, log.status, log.duration_ms);
  }
}
