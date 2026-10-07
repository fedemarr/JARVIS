import fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { getDb, closeDb } from './memory/db';
import { registerAuth, allowedOrigins } from './security/auth';
import { chatRoutes } from './api/routes/chatRoutes';
import { conversationRoutes } from './api/routes/conversationRoutes';
import { healthRoutes } from './api/routes/healthRoutes';
import { briefRoutes } from './api/routes/briefRoutes';
import { projectRoot, envPath } from './config';
import { N8nWorkflowRepository } from './memory/repositories/n8nWorkflowRepository';
import { loadRegistry } from './n8n/registry';
import { ProjectRepository } from './memory/repositories/projectRepository';
import { seedProjects } from './seed/projects';

dotenv.config({ path: envPath() });

const app = fastify({ logger: { redact: ['req.headers.cookie', 'req.headers.authorization'] }, bodyLimit: 128 * 1024 });

async function main() {
  try {
    registerAuth(app);
    getDb();

    await app.register(cors, {
      origin: allowedOrigins(),
    });

    app.register(chatRoutes, { prefix: '/api' });
    app.register(conversationRoutes, { prefix: '/api' });
    app.register(healthRoutes, { prefix: '/api' });
    app.register(briefRoutes, { prefix: '/api' });

    const n8nRepo = new N8nWorkflowRepository();
    const registryWorkflows = loadRegistry().workflows;
    for (const wf of registryWorkflows) {
      n8nRepo.upsert(wf);
    }
    console.log(`Seeded ${registryWorkflows.length} n8n workflows into DB.`);

    const seededProjects = process.env.JARVIS_MODE === 'cloud' ? 0 : seedProjects(new ProjectRepository());
    if (seededProjects > 0) console.log(`Seeded ${seededProjects} projects into DB.`);

    const frontendDist = path.join(projectRoot(), 'frontend', 'dist');
    if (fs.existsSync(frontendDist)) {
      await app.register(fastifyStatic, {
        root: frontendDist,
        prefix: '/',
      });
      app.setNotFoundHandler((request, reply) => {
        if (request.url.startsWith('/api/')) {
          reply.code(404).send({ message: 'Not found' });
          return;
        }
        reply.sendFile('index.html');
      });
      console.log(`Serving frontend build from ${frontendDist}`);
    }

    const port = parseInt(process.env.PORT || '3001', 10);
    const host = process.env.HOST || '127.0.0.1';
    await app.listen({ port, host });
    console.log(`JARVIS backend listening on http://localhost:${port}`);
    for (const signal of ['SIGTERM', 'SIGINT'] as const) {
      process.once(signal, async () => { await app.close(); closeDb(); });
    }
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
