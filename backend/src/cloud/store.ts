import { neon } from '@neondatabase/serverless';
import { randomUUID } from 'crypto';
import { LlmMessage } from '../../../shared/llm';

export class CloudStore {
  private sql;
  constructor(url = process.env.DATABASE_URL) {
    if (!url) throw new Error('Falta DATABASE_URL para la memoria persistente.');
    this.sql = neon(url);
  }
  async initialize() {
    await this.sql.transaction([
      this.sql`CREATE TABLE IF NOT EXISTS jarvis_conversations (id UUID PRIMARY KEY, title TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`,
      this.sql`CREATE TABLE IF NOT EXISTS jarvis_messages (id BIGSERIAL PRIMARY KEY, conversation_id UUID NOT NULL REFERENCES jarvis_conversations(id), content JSONB NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW())`,
      this.sql`CREATE INDEX IF NOT EXISTS jarvis_messages_conversation ON jarvis_messages(conversation_id, id)`,
      this.sql`CREATE TABLE IF NOT EXISTS jarvis_memories (key TEXT PRIMARY KEY, category TEXT NOT NULL, value TEXT NOT NULL, updated_at TIMESTAMPTZ DEFAULT NOW())`,
      this.sql`CREATE TABLE IF NOT EXISTS jarvis_tasks (id UUID PRIMARY KEY, title TEXT NOT NULL, detail TEXT, due_date DATE, status TEXT DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT NOW())`,
      this.sql`CREATE TABLE IF NOT EXISTS jarvis_notes (id UUID PRIMARY KEY, title TEXT, body TEXT NOT NULL, tags TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ DEFAULT NOW())`,
      this.sql`CREATE TABLE IF NOT EXISTS jarvis_tool_logs (id BIGSERIAL PRIMARY KEY, entry JSONB NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW())`,
      this.sql`CREATE TABLE IF NOT EXISTS jarvis_leases (name TEXT PRIMARY KEY, owner UUID NOT NULL, expires_at TIMESTAMPTZ NOT NULL)`,
      this.sql`CREATE TABLE IF NOT EXISTS jarvis_login_attempts (ip_hash TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at TIMESTAMPTZ NOT NULL)`,
    ]);
  }
  async conversations() { return this.sql`SELECT * FROM jarvis_conversations ORDER BY updated_at DESC LIMIT 100`; }
  async conversation(id: string) { return (await this.sql`SELECT * FROM jarvis_conversations WHERE id=${id}`)[0]; }
  async createConversation() {
    const id = randomUUID();
    return (await this.sql`INSERT INTO jarvis_conversations(id,title) VALUES (${id},'Nueva conversación') RETURNING *`)[0];
  }
  async history(id: string): Promise<LlmMessage[]> {
    const rows = await this.sql`SELECT content FROM (SELECT id,content FROM jarvis_messages WHERE conversation_id=${id} ORDER BY id DESC LIMIT 80) recent ORDER BY id`;
    return rows.map((row) => row.content as LlmMessage);
  }
  async append(id: string, messages: LlmMessage[], title?: string) {
    await this.sql.transaction([
      ...messages.map((message) => this.sql`INSERT INTO jarvis_messages(conversation_id,content) VALUES (${id},${JSON.stringify(message)}::jsonb)`),
      this.sql`UPDATE jarvis_conversations SET updated_at=NOW(), title=COALESCE(${title || null},title) WHERE id=${id}`,
    ]);
  }
  async remember(category: string, key: string, value: string) {
    await this.sql`INSERT INTO jarvis_memories(key,category,value) VALUES (${key},${category},${value}) ON CONFLICT(key) DO UPDATE SET category=EXCLUDED.category,value=EXCLUDED.value,updated_at=NOW()`;
    return { category, key, value };
  }
  async recall(query: string) {
    const search = '%' + query + '%';
    return this.sql`SELECT * FROM jarvis_memories WHERE key ILIKE ${search} OR value ILIKE ${search} OR category ILIKE ${search} ORDER BY updated_at DESC LIMIT 30`;
  }
  async preferences() { return this.sql`SELECT key,value FROM jarvis_memories WHERE category IN ('preference','project') ORDER BY updated_at DESC LIMIT 20`; }
  async createTask(title: string, detail?: string, dueDate?: string) {
    return (await this.sql`INSERT INTO jarvis_tasks(id,title,detail,due_date) VALUES (${randomUUID()},${title},${detail || null},${dueDate || null}) RETURNING *`)[0];
  }
  async tasks(status = 'pending') { return this.sql`SELECT * FROM jarvis_tasks WHERE status=${status} ORDER BY due_date NULLS LAST,created_at LIMIT 100`; }
  async completeTask(id: string) { return (await this.sql`UPDATE jarvis_tasks SET status='completed' WHERE id=${id} RETURNING *`)[0]; }
  async createNote(title: string | undefined, body: string, tags: string[]) {
    return (await this.sql`INSERT INTO jarvis_notes(id,title,body,tags) VALUES (${randomUUID()},${title || null},${body},${tags.join(',')}) RETURNING *`)[0];
  }
  async searchNotes(query: string) {
    const search = '%' + query + '%';
    return this.sql`SELECT * FROM jarvis_notes WHERE COALESCE(title,'') ILIKE ${search} OR body ILIKE ${search} OR tags ILIKE ${search} ORDER BY created_at DESC LIMIT 20`;
  }
  async log(entry: unknown) { await this.sql`INSERT INTO jarvis_tool_logs(entry) VALUES (${JSON.stringify(entry)}::jsonb)`; }
  async acquire(owner: string) {
    const rows = await this.sql`INSERT INTO jarvis_leases(name,owner,expires_at) VALUES ('chat',${owner},NOW()+INTERVAL '300 seconds') ON CONFLICT(name) DO UPDATE SET owner=EXCLUDED.owner,expires_at=EXCLUDED.expires_at WHERE jarvis_leases.expires_at < NOW() RETURNING owner`;
    return rows.length > 0;
  }
  async release(owner: string) { await this.sql`DELETE FROM jarvis_leases WHERE name='chat' AND owner=${owner}`; }
  async allowLogin(ipHash: string) {
    await this.sql`DELETE FROM jarvis_login_attempts WHERE expires_at < NOW()`;
    const rows = await this.sql`INSERT INTO jarvis_login_attempts(ip_hash,count,expires_at) VALUES (${ipHash},1,NOW()+INTERVAL '5 minutes') ON CONFLICT(ip_hash) DO UPDATE SET count=jarvis_login_attempts.count+1 RETURNING count`;
    return Number(rows[0].count) <= 10;
  }
}
