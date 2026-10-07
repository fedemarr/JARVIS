import { FastifyInstance } from 'fastify';
import { getLlmProvider } from '../../llm';
import { LlmMessage } from '../../../../shared/llm';
import { ConversationRepository } from '../../memory/repositories/conversationRepository';
import { MessageRepository } from '../../memory/repositories/messageRepository';
import { runAgentTurn, resolvePendingConfirmation, SseEmitter } from '../../agent/loop';
import { buildSystemPrompt } from '../../agent/systemPrompt';
import { getToolRegistry } from '../../tools';
import { randomUUID } from 'crypto';

interface ChatRequestBody {
  conversationId?: string;
  message: string;
}

interface ConfirmRequestBody {
  pendingId: string;
  approved: boolean;
}

// Limita el historial enviado al LLM para reducir latencia y costo.
// Conserva el mensaje nuevo (último) y los últimos N mensajes previos.
function trimHistory(history: LlmMessage[], maxMessages = 40): LlmMessage[] {
  if (history.length <= maxMessages) return history;
  return history.slice(-maxMessages);
}

export async function chatRoutes(fastify: FastifyInstance) {
  const llmProvider = getLlmProvider();
  const conversationRepo = new ConversationRepository();
  const messageRepo = new MessageRepository();
  const registry = getToolRegistry();

  fastify.post<{ Body: ChatRequestBody }>('/chat', {
    schema: { body: { type: 'object', required: ['message'], additionalProperties: false, properties: {
      conversationId: { type: 'string', format: 'uuid' },
      message: { type: 'string', minLength: 1, maxLength: 40000, pattern: '\\S' },
    } } },
  }, async (request, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const sendEvent: SseEmitter = (event, data) => {
      reply.raw.write(`event: ${event}\n`);
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      let { conversationId, message } = request.body;
      let currentConversation;

      if (conversationId) {
        currentConversation = conversationRepo.findById(conversationId);
        if (!currentConversation) {
          sendEvent('error', { message: `Conversation with ID ${conversationId} not found.` });
          reply.raw.end();
          return;
        }
      } else {
        currentConversation = conversationRepo.create('Nueva conversación');
        conversationId = currentConversation.id;
        sendEvent('conversation_started', { conversationId });
      }

      const history = messageRepo.findByConversationId(conversationId);
      const userMessage: LlmMessage = { role: 'user', text: message };
      history.push(userMessage);
      messageRepo.addMessage(conversationId, userMessage);

      const trimmed = trimHistory(history);

      const systemPrompt = buildSystemPrompt();

      const result = await runAgentTurn({
        provider: llmProvider,
        systemPrompt,
        history: trimmed,
        registry,
        emit: sendEvent,
      });

      for (const msg of result.added) {
        messageRepo.addMessage(conversationId, msg);
      }

      if (result.reason !== 'error' && currentConversation.title === 'Nueva conversación' && result.finalText) {
        const newTitle = result.finalText.slice(0, 50).trim();
        if (newTitle) {
          conversationRepo.updateTitle(conversationId, newTitle);
          sendEvent('conversation_title_updated', { conversationId, title: newTitle });
        }
      }

      sendEvent('done', { conversationId, messageId: randomUUID() });
      reply.raw.end();
    } catch (error: any) {
      console.error('Chat route error:', error);
      sendEvent('error', { message: error.message || 'An unknown error occurred.' });
      reply.raw.end();
    }
  });

  fastify.post<{ Body: ConfirmRequestBody }>('/confirm', {
    schema: { body: { type: 'object', required: ['pendingId', 'approved'], additionalProperties: false, properties: {
      pendingId: { type: 'string', format: 'uuid' }, approved: { type: 'boolean' },
    } } },
  }, async (request, reply) => {
    const { pendingId, approved } = request.body;
    if (!pendingId) {
      reply.status(400).send({ ok: false, message: 'pendingId es requerido' });
      return;
    }
    const resolved = resolvePendingConfirmation(pendingId, approved);
    if (!resolved) {
      reply.status(404).send({ ok: false, message: 'No hay una confirmación pendiente con ese pendingId' });
      return;
    }
    reply.send({ ok: true });
  });
}
