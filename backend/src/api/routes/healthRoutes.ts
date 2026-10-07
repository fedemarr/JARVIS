import { FastifyInstance } from 'fastify';

export async function healthRoutes(fastify: FastifyInstance) {
  fastify.get('/health', async (request, reply) => {
    return {
      status: 'ok',
      provider: process.env.LLM_PROVIDER || 'unknown',
      model: process.env.AI_MODEL || 'unknown',
      // In future phases, add DB connection status, etc.
    };
  });
}