import { FastifyInstance } from 'fastify';
import { ConversationRepository } from '../../memory/repositories/conversationRepository';
import { MessageRepository } from '../../memory/repositories/messageRepository';

export async function conversationRoutes(fastify: FastifyInstance) {
  const conversationRepo = new ConversationRepository();
  const messageRepo = new MessageRepository();

  fastify.get('/conversations', async (request, reply) => {
    const conversations = conversationRepo.findAll();
    return conversations;
  });

  fastify.get<{ Params: { id: string } }>('/conversations/:id', async (request, reply) => {
    const { id } = request.params;
    const conversation = conversationRepo.findById(id);
    if (!conversation) {
      reply.status(404).send({ message: 'Conversation not found' });
      return;
    }
    const messages = messageRepo.findByConversationId(id);
    return { ...conversation, messages };
  });

  // TODO: Add DELETE /api/conversations/:id route in a later phase if needed
  // fastify.delete<{ Params: { id: string } }>('/conversations/:id', async (request, reply) => {
  //   const { id } = request.params;
  //   // Implement deletion logic
  // });
}