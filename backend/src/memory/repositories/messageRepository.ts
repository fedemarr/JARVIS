import { getDb } from '../db';
import { randomUUID } from 'crypto';
import { LlmMessage } from '../../../../shared/llm';

export interface StoredMessage {
  id: string;
  conversation_id: string;
  role: LlmMessage['role'];
  content: string; // JSON string of LlmMessage content
  created_at: string;
}

export class MessageRepository {
  private db = getDb();

  addMessage(conversationId: string, message: LlmMessage): StoredMessage {
    const id = randomUUID();
    const content = JSON.stringify(message); // Store the full LlmMessage object as JSON
    const stmt = this.db.prepare(
      'INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, ?, ?)'
    );
    stmt.run(id, conversationId, message.role, content);

    // Update conversation's updated_at timestamp
    this.db.prepare('UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(conversationId);

    return { id, conversation_id: conversationId, role: message.role, content, created_at: new Date().toISOString() };
  }

  findByConversationId(conversationId: string): LlmMessage[] {
    const stmt = this.db.prepare(
      'SELECT content FROM messages WHERE conversation_id = ? ORDER BY created_at ASC'
    );
    const rows = stmt.all(conversationId) as { content: string }[];
    return rows.map(row => JSON.parse(row.content) as LlmMessage);
  }

  // Potentially add methods for deleting messages, fetching last N messages, etc.
  // For now, findByConversationId is sufficient for loading history.
}